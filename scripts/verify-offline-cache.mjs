import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://games.example';
const moduleURL = `${origin}/assets/game.js`;
const entries = [
  { request: new Request(`${origin}/`), response: new Response('<div id="app">Cached shell</div>') },
  { request: new Request(moduleURL), response: new Response('export const ready = true;', { headers: { Vary: 'Origin', 'Content-Type': 'text/javascript' } }) }
];
const lookups = [];
// Model the Cache API's documented Vary matching; execute the real worker handler below.
const cache = {
  async match(query, options = {}) {
    const request = typeof query === 'string' ? new Request(new URL(query, origin)) : query;
    lookups.push({ url: request.url, options });
    const entry = entries.find((item) => item.request.url === request.url);
    if (!entry) return undefined;
    const vary = entry.response.headers.get('Vary');
    if (vary && !options.ignoreVary) {
      for (const header of vary.split(',').map((value) => value.trim())) {
        if (header === '*' || entry.request.headers.get(header) !== request.headers.get(header)) return undefined;
      }
    }
    return entry.response.clone();
  }
};
const moduleRequest = new Request(moduleURL, { headers: { Origin: origin } });
assert.equal(await cache.match(moduleRequest), undefined, 'Default Vary matching must reproduce the precache miss');
assert(await cache.match(moduleRequest, { ignoreVary: true }), 'Static module must remain available despite Origin difference');

const handlers = new Map();
let networkRequests = 0;
let networkAvailable = false;
const source = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8')
  .replace('__VERSION__', 'test')
  .replace('__PRECACHE__', JSON.stringify(['/', '/assets/game.js']));
vm.runInNewContext(source, {
  self: { location: { origin }, addEventListener: (name, handler) => handlers.set(name, handler) },
  caches: { open: async () => cache },
  URL,
  fetch: async () => {
    networkRequests++;
    if (!networkAvailable) throw new Error('Network is unavailable');
    return new Response('Network response');
  }
});
async function fetchThroughWorker(request) {
  let response;
  let intercepted = false;
  handlers.get('fetch')({ request, respondWith: (pending) => { intercepted = true; response = pending; } });
  return { intercepted, response: await response };
}
const offlineModule = await fetchThroughWorker(moduleRequest);
assert(offlineModule.intercepted);
assert.equal(await offlineModule.response.text(), 'export const ready = true;');
assert.equal(networkRequests, 0, 'Offline module response must not contact the server');

// Canonical shell lookup avoids an /index.html response redirected by Pages.
const navigation = await fetchThroughWorker({ url: `${origin}/index.html`, method: 'GET', mode: 'navigate' });
assert.equal(await navigation.response.text(), '<div id="app">Cached shell</div>');
assert.equal(lookups.at(-1).url, `${origin}/`);
assert.equal(networkRequests, 0);
assert.equal((await fetchThroughWorker(new Request(`${origin}/decision`, { method: 'POST' }))).intercepted, false);
assert.equal((await fetchThroughWorker(new Request('https://laya.example/health'))).intercepted, false);

networkAvailable = true;
const uncached = await fetchThroughWorker(new Request(`${origin}/uncached.js`));
assert.equal(await uncached.response.text(), 'Network response');
assert.equal(networkRequests, 1, 'Uncached requests retain their network fallback');
console.log('Offline cache checks passed: Vary regression, module cache hit, canonical navigation, request boundaries, network fallback.');
