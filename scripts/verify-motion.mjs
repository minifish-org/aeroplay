import { assert, bundle, context, engine, harness, mechanics, models } from './verify-lib.mjs';

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
} finally {
  await browser.close();
}
assert.equal(failures.length, 0, failures.join('; '));
