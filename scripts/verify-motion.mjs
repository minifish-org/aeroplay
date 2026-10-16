import { assert, bundle, context, engine, games, harness, mechanics, models } from './verify-lib.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const { Stage, Group } = await import('data:text/javascript;base64,' + Buffer.from(await bundle("export { Stage } from './src/core/stage'; export { Group } from 'three';")).toString('base64'));
const failures = [];
async function check(name, run) {
  try { await run(); console.log('PASS ' + name); }
  catch (error) { failures.push(name); console.error('FAIL ' + name + ': ' + error.message); }
}
function motionStage(reduced = false) {
  return Object.assign(Object.create(Stage.prototype), { reducedMotion: reduced, tweens: [], particles: [] });
}
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-9, message + ` (${actual} vs ${expected})`);

await check('A new lean cannot strand a blocked-move offset', () => {
  const stage = motionStage(), shell = new Group();
  shell.position.set(.07, 0, .04);
  shell.rotation.x = .12;
  stage.tween(shell, { x: 0, z: 0, rx: 0 }, 'failure');
  stage.advance(.08);
  stage.tween(shell, { rx: -.09 }, 'settle');
  stage.advance(.5);
  near(shell.position.x, 0, 'Interrupted courier returns to its authoritative x');
  near(shell.position.z, 0, 'Interrupted courier returns to its authoritative z');
  near(shell.rotation.x, -.09, 'New lean reaches its target');
});
await check('Uniform settling preserves every initial axis at time zero', () => {
  const stage = motionStage(), shell = new Group();
  shell.scale.set(1.08, .82, 1);
  stage.tween(shell, { scale: 1 }, 'failure');
  stage.advance(0);
  near(shell.scale.x, 1.08, 'The initial horizontal compression is preserved');
  near(shell.scale.y, .82, 'The initial vertical compression is preserved');
  near(shell.scale.z, 1, 'The initial depth is preserved');
  stage.advance(.5);
  for (const axis of ['x', 'y', 'z']) near(shell.scale[axis], 1, 'Settled ' + axis + ' scale reaches one');
});
await check('Replacing one scale axis preserves the other settling axes', () => {
  const stage = motionStage(), shell = new Group();
  shell.scale.set(.5, .3, .1);
  stage.tween(shell, { scale: 1 }, 'settle');
  stage.advance(.08);
  stage.tween(shell, { sx: 2 }, 'score');
  stage.advance(.5);
  near(shell.scale.x, 2, 'Replacement x scale completes');
  near(shell.scale.y, 1, 'Unreplaced y scale completes');
  near(shell.scale.z, 1, 'Unreplaced z scale completes');
});
await check('Reduced motion settles only requested channels without a queue', () => {
  const stage = motionStage(true), shell = new Group();
  shell.scale.set(1, .25, .5);
  stage.tween(shell, { sx: 2, rz: .3 }, 'score');
  near(shell.scale.x, 2, 'Requested scale applies directly');
  near(shell.scale.y, .25, 'Unrequested shape ratio stays intact');
  near(shell.rotation.z, .3, 'Requested rotation applies directly');
  assert.equal(stage.animating, false);
});

const m = await models();
const lights = m.glightsout.createLightsOutModel(null, () => .25);
for (const cell of m.glightsout.solveLights(lights.board)) assert(lights.act(cell));
assert.equal(lights.mode, 'won', 'Lights fixture is a genuinely completed puzzle');
const sudoku = m.gsudoku.createSudokuModel();
sudoku.elapsedSeconds = 123;
const solution = [...m.gsudoku.PUZZLES[0].solution].map(Number);
for (let index = 0; index < solution.length; index++) if (!sudoku.board[index]) {
  assert(sudoku.act({ type: 'select', index }));
  assert(sudoku.act({ type: 'value', value: solution[index] }));
}
assert.equal(sudoku.mode, 'won', 'Sudoku fixture is the completed existing puzzle');
const match = m.gmatch3.createMatch3Model();
match.score = match.target();
match.moves = 18;
match.finish();
assert.equal(match.mode, 'won', 'Match-3 fixture meets its existing score target');
const completed = [
  { game: 'lightsout', key: 'state-v2', save: lights.saved(), title: 'Lights out', next: 'Next puzzle', verify(state) {
    assert.deepEqual(state.board, lights.board);
    assert.equal(state.moves, lights.moves);
    assert.equal(state.stars, lights.stars());
  } },
  { game: 'sudoku', key: 'state-v2', save: sudoku.saved(), title: 'Puzzle solved', next: 'Next puzzle', verify(state) {
    assert.deepEqual(state.board, solution);
    assert.equal(state.elapsedSeconds, 123);
    assert.equal(state.bestSeconds, 123);
  } },
  { game: 'match3', key: 'run', save: match.saved(), title: 'Level cleared', next: 'Next level', verify(state) {
    assert.deepEqual(state.grid, match.grid);
    assert.equal(state.score, match.target());
    assert.equal(state.moves, 18);
    assert.equal(state.target, match.target());
  } },
];

