import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

await build({
  entryPoints: [
    'src/games/skyState.ts',
    'src/games/cargo/model.ts',
    'src/games/cargo/solver.ts',
    'src/games/cargo/levels.ts'
  ],
  outdir: 'output/models',
  bundle: true,
  format: 'esm',
  platform: 'node',
  outExtension: { '.js': '.mjs' },
  logLevel: 'silent'
});
const flight = await import(
  pathToFileURL(path.resolve('output/models/skyState.mjs'))
);
const { CARGO_LEVELS } = await import(
  pathToFileURL(path.resolve('output/models/cargo/levels.mjs'))
);
const cargo = await import(
  pathToFileURL(path.resolve('output/models/cargo/model.mjs'))
);
const { solveCargo } = await import(
  pathToFileURL(path.resolve('output/models/cargo/solver.mjs'))
);
const solutions = [];
for (const level of CARGO_LEVELS) {
  const board = cargo.parseCargo(level.map);
  const result = solveCargo(board, board.initial);
  assert(result, `${level.name} is solvable`);
  assert.equal(result.pushes, level.par);
  let state = board.initial,
    pushes = 0;
  for (const direction of result.moves) {
    const move = cargo.moveCargo(board, state, direction);
    assert(move);
    state = move.state;
    if (move.pushed) pushes++;
  }
  assert(cargo.cargoSolved(board, state));
  assert.equal(pushes, level.par);
  solutions.push(result.moves);
}
console.log(
  'PASS Models: all 12 cargo puzzles solvable with minimum-push par and legal routes'
);
let seed = 314;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const run = flight.createFlight(random);
run.mode = 'playing';
for (let tick = 0; tick < 5000 && run.mode === 'playing'; tick++) {
  const row = run.rows
    .filter((r) => !r.passed)
    .sort((a, b) => a.distance - b.distance)[0];
  if (run.lane !== row.safeLane)
    flight.steerFlight(run, Math.sign(row.safeLane - run.lane));
  if (run.charge === 100) flight.boostFlight(run);
  flight.stepFlight(run, 1 / 60, random);
}
assert.equal(run.mode, 'won');
assert(run.rings >= 40);
assert(run.combo >= 40);
assert.equal(run.shield, 1);
assert(run.score > 10000);
const death = flight.createFlight(() => 0);
death.mode = 'playing';
death.shield = 0;
death.rows[0].distance = 0.01;
death.rows[0].obstacles = [1];
flight.stepFlight(death, 1 / 60, () => 0);
assert.equal(death.mode, 'over');
console.log(
  'PASS Models: fair complete boosted flight, ring multipliers, sector goal, collision'
);

const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const browser = await (
  process.env.TEST_BROWSER === 'webkit' ? webkit : chromium
).launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const waitForFunction = page.waitForFunction.bind(page);
page.waitForFunction = (fn, arg, options) =>
  waitForFunction(fn, arg, { polling: 20, ...options });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  let frame = 0;
  window.requestAnimationFrame = () => ++frame;
  window.cancelAnimationFrame = () => {};
  let seed = 314;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
});
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const output = `output/3d-${process.env.TEST_BROWSER ?? 'chromium'}`;
await fs.mkdir(output, { recursive: true });
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const button = (name) => page.getByRole('button', { name, exact: true });
const screenshot = (name) =>
  page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
