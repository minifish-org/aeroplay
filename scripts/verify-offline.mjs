import { assert, games, engine, harness, browserName, fullMatch, until, touchStickDash } from './verify-lib.mjs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, mkdir, rm, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { resolveConfig } from 'vite';

const template = await readFile('public/service-worker.js', 'utf8'), origin = 'https://games.example', moduleURL = origin + '/assets/game.js';
const entries = [{ request: new Request(origin + '/'), response: new Response('Cached shell') }, { request: new Request(moduleURL), response: new Response('export const ready = true;', { headers: { Vary: 'Origin' } }) }], lookups = [], handlers = new Map();
const cache = {
  async match(query, options = {}) {
    const request = typeof query === 'string' ? new Request(new URL(query, origin)) : query;
    lookups.push({ url: request.url, options });
    const found = entries.find(item => item.request.url === request.url);
    if (!found) return;
    const vary = found.response.headers.get('Vary');
    if (vary && !options.ignoreVary) for (const field of vary.split(',')) if (found.request.headers.get(field) !== request.headers.get(field)) return;
    return found.response.clone();
  }
};
const request = new Request(moduleURL, { headers: { Origin: origin } }); assert.equal(await cache.match(request), undefined); assert(await cache.match(request, { ignoreVary: true }));
let network = 0, available = false;
vm.runInNewContext(template.replace('__VERSION__', 'test').replace('__PRECACHE__', JSON.stringify(['/', '/assets/game.js'])), {
  self: { location: { origin }, addEventListener: (name, handler) => handlers.set(name, handler) }, caches: { open: async () => cache }, URL, Request,
  fetch: async () => {
    network++;
    if (!available) throw new Error('Offline');
    return new Response('Network response');
  },
});
async function worker(request) {
  let pending, intercepted = false;
  handlers.get('fetch')({
    request, respondWith: value => {
      intercepted = true;
      pending = value;
    }
  });
  return { intercepted, response: await pending };
}
assert.equal(await (await worker(request)).response.text(), 'export const ready = true;'); assert.equal(network, 0);
assert.equal(await (await worker({ url: origin + '/index.html', method: 'GET', mode: 'navigate' })).response.text(), 'Cached shell'); assert.equal(lookups.at(-1).url, origin + '/'); assert.equal(network, 0);
assert.equal((await worker(new Request(origin + '/decision', { method: 'POST' }))).intercepted, false); assert.equal((await worker(new Request('https://external.example/health'))).intercepted, false);
available = true; assert.equal(await (await worker(new Request(origin + '/uncached.js'))).response.text(), 'Network response'); assert.equal(network, 1);
const config = await resolveConfig({ configFile: resolve('vite.config.ts') }, 'build'), plugin = config.plugins.find(plugin => plugin.name === 'offline-precache'); assert(plugin);
const fixture = await mkdtemp(join(tmpdir(), 'aeroplay-cache-')), cwd = process.cwd();
try {
  await mkdir(join(fixture, 'public'));
  await mkdir(join(fixture, 'dist'));
  await writeFile(join(fixture, 'public/service-worker.js'), template);
  process.chdir(fixture);
  const bundle = { 'index.html': { type: 'asset', source: '<html>Initial</html>' }, 'assets/game-same-hash.js': {} }, generate = async () => {
    await plugin.writeBundle({ dir: join(fixture, 'dist') }, bundle);
    return readFile('dist/service-worker.js', 'utf8');
  };
  await writeFile('public/character.svg', '<svg><circle r="10"/></svg>');
  const initial = await generate();
  await writeFile('public/character.svg', '<svg><circle r="20"/></svg>');
  const artwork = await generate();
  assert.notEqual(initial, artwork, 'Artwork-only updates change cache version');
  assert.equal(await generate(), artwork, 'Identical content retains its version');
  await writeFile('public/_headers', '/\n  Cache-Control: public, no-transform\n');
  const headers = await generate();
  assert.notEqual(headers, artwork, 'Response-policy changes invalidate cached HTML');
  assert(!JSON.parse(headers.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]).includes('/_headers'), 'Pages configuration is not a fetchable precache asset');
  bundle['index.html'].source = '<html>Updated CSP</html>';
  assert.notEqual(await generate(), headers, 'HTML-only updates change cache version');
} finally {
  process.chdir(cwd);
  await rm(fixture, { recursive: true, force: true });
}
console.log('PASS actual SW Vary/canonical navigation/request boundaries/fallback and asset/HTML/stable version build hooks');
async function inventory(directory,extension){const entries=await readdir(directory,{withFileTypes:true});return(await Promise.all(entries.map(entry=>entry.isDirectory()?inventory(join(directory,entry.name),extension):entry.name.endsWith(extension)?[join(directory,entry.name)]:[]))).flat();}
const sourceFiles=await inventory('src','.ts'),cssFiles=await inventory('styles','.css');
assert.deepEqual(cssFiles.map(file=>file.split('/').at(-1)).sort(),['game.css','hub.css','tokens.css']);
const packageJSON=JSON.parse(await readFile('package.json','utf8'));assert.deepEqual(Object.keys(packageJSON.dependencies).sort(),['@huggingface/tokenizers','onnxruntime-web','three']);
assert.deepEqual((await readdir('src/games',{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort(),[...games].sort());
assert.equal((await Promise.all(sourceFiles.map(file=>readFile(file,'utf8')))).join('\n').match(/new WebGLRenderer\(/g).length,1,'Only the globalstage creates a renderer');
console.log('PASS shared styles, exactly8 directories, one renderer and onlyThree rendering dependency');

const dist = resolve('dist'), sw = await readFile(join(dist, 'service-worker.js'), 'utf8'), cacheName = sw.match(/const CACHE = ['"]([^'"]+)/)[1];
const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
assert.match(await readFile(join(dist, '_headers'), 'utf8'), /^\/\n\s+Cache-Control: [^\n]*no-transform/m, 'Published HTML opts out of injected external scripts');
assert(!assets.includes('/_headers') && !assets.includes('/_redirects'), 'Unserved deployment configuration is excluded from offline resources');
assert(assets.includes('/')); assert(assets.includes('/models/tamev-nano/model_int8.onnx')); assert(assets.some(file => file.endsWith('.wasm'))); assert(assets.some(file => file.includes('planner.worker')));
for (const game of games) assert(assets.some(file => new RegExp(`/${game}[^/]*\\.(?:js|png|webp)$`).test(file) || file.includes(`/previews/${game}.`)), `${game} has local precached assets`);
const files = await readdir(join(dist, 'assets')); assert(!files.some(file => /pixi|snake|tetris|maze/.test(file)), 'No deleted render/game bundles');
const previewRequests = [];
const overrides = new Map(), mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/index.html') {
    response.writeHead(308, { Location: '/' });
    response.end();
    return;
  }
  try {
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    assert(!file.includes('..'));
    const bytes = overrides.get(pathname) ?? await readFile(join(dist, file));
    response.setHeader('Content-Type', mime['.' + file.split('.').at(-1)] ?? 'application/octet-stream');
    if (pathname === '/service-worker.js') response.setHeader('Cache-Control', 'no-store');
    if (pathname.startsWith('/assets/previews/')) {
      response.setHeader('Cache-Control', 'public, max-age=14400');
      previewRequests.push({ path: pathname, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), requestCacheControl: request.headers['cache-control'] ?? null });
    }
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
const listen = port => new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const stop = () => new Promise((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve());
  server.closeAllConnections();
});
await listen(0); const port = server.address().port, url = `http://127.0.0.1:${port}`;
const profile = await mkdtemp(join(tmpdir(), 'aeroplay-offline-profile-')), type = await engine();
const options = { headless: true, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'allow' };
async function verifyWarmPreviewUpdate() {
  const path = '/assets/previews/lightsout.jpg', oldBytes = await readFile(join(dist, path)), newBytes = await readFile(join(dist, 'assets/previews/2048.jpg'));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.notEqual(hash(oldBytes), hash(newBytes), 'Warm update fixture changes actual JPEG bytes at the same URL');
  const warmProfile = await mkdtemp(join(tmpdir(), 'aeroplay-warm-preview-'));
  const warm = await type.launchPersistentContext(warmProfile, options), page = await warm.newPage();
  const folder = `output/offline-${browserName}`; await mkdir(folder, { recursive: true });
  const updatedCache = cacheName + '-warm-preview', report = { path, oldSHA256: hash(oldBytes), newSHA256: hash(newBytes), initialCache: cacheName, updatedCache };
  const save = () => writeFile(join(folder, 'warm-preview-update.json'), JSON.stringify(report, null, 2));
  const bodyHash = async name => page.evaluate(async ({ name, path }) => {
    const response = await (await caches.open(name)).match(path);
    if (!response) return null;
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
  }, { name, path });
  const imageHash = async () => page.evaluate(async path => {
    const image = [...document.images].find(image => new URL(image.src).pathname === path);
    if (!image) return null;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, canvas.width, canvas.height).data))].map(value => value.toString(16).padStart(2, '0')).join('');
  }, path);
  try {
    overrides.set('/warm-preview.html', Buffer.from(`<img src="${path}" alt="Warm HTTP preview">`));
    overrides.set(path, oldBytes);
    // Warm the browser HTTP cache before any service worker can intercept this image.
    await page.goto(url + '/warm-preview.html'); await page.locator('img').evaluate(image => image.decode());
    report.httpWarmRequests = previewRequests.filter(request => request.path === path);
    assert(report.httpWarmRequests.length > 0, 'Same-path preview was fetched into the long-lived HTTP cache');
    report.oldImagePixelsSHA256 = await imageHash();
    await page.goto(url + '/#hub'); await page.waitForSelector('.hub-card');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await until(() => page.evaluate(async name => (await (await caches.open(name)).keys()).length, cacheName), () => page.waitForTimeout(50), count => count === assets.length, 300, 'First install precaches every resource after HTTP warming');
    report.initialCachedSHA256 = await bodyHash(cacheName); assert.equal(report.initialCachedSHA256, report.oldSHA256);
    const requestStart = previewRequests.length;
    overrides.set(path, newBytes);
    overrides.set('/service-worker.js', Buffer.from(sw.replace(cacheName, updatedCache)));
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await until(() => page.evaluate(async name => {
      const keys = await caches.keys();
      return keys.includes(name) && keys.filter(key => key.startsWith('aeroplay-')).length === 1 && (await (await caches.open(name)).keys()).length;
    }, updatedCache), () => page.waitForTimeout(50), count => count === assets.length, 300, 'Actual updated worker activates its complete cache and removes the old one');
    report.updatedCachedSHA256 = await bodyHash(updatedCache);
    report.updateNetworkRequests = previewRequests.slice(requestStart).filter(request => request.path === path);
    report.activeCacheNames = await page.evaluate(() => caches.keys());
    await save();
    assert.equal(report.updatedCachedSHA256, report.newSHA256, 'Updated SW must not copy the stale same-path JPEG from the warm HTTP cache');
    report.expectedNewPixelsSHA256 = await page.evaluate(async base64 => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), value => value.charCodeAt(0))], { type: 'image/jpeg' }));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, canvas.width, canvas.height).data))].map(value => value.toString(16).padStart(2, '0')).join('');
    }, newBytes.toString('base64'));
    await stop(); await page.reload(); await page.waitForSelector('.hub-card');
    report.offlineImagePixelsSHA256 = await imageHash();
    assert.equal(report.offlineImagePixelsSHA256, report.expectedNewPixelsSHA256, 'Offline hub decodes the updated same-path preview after a warm upgrade');
    assert.notEqual(report.offlineImagePixelsSHA256, report.oldImagePixelsSHA256, 'Offline hub no longer shows the previous preview artwork');
    report.offlineCachedSHA256 = await bodyHash(updatedCache); assert.equal(report.offlineCachedSHA256, report.newSHA256);
    await page.screenshot({ path: join(folder, 'warm-preview-updated-offline.png') });
    report.passed = true; await save();
    console.log('PASS warm HTTP-cache same-path JPEG update: actual SW upgrade replaces bytes and offline hub displays new artwork');
  } finally {
    await warm.close(); await rm(warmProfile, { recursive: true, force: true });
    overrides.clear();
    if (!server.listening) await listen(port);
  }
}
let ctx, matchFailure;
try {
  await verifyWarmPreviewUpdate();
  ctx = await type.launchPersistentContext(profile, options);
  let h = await harness(ctx, url, `output/offline-${browserName}`);
  await h.open('hub');
  await h.page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const readCache = () => h.page.evaluate(async () => {
    const names = await caches.keys(), name = names.find(name => name.startsWith('aeroplay-'));
    return name ? (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname) : [];
  });
  const cached = await until(readCache, () => h.page.waitForTimeout(100), entries => assets.every(asset => entries.includes(asset)), 300, 'All precached assets become readable before cold restart');
  const prepared = await h.page.evaluate(async () => ({ cacheNames: await caches.keys(), root: !!(await caches.match('/')), counts: await Promise.all((await caches.keys()).map(async name => [name, (await (await caches.open(name)).keys()).length])), controller: navigator.serviceWorker.controller?.scriptURL, registrations: (await navigator.serviceWorker.getRegistrations()).map(r => ({ active: r.active?.scriptURL, state: r.active?.state })) }));
  await writeFile(`output/offline-${browserName}/prepared-cache.json`, JSON.stringify({ cacheName, assets, cached, origin: url, prepared }, null, 2));
  for (const asset of assets) assert(cached.includes(asset), `Precache includes ${asset}`);
  assert.equal(await h.page.evaluate(async () => (await caches.match('/')).redirected), false, 'Canonical shell is not a redirected response');
  assert.equal(await h.page.evaluate(() => typeof window.render_game_to_text), 'undefined', 'Only the hub was warmed before cold restart');
  const security = await ctx.newPage(), blocked = [];
  security.on('request', request => {
    if (request.url().startsWith('https://external.example/')) blocked.push(request);
  });
  await security.goto(url);
  const violation = await security.evaluate(() => new Promise(resolve => {
    document.addEventListener('securitypolicyviolation', event => {
      if (event.blockedURI === 'https://external.example/blocked-verifier.js') resolve(event.effectiveDirective);
    }, { once: true });
    const script = document.createElement('script');
    script.src = 'https://external.example/blocked-verifier.js';
    document.head.append(script);
    setTimeout(() => resolve('No CSP violation'), 1500);
  }));
  assert.match(violation, /^script-src/);
  assert.equal(await security.evaluate(() => !!window.injectedScriptRan), false);
  assert(blocked.every(request => /csp|content security policy/i.test(request.failure()?.errorText ?? '')), 'Injected external script is blocked before network dispatch');
  await security.close();
  h.clean();
  await ctx.close();
  ctx = null;
  await stop();
  ctx = await type.launchPersistentContext(profile, options);
  h = await harness(ctx, url, `output/offline-${browserName}`);
  await h.page.goto(`${url}/#hub`);
  await h.page.waitForSelector('.hub-card');
  assert.equal(await h.page.locator('.hub-card').count(), 8);
  await h.page.reload();
  await h.page.waitForSelector('.hub-card');
  const fixture2048 = { grid: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, moves: 0 };
  for (const game of games) {
    await h.open(game, game === '2048' ? { 'aeroplay:game2048:state': fixture2048 } : undefined);
    await h.page.reload();
    await h.page.waitForFunction(game => window.render_game_to_text && JSON.parse(window.render_game_to_text()).game === game, game);
    await h.dismiss();
    if (game === '2048') {
      await h.swipe('left');
      assert.equal((await h.state()).score, 4);
      await h.page.reload();
      await h.page.waitForFunction(() => window.render_game_to_text);
      assert.equal((await h.state()).score, 4);
    }
    if (game === 'lightsout') {
      await h.button('Hint').click();
      const index = (await h.state()).hinted;
      assert(index >= 0);
      await h.pick(index);
      assert.equal((await h.state()).moves, 1);
    }
    if (game === 'flappy') {
      await h.startFlappy();
      await h.advance(120);
      assert.equal((await h.state()).mode, 'playing');
      await h.button('Pause').click();
    }
    if (game === 'sudoku') {
      const s = await h.state(), index = s.board.findIndex((value, i) => !value && !s.givens.includes(i));
      await h.pick({ type: 'select', index });
      await h.action('hint').click();
      assert((await h.state()).board[index] > 0);
    }
    if (game === 'match3') {
      await h.button('Hint').click();
      for (const point of (await h.state()).hinted) await h.pick(point);
      await h.advance(2000);
      assert((await h.state()).score > 0);
    }
    if (game === 'cargo') {
      await h.button('Hint').click();
      await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hintDirection === 'right');
      await h.button('Right').click();
      assert.equal((await h.state()).pushes, 1);
    }
    if(game!=='pushball')assert.equal((await h.state()).ai.info,null,'Cold human games and hints do not initialize TAMEV');
    if (game === 'sky') {
      await h.button('Start flight').click();
      await h.action('right').click();
      assert.equal((await h.state()).lane, 2);
      await h.advance(100);
      assert((await h.state()).distance > 0);
      await h.button('Pause').click();
    }
    if (game === 'pushball') {
      try {
        const completed = await fullMatch(h);
        assert(completed.ai.decisions >= 4, 'Cold-offline match used multiple actual model inputs');
        assert.equal(completed.ai.info.initializations, 1);
      } catch (error) { matchFailure = error; }
      assert.equal((await h.state()).ai.info?.initializations, 1, 'Actual model remains resident for the independent offline checks');
      if (!matchFailure && browserName === 'chromium') {
        await h.shot('pushball-complete-match'); await h.button('Play again').click();
        await h.page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.mode === 'playing' && s.kickoff === 0 && !document.querySelector('[data-action="dash"]').disabled; });
        await touchStickDash(ctx, h); await h.button('Pause').click();
      }
    }
    await h.shot(game + '-cold-offline');
  }
  await h.open('lightsout');
  await h.button('Watch TAMEV').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'won', null, { timeout: 30000 });
  assert.equal((await h.state()).ai.info.initializations, 1);
  assert((await h.state()).player.decisions > 0);
  await h.open('hub');
  h.clean();
  console.log(`PASS cold browser restart with stopped server: eight game loads, hints, native input, saves and real resident TAMEV (${cached.length} cached resources)`);
  if (matchFailure) console.log('FAIL full Pushball match retained; continuing independent cache-update checks');
  await listen(port);
  const updatedCache = cacheName + '-update', marker = '/verify-update.txt';
  overrides.set(marker, Buffer.from('Updated precache marker'));
  overrides.set('/service-worker.js', Buffer.from(sw.replace(cacheName, updatedCache).replace(/const ASSETS = \[[\s\S]*?\];/, 'const ASSETS = ' + JSON.stringify([...assets, marker]) + ';')));
  await h.page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await until(() => h.page.evaluate(() => caches.keys()), () => h.page.waitForTimeout(100), keys => keys.includes(updatedCache) && keys.filter(key => key.startsWith('aeroplay-')).length === 1, 300, 'Updated cache activates and replaces the old cache');
  assert.equal(await h.page.evaluate(async marker => (await fetch(marker)).text(), marker), 'Updated precache marker');
  assert(!(await h.page.evaluate(() => caches.keys())).includes(cacheName), 'Activation removed old cache');
  await stop();
  await h.page.reload();
  await h.page.waitForSelector('.hub-card');
  assert.equal(await h.page.evaluate(async marker => (await fetch(marker)).text(), marker), 'Updated precache marker');
  h.clean();
  console.log('PASS real SW update activates new cache, removes obsolete cache, and serves new assets offline');
  if (matchFailure) throw matchFailure;
} finally {
  if (ctx) await ctx.close();
  if (server.listening) await stop();
  await rm(profile, { recursive: true, force: true });
}
