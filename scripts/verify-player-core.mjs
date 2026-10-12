import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: "export * from './src/core/player.ts'; export * from './src/core/storage.ts'; export * from './src/core/ai-planning-state.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'iife', globalName: 'playerCore',
  plugins: [{ name: 'model-fixture', setup(build) {
    build.onResolve({ filter: /\/(ai-model|local-decision|ai-planning)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export class AIPlanner { dispose() {} } export async function prepareTamev() {} export function requestLocalDecision(o, signal) { return globalThis.fixtureDecision(o, signal); }', loader: 'js' }));
  } }],
});
const stored = new Map(), intervals = new Map(), listeners = new Set();
let nextTimer = 1, testClock = 0;
const env = {
  AbortController, DOMException, Error, console, structuredClone,
  Date: class extends Date { static now() { return testClock; } },
  document: { hidden: false, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) },
  window: { setInterval: callback => { const id = nextTimer++; intervals.set(id, callback); return id; }, clearInterval: id => intervals.delete(id) },
  localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
  fixtureDecision: async () => ({ choice: 'go' }),
};
vm.createContext(env); vm.runInContext(bundle.outputFiles[0].text, env);
const { Player, HumanPlayer, setPlayProfile, namespace, planningSignature } = env.playerCore;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture(ai = true, planned = false) {
  const replies = [], calls = [], state = { revision: 0, value: 0, paused: false, finished: false, pauses: 0, resumes: 0 };
  const controller = ai ? { type: 'ai', choose: (observation, signal) => new Promise((resolve, reject) => replies.push({ observation, signal, resolve, reject })) } : new HumanPlayer();
  const player = new Player(controller);
  const port = player.connect({
    game: 'fixture', planning: planned ? () => ({ game: 'lightsout', epoch: 'fixture', board: [state.value] }) : undefined, observe: () => ({ key: String(state.revision), context: 'Visible value', question: 'Choose a control', choices: { go: 'Increase' }, inputs: { go: { amount: 1 } } }),
    isCurrent: key => key === String(state.revision),
    apply: input => { if (state.paused || state.finished) return false; calls.push(input); state.value += input.amount; ++state.revision; return true; },
    start() {}, pause: () => { state.paused = true; ++state.pauses; }, resume: () => { state.paused = false; ++state.resumes; },
    isFinished: () => state.finished, isPaused: () => state.paused,
  });
  player.start(); return { player, port, replies, calls, state };
}
let checks = 0;
async function check(name, operation) { await operation(); ++checks; console.log(`PASS ${name}`); }
await check('Human and AI deliver the same input through the same rules', async () => {
  const human = fixture(false), ai = fixture();
  assert.equal(human.port.human({ amount: 1 }), true);
  assert.equal(ai.port.human({ amount: 10 }), false);
  ai.replies[0].resolve('go'); await flush();
  assert.equal(ai.state.value, human.state.value); assert.deepEqual(ai.calls, human.calls);
  assert.equal(ai.player.decisions, 1); human.player.dispose(); ai.player.dispose();
});
await check('Pending inference is bounded and never pauses the game', async () => {
  const f = fixture(); await f.player.tick(); await f.player.tick();
  assert.equal(f.replies.length, 1); assert.equal(f.state.pauses, 0); assert.equal(f.player.status, 'playing'); f.player.dispose();
});
await check('Failed inference leaves the simulation running and avoids a retry spin', async () => {
  const f = fixture(); f.replies[0].reject(new Error('Slow model failure')); await flush(); await f.player.tick();
  assert.equal(f.player.status, 'playing'); assert.equal(f.state.pauses, 0); assert.equal(f.replies.length, 1); assert.match(f.player.error, /failure/); f.player.dispose();
});
await check('Stale replies and unavailable inputs cannot mutate the game', async () => {
  const stale = fixture(); ++stale.state.revision; stale.replies[0].resolve('go'); await flush(); assert.equal(stale.state.value, 0); assert.equal(stale.player.discarded, 1); stale.player.dispose();
  const invalid = fixture(); invalid.replies[0].resolve('unknown'); await flush(); assert.equal(invalid.state.value, 0); assert.equal(invalid.state.pauses, 0); invalid.player.dispose();
});
await check('Explicit pause/resume aborts old input and requests a fresh observation', async () => {
  const f = fixture(); f.player.pause(); assert.equal(f.replies[0].signal.aborted, true); assert.equal(f.state.pauses, 1);
  f.player.resume(); f.replies[0].resolve('go'); f.replies[1].resolve('go'); await flush(); assert.equal(f.state.value, 1); f.player.dispose();
});
await check('Takeover returns human authority without resetting game state', async () => {
  const f = fixture(); f.state.value = 7; f.player.takeOver(); assert.equal(f.replies[0].signal.aborted, true);
  assert.equal(f.port.human({ amount: 2 }), true); f.replies[0].resolve('go'); await flush(); assert.equal(f.state.value, 9); assert.equal(f.player.type, 'human'); f.player.dispose();
});
await check('Game over, backgrounding and navigation reject pending replies', async () => {
  const f = fixture(); f.state.finished = true; await f.player.tick(); f.replies[0].resolve('go'); await flush(); assert.equal(f.player.status, 'finished'); assert.equal(f.state.value, 0); f.player.dispose();
  const hidden = fixture(); env.document.hidden = true; [...listeners].forEach(listener => listener()); assert.equal(hidden.replies[0].signal.aborted, true); hidden.replies[0].resolve('go'); await flush(); assert.equal(hidden.state.value, 0); hidden.player.dispose(); env.document.hidden = false;
  const removed = fixture(); removed.player.dispose(); removed.replies[0].resolve('go'); await flush(); assert.equal(removed.state.value, 0);
});
await check('AI ownership survives takeover and later navigation', async () => {
  const claim = setPlayProfile('human'), runStore = namespace('fixture'); runStore.save('score', 3);
  const player = new Player(new HumanPlayer(), claim); player.watchAI(); runStore.save('score', 7); player.takeOver(); runStore.save('score', 8);
  setPlayProfile('human'); namespace('fixture').save('score', 4); runStore.save('score', 9);
  assert.equal(stored.get('aeroplay:fixture:score'), '4'); assert.equal(stored.get('aeroplay:ai:fixture:score'), '9'); player.dispose();
});
await check('A selected plan delivers one ordinary input at a time', async () => {
  const f = fixture(true, true);
  const expected = value => planningSignature({ game: 'lightsout', epoch: 'fixture', board: [value] });
  f.replies[0].resolve({ label: 'Two ordinary controls', steps: [{ input: { amount: 1 }, expected: expected(0) }, { input: { amount: 1 }, expected: expected(1) }] });
  await flush(); assert.equal(f.state.value, 0);
  await f.player.tick(); assert.equal(f.state.value, 1);
  await f.player.tick(); assert.equal(f.state.value, 1);
  testClock += 80; void f.player.tick(); await flush(); assert.equal(f.state.value, 2);
  assert.deepEqual(f.calls.map(input => input.amount), [1, 1]); f.player.dispose();
});
await check('A divergent board discards the remaining plan before any input', async () => {
  const f = fixture(true, true);
  f.replies[0].resolve({ label: 'One control', steps: [{ input: { amount: 1 }, expected: planningSignature({ game: 'lightsout', epoch: 'fixture', board: [0] }) }] });
  await flush(); f.state.value = 9; void f.player.tick(); await flush();
  assert.equal(f.state.value, 9); assert.equal(f.player.discarded, 1); f.player.dispose();
});
await check('Takeover clears an accepted plan without restarting the board', async () => {
  const f = fixture(true, true);
  f.replies[0].resolve({ label: 'One control', steps: [{ input: { amount: 1 }, expected: planningSignature({ game: 'lightsout', epoch: 'fixture', board: [0] }) }] });
  await flush(); f.player.takeOver(); testClock += 100; await f.player.tick();
  assert.equal(f.state.value, 0); assert.equal(f.port.human({ amount: 3 }), true); assert.equal(f.state.value, 3); f.player.dispose();
});
assert.equal(intervals.size, 0); assert.equal(listeners.size, 0);
console.log(`PASS ${checks} player lifecycle and ownership cases; no remaining timers or listeners`);