async function open(id) {
  await page.goto(`${base}/#${id}`);
  await page.waitForFunction(
    (id) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === id,
    id
  );
}
try {
  await page.goto(base);
  await page.waitForSelector('.hub-card');
  assert.equal(await page.locator('.hub-card').count(), 10);
  await button('3D').click();
  assert.equal(await page.locator('.hub-card').count(), 2);
  await screenshot('hub-3d');
  await open('sky');
  assert.equal((await state()).mode, 'ready');
  await screenshot('sky-ready');
  await button('Take flight →').tap();
  await button('BOOST READY ↑').tap();
  assert((await state()).boost > 0);
  for (
    let tick = 0;
    tick < 1500 && (await state()).mode === 'playing';
    tick++
  ) {
    const s = await state();
    const row = s.rows
      .filter((r) => !r.passed)
      .sort((a, b) => a.distance - b.distance)[0];
    if (s.lane < row.safeLane) await button('Steer right').tap();
    else if (s.lane > row.safeLane) await button('Steer left').tap();
    await advance(70);
    if (tick === 80) {
      await button('Pause').tap();
      const paused = await state();
      await advance(3000);
      assert.equal((await state()).distance, paused.distance);
      await screenshot('sky-paused');
      await button('Resume flight').tap();
    }
    if (tick === 150) await screenshot('sky-flight');
  }
  const completed = await state();
  assert.equal(completed.mode, 'won');
  assert(completed.rings >= 40);
  assert(completed.score > 5000);
  await screenshot('sky-sector');
  await button('Next sector →').tap();
  assert.equal((await state()).sector, 2);
  assert.equal((await state()).score, completed.score);
  await advance(35000);
  assert.equal((await state()).mode, 'over');
  await screenshot('sky-result');
  await button('Fly again →').tap();
  assert.equal((await state()).score, 0);
  assert.equal((await state()).mode, 'playing');
  const canLoseContext = await page.evaluate(() => {
    window.testContextExtension = document
      .querySelector('canvas')
      .getContext('webgl2')
      .getExtension('WEBGL_lose_context');
    if (!window.testContextExtension) return false;
    window.testContextExtension.loseContext();
    return true;
  });
  if (canLoseContext) {
    await page.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).mode === 'paused'
    );
    const beforeLoss = (await state()).distance;
    await advance(1000);
    assert.equal((await state()).distance, beforeLoss);
    await page.evaluate(() => window.testContextExtension.restoreContext());
    await page.waitForFunction(
      () =>
        !document.querySelector('canvas').getContext('webgl2').isContextLost()
    );
    await button('Resume flight').tap();
    assert.equal((await state()).mode, 'playing');
  }
  await button('Pause').tap();
  await button('Sound: Off').tap();
  assert.equal(await button('Sound: On').count(), 1);
  console.log(
    'PASS Browser Sky: rendered scene, touch steering, boost, pause, full sector, next sector, collision and retry'
  );

  await open('cargo');
  await screenshot('cargo-ready');
  await page.keyboard.press('ArrowRight');
  await advance(180);
  assert.equal((await state()).pushes, 1);
  await button('Undo').tap();
  assert.equal((await state()).pushes, 0);
  assert.equal((await state()).moves, 0);
  await button('Hint').tap();
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).hintDirection
  );
  assert.equal((await state()).hintDirection, 'right');
  await advance(140);
  await screenshot('cargo-hint');
  for (let index = 0; index < CARGO_LEVELS.length; index++) {
    await page.getByLabel('Choose cargo puzzle').selectOption(String(index));
    for (const direction of solutions[index]) {
      await page.keyboard.press(
        `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`
      );
      await advance(140);
    }
    assert.equal((await state()).mode, 'won');
    assert.equal((await state()).pushes, CARGO_LEVELS[index].par);
    if (index === 0 || index === 7 || index === 11)
      await screenshot(`cargo-solved-${index + 1}`);
    await button('Undo').tap();
    assert.equal((await state()).mode, 'playing');
    await page.keyboard.press(
      `Arrow${solutions[index].at(-1)[0].toUpperCase()}${solutions[index].at(-1).slice(1)}`
    );
    await advance(140);
    assert.equal((await state()).mode, 'won');
  }
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).mode, 'won');
  assert.equal(Object.keys((await state()).stars).length, 12);
  await button('Play from the beginning').tap();
  assert.equal((await state()).level, 1);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    );
  }
  console.log(
    'PASS Browser Cargo: worker hint, legal moves, undo, all 12 completions, stars, save/reload, replay and responsive layouts'
  );
  await button('Back').tap();
  await page.waitForSelector('.hub-card');
  assert.equal(
    await page.evaluate(() => typeof window.render_game_to_text),
    'undefined'
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
