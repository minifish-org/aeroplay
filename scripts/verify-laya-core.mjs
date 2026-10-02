import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import vm from 'node:vm';

// These tests run the actual core modules with a small DOM surface and controlled
// network replies. They do not start a browser or call an external service.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  stdin: {
    contents: `export * from './src/core/laya.ts';
      export * from './src/core/laya-bridge.ts';
      export * from './src/core/laya-controls.ts';
      export * from './src/core/storage.ts';`,
    resolveDir: projectRoot,
    loader: 'ts'
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'layaCore',
  platform: 'browser',
  target: 'es2022',
  plugins: [{
    name: 'settings-ui-fixture',
    setup(plugin) {
      plugin.onResolve({ filter: /\/laya-settings$/ }, () => ({
        path: 'settings-ui-fixture', namespace: 'fixture'
      }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: `export function createLayaSettingsButton() {
          return { button: document.createElement('button'), dispose() {} };
        }
        export function openLayaSettings() {}`,
        loader: 'js'
      }));
    }
  }]
});
const bundledCore = result.outputFiles[0].text;

class Element extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.className = '';
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.parent = null;
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.inert = false;
  }
  append(...elements) {
    for (const element of elements) {
      element.parent = this;
      this.children.push(element);
    }
  }
  insertBefore(element, reference) {
    const index = this.children.indexOf(reference);
    element.parent = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, element);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(element => element !== this);
    this.parent = null;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  set innerHTML(value) {
    this.children = [];
    const stack = [this];
    for (const tag of value.matchAll(/<(\/?)([a-z][a-z0-9-]*)([^>]*)>/gi)) {
      if (tag[1]) { stack.pop(); continue; }
      const element = new Element(tag[2]);
      element.className = /class="([^"]*)"/.exec(tag[3])?.[1] ?? '';
      stack.at(-1).append(element);
      if (!['input', 'br', 'hr'].includes(tag[2])) stack.push(element);
    }
  }
  querySelector(selector) {
    const tokens = selector.split(/\s+/);
    const matches = (element, token) => token.startsWith('.')
      ? element.className.split(/\s+/).includes(token.slice(1))
      : element.tagName === token;
    const descendants = element => element.children.flatMap(child => [child, ...descendants(child)]);
    let candidates = [this];
    for (const token of tokens)
      candidates = candidates.flatMap(element => descendants(element).filter(child => matches(child, token)));
    return candidates[0] ?? null;
  }
}

class Document extends EventTarget {
  hidden = false;
  body = new Element('body');
  createElement(tag) { return new Element(tag); }
}

const health = (model = 'Laya test model') => ({
  ready: true, protocol: 'aeroplay-laya-v1', model,
  games: ['sky', 'snake', 'flappy', 'tetris']
});
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => data
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}
async function flush() {
  for (let index = 0; index < 10; index++) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function harness(fetchHandler = () => response(health()), initialData = {}) {
  const stored = new Map(Object.entries(initialData));
  const calls = [];
  const intervals = new Map();
  const timeouts = new Map();
  let timerId = 0;
  let clock = 0;
  const window = new EventTarget();
  window.setInterval = callback => { const id = ++timerId; intervals.set(id, callback); return id; };
  window.clearInterval = id => intervals.delete(id);
  window.setTimeout = (callback, delay) => { const id = ++timerId; timeouts.set(id, { callback, delay }); return id; };
  window.clearTimeout = id => timeouts.delete(id);
  const document = new Document();
  const navigator = { onLine: true };
  const context = vm.createContext({
    window, document, navigator, location: { protocol: 'https:' },
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value)
    },
    fetch(url, options) {
      calls.push({ url, options });
      return Promise.resolve(fetchHandler(url, options));
    },
    URL, AbortController, DOMException, HTMLElement: Element,
    performance: { now: () => clock },
    console, Event, Error, TypeError
  });
  vm.runInContext(bundledCore, context);
  return {
    api: context.layaCore, calls, stored, intervals, timeouts, window, document, navigator,
    async tick(milliseconds = 1000) {
      clock += milliseconds;
      for (const callback of intervals.values()) callback();
      await flush();
    },
    timeout(delay) {
      const timer = [...timeouts.values()].find(timer => timer.delay === delay);
      assert.ok(timer, `Expected a ${delay} ms timeout`);
      timer.callback();
    }
  };
}

