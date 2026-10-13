import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const engines = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const engine = process.env.TEST_BROWSER ?? 'chromium';
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const browser = await engines[engine].launch({ headless: true });
const failures = [], results = [];
await mkdir('output/player-fairness', { recursive: true });

async function run(game, ai) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => {
    let seed = 1;
    window.resetGameSeed = () => { seed = 1; };
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    localStorage.clear();
    document.addEventListener('click', event => {
      if (event.target.closest('.player-watch')) window.resetGameSeed();
    }, true);
  });
  const engineSource = (await readFile('src/core/engine.ts', 'utf8'))
    .replace('this.rafId = requestAnimationFrame(this.tick);', '');
  const engineCode = (await transform(engineSource, { loader: 'ts', format: 'esm' })).code;
  await context.route(/\/src\/core\/engine\.ts(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: engineCode,
  }));
  if (process.env.TEST_LEGACY_MAIN === '1') await context.route(/\/src\/main\.ts(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript', body: "import '/output/player-fairness/legacy-main.ts';",
  }));
  if (process.env.TEST_LEGACY_MAIN === '1') await context.route(/\/src\/games\/(flappy|snake|tetris)\.ts(?:\?.*)?$/, route => {
    const game = new URL(route.request().url()).pathname.split('/').at(-1);
    return route.fulfill({ contentType: 'application/javascript', body: `export { default } from '/output/player-fairness/legacy/${game}';` });
  });
  await context.route(/\/src\/core\/local-decision\.ts(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export async function prepareLocalDecision() { return { model: 'Held TAMEV test', backend: 'wasm', threads: 1, loadMs: 0, initializations: 1, modelBytes: 1 }; }
      export function requestLocalDecision(o, signal) { return new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }); }); }
      export function getLocalDecisionDiagnostics() { return {}; }`,
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#${game}`);
  await page.waitForFunction(() => !!window.render_game_to_text);
  if (ai) {
    const watch = page.locator('.player-watch');
    await watch.click();
    await page.waitForFunction(() => document.querySelector('.game-shell')?.dataset.player === 'ai');
  } else {
    await page.locator('.control-row button').first().click();
  }
  const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.evaluate(() => window.advanceTime(1000));
  const after = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.deepEqual(errors, []);
  await context.close();
  return { before, after };
}

try {
  for (const game of ['flappy', 'snake', 'tetris']) {
    const human = await run(game, false), ai = await run(game, true);
    const mechanics = s => game === 'flappy'
      ? { mode: s.mode, bird: s.bird, pipes: s.pipes, distance: s.distance, score: s.score, passed: s.passed }
      : game === 'snake'
        ? { mode: s.mode, segments: s.segments, direction: s.direction, food: s.food, bonusTime: s.bonusTime, score: s.score }
        : { mode: s.mode, board: s.board, piece: s.piece, score: s.score, lines: s.lines, held: s.held, next: s.next };
    let error = '';
    try {
      assert.deepEqual(mechanics(ai.before), mechanics(human.before), `${game}: same initial state`);
      assert.deepEqual(mechanics(ai.after), mechanics(human.after), `${game}: same clock and mechanics while inference is pending`);
    } catch (failure) { error = failure.message; failures.push(game); }
    results.push({ game, human, ai, error });
    console.log(`${error ? 'FAIL' : 'PASS'} ${game}: identical one-second simulation with no additional input`);
  }
  await writeFile(`output/player-fairness/clock-${engine}.json`, JSON.stringify(results, null, 2) + '\n');
  assert.deepEqual(failures, [], 'Human and AI share one simulation clock');
} finally { await browser.close(); }