const browser = await (await engine()).launch({ headless: true });
try {
  await check('Production and development share explicit motion policy and native 2048 movement', async () => {
    const targets = [
      { name: 'production', url: process.env.TEST_PRODUCTION_URL ?? 'http://127.0.0.1:4196' },
      { name: 'development', url: process.env.TEST_DEVELOPMENT_URL ?? 'http://127.0.0.1:4194' },
    ];
    const cases = [
      { name: 'default', query: '', preference: 'reduce', reduced: false },
      { name: 'full', query: 'full', preference: 'reduce', reduced: false },
      { name: 'reduce', query: 'reduce', preference: 'no-preference', reduced: true },
      { name: 'system-reduced', query: 'system', preference: 'reduce', reduced: true },
      { name: 'system-full', query: 'system', preference: 'no-preference', reduced: false },
    ];
    const fixture = { grid: [[32, 32, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, moves: 0 };
    const records = []; let expected;
    await mkdir('output/motion-parity', { recursive: true });
    try {
      for (const sample of cases) {
        // Seed spawning only. Native requestAnimationFrame remains untouched.
        const ctx = await context(browser, { reducedMotion: sample.preference });
        await ctx.addInitScript(() => {
          let seed = 314;
          Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
          window.__resetMotionSeed = () => { seed = 314; };
        });
        try {
          for (const target of targets) {
            const h = await harness(ctx, target.url, `output/motion-parity/${target.name}-${sample.name}`);
            const record = { target: target.name, url: target.url, policy: sample.name, preference: sample.preference, expectedReduced: sample.reduced };
            records.push(record);
            try {
              const route = new URL(target.url); route.searchParams.delete('motion');
              if (sample.query) route.searchParams.set('motion', sample.query);
              route.hash = 'hub';
              await h.page.goto(route.href);
              const scripts = await h.page.locator('script[type="module"][src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
              if (target.name === 'production') assert(scripts.some(source => /^\/assets\/.*\.js$/.test(source)) && !scripts.includes('/@vite/client'), 'Motion policy is tested on a built production bundle');
              else assert(scripts.includes('/@vite/client'), 'Development parity is tested on the actual Vite dev server');
              const css = await h.page.locator('.hub-card').first().evaluate(card => ({ mode: document.documentElement.dataset.motion, transition: getComputedStyle(card).transitionDuration }));
              record.css = css;
              await h.open('2048', { 'aeroplay:game2048:state': fixture });
              await h.page.waitForTimeout(400);
              const mounted = await h.state(); record.actualReduced = mounted.motion.reduced;
              assert.equal(await h.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), sample.preference === 'reduce', 'The browser OS preference is actually emulated');
              await h.shot('mounted');
              assert.equal(mounted.motion.reduced, sample.reduced, `${target.name} ${sample.name}: explicit URL policy is consistent with the approved default`);
              assert.equal(css.mode, sample.reduced ? 'reduce' : 'full', 'The DOM and Three scene share one motion policy');
              const cssDurations = css.transition.split(',').map(value => parseFloat(value));
              assert(sample.reduced ? cssDurations.every(value => value === 0) : cssDurations.some(value => value > 0), 'Computed hub transitions follow the explicit policy independently of OS preference');
              // The model captures this generator; reset its original closure after UUID creation.
              await h.page.evaluate(() => window.__resetMotionSeed());
              await h.key('ArrowRight');
              const early = await h.page.locator('canvas').evaluate(canvas => canvas.toDataURL()), start = await h.state();
              await h.page.waitForTimeout(65);
              const middle = await h.page.locator('canvas').evaluate(canvas => canvas.toDataURL()), during = await h.state();
              record.frames = { early: start.renderer.frames, middle: during.renderer.frames };
              record.visibleIntermediate = middle !== early;
              if (sample.reduced) {
                assert.equal(start.visual.active, false, 'Explicit reduced motion applies the final letterpress pose immediately');
                assert.equal(start.motion.tweens, 0);
                assert.equal(middle, early, 'Reduced presentation has no intermediate movement');
                assert.equal(during.renderer.frames, start.renderer.frames, 'Reduced presentation is already idle');
              } else {
                assert.equal(start.visual.active, true, 'Full motion begins its bounded native transition');
                assert(during.renderer.frames > start.renderer.frames, 'Native RAF continues after the logical move');
                assert.notEqual(middle, early, 'Full motion renders visible intermediate frames without advanceTime');
              }
              await h.page.waitForTimeout(450);
              const settled = await h.state(); record.frames.final = settled.renderer.frames;
              assert.equal(settled.grid[0][3], 64); assert.equal(settled.score, 64); assert.equal(settled.moves, 1);
              assert.equal(settled.visual.active, false, 'The native merge reaches its final pose');
              assert.equal(settled.motion.tweens, 0);
              record.outcome = mechanics(settled);
              if (expected) assert.deepEqual(mechanics(settled), expected, 'All motion policies/builds preserve the same seeded logical outcome');
              else expected = mechanics(settled);
              await h.page.waitForTimeout(150);
              assert.equal((await h.state()).renderer.frames, settled.renderer.frames, 'A settled native board returns to idle');
              await h.shot('settled');
              if (sample.name === 'default') {
                record.defaultGames = [];
                for (const game of games) {
                  await h.open(game);
                  assert.equal((await h.state()).motion.reduced, false, `${target.name}: ${game} keeps approved full motion on the ordinary URL`);
                  record.defaultGames.push(game);
                }
              }
              record.passed = true;
            } finally { h.clean(); }
          }
        } finally { await ctx.close(); }
      }
    } finally { await writeFile('output/motion-parity/report.json', JSON.stringify(records, null, 2)); }
  });
  const ctx = await context(browser, { deterministic: true });
  const h = await harness(ctx);
  await check('Paused deterministic replay freezes an unfinished letterpress merge', async () => {
    await h.open('2048', { 'aeroplay:game2048:state': { grid: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, moves: 0 } });
    await h.key('ArrowLeft');
    await h.page.getByLabel('More options', { exact: true }).click();
    await h.button('Pause').click();
    assert.equal((await h.state()).mode, 'paused');
    const before = mechanics(await h.state());
    const pixels = await h.page.locator('canvas').evaluate(canvas => canvas.toDataURL());
    await h.advance(600);
    assert.deepEqual(mechanics(await h.state()), before, 'Paused simulation stays unchanged');
    assert(await h.page.locator('canvas').evaluate(canvas => canvas.toDataURL()) === pixels, 'Paused pixels stay unchanged while the merge is unfinished');
    await h.button('Resume').click();
    await h.advance(400);
    assert(await h.page.locator('canvas').evaluate(canvas => canvas.toDataURL()) !== pixels, 'Resume finishes the preserved visual transition');
  });
  for (const fixture of completed) await check(fixture.game + ' restores its completed result without a fresh completion animation', async () => {
    await h.open(fixture.game, { ['aeroplay:' + fixture.game + ':' + fixture.key]: fixture.save });
    const restored = await h.state();
    assert.equal(restored.mode, 'won', 'The saved result remains completed on mount');
    fixture.verify(restored);
    assert(await h.page.getByRole('heading', { name: fixture.title, exact: true }).isVisible(), 'The actual result panel is visible');
    assert(await h.button(fixture.next).isVisible(), 'The completed result keeps its next-puzzle action');
    const pixels = await h.pixels();
    await h.advance(400);
    const after = await h.state();
    assert.deepEqual(mechanics(after), mechanics(restored), 'Advancing a restored result preserves its saved mechanics');
    fixture.verify(after);
    assert.equal(restored.motion.tweens, 0, 'Mounting a completed save must not queue a new completion celebration');
    assert.equal(await h.pixels(), pixels, 'The restored result is already in its final visual pose');
  });
  h.clean();
  await ctx.close();
  const live = await context(browser, { reducedMotion: 'no-preference' });
  const moving = await harness(live, undefined, 'output/spatial-review/motion');
  const canvasPixels = () => moving.page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  async function completesVisibleMotion(name, input) {
    const before = await canvasPixels();
    await input();
    const early = await canvasPixels(), start = await moving.state();
    await moving.page.waitForTimeout(65);
    const middle = await canvasPixels(), during = await moving.state();
    assert(during.renderer.frames > start.renderer.frames, name + ': the native loop advances presentation frames');
    assert.notEqual(middle, early, name + ': the movement has visible intermediate frames');
    await moving.page.waitForTimeout(450);
    const final = await canvasPixels();
    assert.notEqual(final, before, name + ': the resulting board is visible');
    await moving.shot(name + '-settled');
    return { early, final };
  }
  await check('Native puzzle motion finishes without advanceTime or a second input', async () => {
    await moving.open('2048', { 'aeroplay:game2048:state': { grid: [[32, 32, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, moves: 0 } });
    await moving.page.waitForTimeout(400);
    const merge = await completesVisibleMotion('2048', () => moving.key('ArrowRight'));
    assert.notEqual(merge.early, merge.final, '2048 finishes its slide and impression after the logical merge');
    const settled = await moving.state();
    assert.equal(settled.grid[0][3], 64);
    await moving.page.waitForTimeout(150);
    assert.equal((await moving.state()).renderer.frames, settled.renderer.frames, 'A finished board returns to an idle renderer');

    await moving.open('lightsout');
    await moving.page.waitForTimeout(400);
    const original = (await moving.state()).board;
    await completesVisibleMotion('lightsout', () => moving.pick(12));
    assert.equal((await moving.state()).board[12], 1 - original[12], 'The projected curved lamp still accepts the normal input');

    await moving.open('sudoku');
    await moving.pick({ type: 'select', index: 2 });
    await moving.page.waitForTimeout(400);
    await completesVisibleMotion('sudoku', () => moving.button('4').click());
    assert.equal((await moving.state()).board[2], 4, 'The printed digit retains its original model meaning');
  });
  moving.clean();
  await live.close();
} finally {
  await browser.close();
}
assert.equal(failures.length, 0, failures.join('; '));
