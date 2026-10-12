import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: "export * from './src/core/ai-plans'; export * from './src/core/ai-planning-state'; export * from './src/games/cargo/model'; export * from './src/games/cargo/levels'; export * from './src/games/lightsLogic'; export * from './src/games/tetrisLogic';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const sudoku = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'.split('').map(Number);
const lights = Array(25).fill(0); api.applyToggle(lights, 0, 0); api.applyToggle(lights, 2, 2);
const board = api.parseCargo(api.CARGO_LEVELS[0].map);
const fixtures = [
  { game: 'flappy', epoch: '0', time: 0, y: 220, velocity: -100, pipes: [{ x: 300, gapY: 155, gap: 145, scored: false }], passed: 0 },
  { game: 'snake', epoch: 'false', tick: 1, segments: [{ x: 8, y: 10 }, { x: 9, y: 10 }, { x: 10, y: 10 }], direction: { x: 1, y: 0 }, food: { x: 13, y: 12 }, bonus: null, size: 20, wrap: false },
  { game: 'tetris', epoch: '1', board: Array.from({ length: 20 }, () => Array(10).fill(0)), piece: { matrix: [[4, 4], [4, 4]], x: 3, y: 0 } },
  { game: 'maze', epoch: '1', size: 2, position: { x: 0, y: 0 }, stars: [{ x: 0, y: 1 }], walls: [[{ top: true, right: false, bottom: false, left: true }, { top: true, right: true, bottom: false, left: false }], [{ top: false, right: false, bottom: true, left: true }, { top: false, right: true, bottom: true, left: false }]] },
  { game: 'cargo', epoch: '1', board, state: board.initial },
  { game: 'lightsout', epoch: '1', board: lights },
  { game: 'sudoku', epoch: '1', board: sudoku, givens: sudoku.flatMap((v, i) => v ? [i] : []), selected: null, notes: true },
  { game: '2048', epoch: '1', board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
  { game: 'match3', epoch: '1', board: [[1, 2, 1], [3, 1, 3], [2, 3, 2]], selected: { x: 1, y: 0 } },
  { game: 'sky', epoch: '1', row: 0, lane: 0, target: 2, obstacles: [0, 1] },
];
for (const source of fixtures) {
  const before = structuredClone(source), plans = api.createInputPlans(source);
  assert.deepEqual(source, before, `${source.game}: planning never mutates live state`);
  assert.ok(plans.length, `${source.game}: plans exist`);
  assert.ok(plans.every(p => p.steps.length && p.label.length < 220));
  const plan = plans[0], state = structuredClone(source);
  if (source.game === 'snake') {
    const head = state.segments.at(-1); state.segments.shift(); state.segments.push({ x: head.x + state.direction.x, y: head.y + state.direction.y }); ++state.tick;
  }
  assert.equal(api.inspectPlannedInput({ ...state, epoch: 'new-round' }, plan.steps[0]), 'invalid', `${source.game}: another round rejects the plan`);
  for (const step of plan.steps) {
    if (state.game === 'flappy') break; // Timed trajectory windows are checked below.
    assert.equal(api.inspectPlannedInput(state, step), 'ready', `${source.game}: native input precondition`);
    if (state.game === 'maze') { state.position = { x: state.position.x + step.input.x, y: state.position.y + step.input.y }; state.stars = state.stars.filter(p => p.x !== state.position.x || p.y !== state.position.y); }
    if (state.game === 'cargo') { const move = api.moveCargo(state.board, state.state, step.input); assert.ok(move); state.state = move.state; }
    if (state.game === 'lightsout') api.applyToggle(state.board, step.input % 5, Math.floor(step.input / 5));
    if (state.game === 'sudoku') { if (step.input.type === 'notes') state.notes = !state.notes; if (step.input.type === 'select') state.selected = step.input.index; if (step.input.type === 'value') { assert.ok(!state.givens.includes(state.selected)); state.board[state.selected] = step.input.value; } }
    if (state.game === 'tetris') { if (step.input === 'left') --state.piece.x; if (step.input === 'right') ++state.piece.x; if (step.input === 'rotate') state.piece = api.rotatedPiece(state.board, state.piece); assert.ok(!api.collides(state.board, state.piece)); }
    if (state.game === 'match3') state.selected = state.selected && state.selected.x === step.input.x && state.selected.y === step.input.y ? null : step.input;
    if (state.game === 'sky') state.lane += step.input === 'right' ? 1 : step.input === 'left' ? -1 : 0;
    if (state.game === 'snake') {
      const d = step.input, head = state.segments.at(-1), next = { x: head.x + d.x, y: head.y + d.y };
      assert.ok(d.x !== -state.direction.x || d.y !== -state.direction.y);
      const grows = state.food && next.x === state.food.x && next.y === state.food.y;
      if (!grows) state.segments.shift(); assert.ok(!state.segments.some(p => p.x === next.x && p.y === next.y));
      state.segments.push(next); state.direction = d; ++state.tick;
    }
  }
  if (state.game === 'maze') { assert.equal(state.stars.length, 0); assert.deepEqual(state.position, { x: 1, y: 1 }); }
  if (state.game === 'cargo') assert.ok(api.cargoSolved(state.board, state.state));
  if (state.game === 'lightsout') assert.ok(api.isSolved(state.board));
  if (state.game === 'sudoku') assert.ok(state.board.every(v => v));
  if (state.game === 'sky') assert.equal(state.lane, state.target);
  console.log(`PASS ${source.game}: bounded visible-state planning, guarded native inputs, no state mutation`);
}
const flight = fixtures[0], step = api.createInputPlans(flight)[0].steps[0];
assert.equal(api.inspectPlannedInput(flight, step), 'wait');
assert.equal(api.inspectPlannedInput({ ...flight, time: step.at, y: step.y, velocity: step.velocity }, step), 'ready');
assert.equal(api.inspectPlannedInput({ ...flight, time: step.until + 0.01 }, step), 'invalid');
assert.equal(api.inspectPlannedInput({ ...flight, time: step.at, y: step.y + 100 }, step), 'invalid');
console.log('PASS timed flight plans reject late replies and divergent trajectories');