const observation = {
  key: 'turn-1', context: 'A visible test position.',
  question: 'Choose a move.', choices: { '0': 'Move left', '1': 'Move right' }
};
async function connect(h, address = 'https://laya.example') {
  assert.equal(await h.api.configureLaya(address), true);
  assert.equal(h.api.getLayaConnection().state, 'ready');
}
function gameFixture(h, options = {}) {
  const root = new Element();
  const shell = new Element(); shell.className = 'game-shell';
  const gameBar = new Element(); gameBar.className = 'game-bar';
  const area = new Element(); area.className = 'game-area';
  shell.append(gameBar, area); root.append(shell);
  const moves = [];
  let paused = false;
  let pauseCount = 0;
  const bridgeOff = h.api.registerLayaGame({
    game: 'snake',
    observe: () => options.observe?.() ?? observation,
    act: (choice, key) => {
      if (paused || options.accept === false) return false;
      moves.push({ choice, key }); return true;
    },
    start: () => { paused = false; },
    pause: () => { paused = true; pauseCount++; },
    resume: () => { paused = false; },
    isPaused: () => paused,
    isFinished: () => false,
    intervalMs: 0
  });
  const controls = h.api.mountLayaControls(root, 'laya', () => {});
  return {
    shell, area, moves, controls,
    get pauseCount() { return pauseCount; },
    click: selector => shell.querySelector(selector).click(),
    dispose() { controls.dispose(); bridgeOff(); }
  };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('Unconfigured and offline human play send no external requests', async () => {
  const h = harness();
  assert.equal(h.api.getLayaConnection().state, 'unconfigured');
  h.window.dispatchEvent(new Event('online'));
  h.window.dispatchEvent(new Event('pageshow'));
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(await h.api.checkLayaConnection(), false);
  assert.equal(h.calls.length, 0);
  h.navigator.onLine = false;
  assert.equal(await h.api.configureLaya('https://laya.example'), false);
  assert.equal(h.api.getLayaConnection().state, 'offline');
  assert.equal(h.calls.length, 0);
});

test('Addresses reject mixed content, credentials and non-service URLs', () => {
  const h = harness();
  assert.equal(h.api.normalizeLayaAddress(' https://laya.example/service/// '), 'https://laya.example/service');
  assert.equal(h.api.normalizeLayaAddress(''), '');
  for (const address of ['http://laya.example', 'javascript:alert(1)', 'https://user:pass@laya.example', 'https://laya.example/?key=secret', 'https://laya.example/#game'])
    assert.throws(() => h.api.normalizeLayaAddress(address));
  assert.equal(h.calls.length, 0);
});

test('Bad health and incompatible protocols never become ready', async () => {
  for (const payload of [
    { ...health(), ready: false },
    { ...health(), protocol: 'another-protocol' },
    { ...health(), games: null },
    { ...health(), games: [123] },
    { ...health(), model: '' },
    { ...health(), model: null },
    null
  ]) {
    const h = harness(() => response(payload));
    assert.equal(await h.api.configureLaya('https://laya.example'), false, JSON.stringify(payload));
    assert.equal(h.api.getLayaConnection().state, 'unavailable');
  }
});

test('A stale health reply cannot overwrite a newer service', async () => {
  const old = deferred(); const current = deferred();
  const h = harness(url => url.includes('old.example') ? old.promise : current.promise);
  const oldCheck = h.api.configureLaya('https://old.example');
  const currentCheck = h.api.configureLaya('https://current.example');
  assert.equal(h.calls[0].options.signal.aborted, true);
  current.resolve(response(health('Current model')));
  assert.equal(await currentCheck, true);
  old.resolve(response(health('Old model')));
  assert.equal(await oldCheck, false);
  assert.equal(h.api.getLayaConnection().model, 'Current model');
  assert.equal(h.api.getLayaAddress(), 'https://current.example');
});

test('Clearing settings or going offline supersedes pending health replies', async () => {
  for (const action of ['clear', 'offline']) {
    const pending = deferred();
    const h = harness(() => pending.promise);
    const check = h.api.configureLaya('https://laya.example');
    if (action === 'clear') await h.api.configureLaya('');
    else {
      h.navigator.onLine = false;
      h.window.dispatchEvent(new Event('offline'));
    }
    pending.resolve(response(health()));
    assert.equal(await check, false);
    assert.equal(h.api.getLayaConnection().state, action === 'clear' ? 'unconfigured' : 'offline');
    assert.equal(h.calls.length, 1);
  }
});

test('Timed-out and explicitly cancelled health probes reject late replies', async () => {
  for (const action of ['timeout', 'abort']) {
    const pending = deferred();
    const h = harness(() => pending.promise);
    const controller = new AbortController();
    const probe = h.api.probeLaya('https://laya.example', controller.signal);
    if (action === 'timeout') h.timeout(5000);
    else controller.abort();
    pending.resolve(response(health()));
    await assert.rejects(probe, undefined, action);
    assert.equal(h.calls[0].options.signal.aborted, true);
    assert.equal(h.timeouts.size, 0);
  }
});

test('Decision requests preserve the protocol and accept only an offered choice', async () => {
  const h = harness(url => response(url.endsWith('/health') ? health() : { choice: '1' }));
  await connect(h);
  assert.equal(await h.api.requestLayaMove('snake', observation, new AbortController().signal), '1');
  const call = h.calls.at(-1);
  assert.equal(call.url, 'https://laya.example/decision');
  assert.equal(call.options.credentials, 'omit');
  assert.equal(call.options.redirect, 'error');
  assert.deepEqual(JSON.parse(call.options.body), {
    game: 'snake', context: observation.context,
    question: { type: 'choice', instructions: observation.question, criteria: observation.choices }
  });
  assert.equal(h.timeouts.size, 0);
  await assert.rejects(h.api.requestLayaMove('unsupported', observation, new AbortController().signal));
  assert.equal(h.calls.length, 2);
});

test('Invalid and inherited choices cannot pass protocol validation', async () => {
  for (const choice of [2, null, undefined, 'unknown', 'toString', '__proto__']) {
    const h = harness(url => response(url.endsWith('/health') ? health() : { choice }));
    await connect(h);
    await assert.rejects(h.api.requestLayaMove('snake', observation, new AbortController().signal), /unavailable move/);
  }
});

test('HTTP failures never supply a decision or advertise a ready service', async () => {
  const unavailable = harness(() => response(health(), 503));
  assert.equal(await unavailable.api.configureLaya('https://laya.example'), false);
  assert.equal(unavailable.api.getLayaConnection().state, 'unavailable');
  for (const status of [429, 500]) {
    const h = harness(url => url.endsWith('/health') ? response(health()) : response({ choice: '0' }, status));
    await connect(h);
    await assert.rejects(h.api.requestLayaMove('snake', observation, new AbortController().signal));
  }
});

test('Caller cancellation, service changes and timeout reject late choices', async () => {
  for (const action of ['abort', 'change-service', 'timeout']) {
    const pending = deferred();
    const h = harness(url => url.endsWith('/health') ? response(health()) : pending.promise);
    await connect(h);
    const controller = new AbortController();
    const move = h.api.requestLayaMove('snake', observation, controller.signal);
    if (action === 'abort') controller.abort();
    else if (action === 'change-service') await h.api.configureLaya('https://new.example');
    else h.timeout(8000);
    pending.resolve(response({ choice: '0' }));
    await assert.rejects(move, undefined, action);
    if (action !== 'change-service') assert.equal(h.calls[1].options.signal.aborted, true);
    assert.equal(h.timeouts.size, 0);
  }
});

test('Captured storage ownership survives later profile switches', () => {
  const h = harness();
  const human = h.api.namespace('snake');
  human.save('best', 10);
  h.api.setPlayProfile('laya');
  const assisted = h.api.namespace('snake');
  assisted.save('best', 30);
  h.api.setPlayProfile('human');
  assisted.save('best', 99);
  human.save('best', 20);
  assert.equal(human.load('best', 0), 20);
  assert.equal(assisted.load('best', 0), 99);
  assert.equal(h.stored.get('aeroplay:snake:best'), '20');
  assert.equal(h.stored.get('aeroplay:laya:snake:best'), '99');
  h.api.save('laya-settings', { endpoint: 'https://laya.example' });
  assert.equal(h.stored.has('aeroplay:laya-settings'), true);
  assert.equal(h.stored.has('aeroplay:laya:snake:laya-settings'), false);
});

test('The controller serializes decisions and cancels on navigation disposal', async () => {
  const pending = deferred();
  const h = harness(url => url.endsWith('/health') ? response(health()) : pending.promise);
  await connect(h);
  const game = gameFixture(h);
  game.controls.startWatching();
  await h.tick(); await h.tick();
  assert.equal(h.calls.filter(call => call.url.endsWith('/decision')).length, 1);
  assert.equal(game.area.inert, true);
  game.dispose();
  assert.equal(h.calls.at(-1).options.signal.aborted, true);
  assert.equal(h.intervals.size, 0);
  pending.resolve(response({ choice: '0' }));
  await flush();
  assert.equal(game.moves.length, 0);
  assert.equal(h.api.isLayaControlling(), false);
});

test('Pause/resume generation rejects the old request before accepting a new one', async () => {
  const requests = [];
  const h = harness(url => {
    if (url.endsWith('/health')) return response(health());
    const request = deferred(); requests.push(request); return request.promise;
  });
  await connect(h);
  const game = gameFixture(h);
  game.controls.startWatching();
  game.click('.laya-pause');
  assert.equal(game.shell.dataset.layaStatus, 'paused');
  game.click('.laya-pause');
  await h.tick();
  assert.equal(requests.length, 2);
  requests[0].resolve(response({ choice: '0' }));
  await flush();
  assert.equal(game.moves.length, 0);
  requests[1].resolve(response({ choice: '1' }));
  await flush();
  assert.equal(game.moves.length, 1);
  assert.equal(game.moves[0].choice, '1');
  assert.equal(game.shell.dataset.layaDecisions, '1');
  game.dispose();
});

test('Taking over cancels pending machine input and restores human input', async () => {
  const pending = deferred();
  const h = harness(url => url.endsWith('/health') ? response(health()) : pending.promise);
  await connect(h);
  const game = gameFixture(h);
  game.controls.startWatching();
  game.click('.laya-takeover');
  pending.resolve(response({ choice: '0' }));
  await h.tick();
  assert.equal(game.moves.length, 0);
  assert.equal(game.area.inert, false);
  assert.equal(h.api.isLayaControlling(), false);
  assert.equal(game.shell.dataset.player, 'human');
  game.dispose();
});

test('Hidden pages and lost connections suppress pending machine decisions', async () => {
  for (const action of ['hidden', 'offline']) {
    const pending = deferred();
    const h = harness(url => url.endsWith('/health') ? response(health()) : pending.promise);
    await connect(h);
    const game = gameFixture(h);
    game.controls.startWatching();
    if (action === 'hidden') {
      h.document.hidden = true;
      h.document.dispatchEvent(new Event('visibilitychange'));
    } else {
      h.navigator.onLine = false;
      h.window.dispatchEvent(new Event('offline'));
    }
    pending.resolve(response({ choice: '0' }));
    await h.tick();
    assert.equal(game.moves.length, 0);
    assert.equal(game.pauseCount, 1);
    assert.equal(game.shell.dataset.layaStatus, action === 'hidden' ? 'paused' : 'disconnected');
    game.dispose();
  }
});

test('An invalid model decision pauses instead of applying a fallback', async () => {
  const h = harness(url => response(url.endsWith('/health') ? health() : { choice: 'unknown' }));
  await connect(h);
  const game = gameFixture(h);
  game.controls.startWatching();
  await flush();
  assert.equal(game.moves.length, 0);
  assert.equal(game.pauseCount, 1);
  assert.equal(game.shell.dataset.layaStatus, 'disconnected');
  assert.equal(game.shell.dataset.layaDecisions, '0');
  game.dispose();
});

test('A stale game observation never counts as an applied decision', async () => {
  const h = harness(url => response(url.endsWith('/health') ? health() : { choice: '0' }));
  await connect(h);
  const game = gameFixture(h, { accept: false });
  game.controls.startWatching();
  await flush();
  assert.equal(game.moves.length, 0);
  assert.equal(game.shell.dataset.layaDecisions, '0');
  assert.equal(game.shell.dataset.layaStatus, 'playing');
  game.dispose();
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
else console.log(`Verified ${tests.length} Laya core cases without external requests.`);
