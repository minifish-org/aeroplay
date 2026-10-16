import { assert, games, launch, context, harness, mechanics, until, models, bundle, fullMatch, browserName, touchStickDash } from './verify-lib.mjs';

const m = await models();
const planner = await import(`data:text/javascript;base64,${Buffer.from(await bundle("export * from './src/ai/planner.worker.ts';")).toString('base64')}`);
const solutions = [];
// Cargo ships generated islands: every one must be deliverable inside the hint's own budget.
let previousCrates = 0, previousPar = 0;
for (let island = 1;island <= 12;island++) {
  const level = m.gcargo.cargoLevel(island);
  assert.equal(level.number, island);
  assert.deepEqual(m.gcargo.cargoLevel(island).map, level.map, `Island ${island}: generation is deterministic for its number`);
  assert(level.map.every(row => row.length === level.map[0].length && row.startsWith('#') && row.endsWith('#')), `Island ${island}: rectangular walled map`);
  assert.equal(level.crates, level.map.join('').split('').filter(cell => cell === '$' || cell === '*').length);
  assert(level.crates >= previousCrates, `Island ${island}: crate count never drops below the previous island`);
  previousCrates = level.crates;
  assert(level.par >= 2, `Island ${island}: par is a real delivery`);
  const board = m.gcargo.parseCargo(level.map), answer = planner.solveCargo(board, board.initial, 20000);
  assert(answer, `Island ${island}: solvable inside the hint budget`);
  assert.equal(answer.pushes, level.par, `Island ${island}: par is the minimum push count`);
  let state = board.initial, pushes = 0;
  for (const direction of answer.moves) {
    const result = m.gcargo.moveCargo(board, state, direction);
    assert(result);
    state = result.state;
    pushes += Number(result.pushed);
  }
  assert(m.gcargo.cargoSolved(board, state));
  assert.equal(pushes, level.par);
  solutions.push(answer.moves);
  previousPar = level.par;
}
assert(previousPar >= 6, 'Later islands are real deliveries, not a crate beside its dock');
// Sudoku ships generated puzzles: unique, singles-solvable and inside the planner's budget.
let previousGivens = 82;
for (const number of [1, 2, 3, 4, 6, 10, 16, 24]) {
  const level = m.gsudoku.sudokuPuzzle(number);
  assert.deepEqual(m.gsudoku.sudokuPuzzle(number).puzzle, level.puzzle, `Puzzle ${number}: generation is deterministic for its number`);
  assert.equal(level.puzzle.length, 81);
  assert.equal(level.solution.length, 81);
  const puzzle = [...level.puzzle].map(Number), solution = [...level.solution].map(Number);
  for (let i = 0;i < 81;i++)assert(puzzle[i] === 0 || puzzle[i] === solution[i], `Puzzle ${number}: givens match the solution`);
  for (let row = 0;row < 9;row++) {
    assert.equal(new Set(solution.slice(row * 9, row * 9 + 9)).size, 9);
    assert.equal(new Set(Array.from({ length: 9 }, (_, y) => solution[y * 9 + row])).size, 9);
  }
  for (let y = 0;y < 9;y += 3)for (let x = 0;x < 9;x += 3)assert.equal(new Set(Array.from({ length: 9 }, (_, i) => solution[(y + Math.floor(i / 3)) * 9 + x + i % 3])).size, 9);
  assert.equal(level.givens, puzzle.filter(Boolean).length);
  assert.equal(m.gsudoku.countSudokuSolutions(puzzle, 2), 1, `Puzzle ${number}: exactly one completion`);
  assert(m.gsudoku.solveSudokuSingles(puzzle), `Puzzle ${number}: naked and hidden singles finish it`);
  assert.deepEqual(m.gsudoku.solveVisibleSudoku(puzzle, 50000), solution, `Puzzle ${number}: the planner's search finds the same completion`);
  assert(level.givens <= previousGivens, `Puzzle ${number}: difficulty never eases off`);
  previousGivens = level.givens;
}
assert(previousGivens <= 33, 'Later puzzles drop to a sharp given count');
let seed = 314; const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const flight = m.gsky.createFlight(random); flight.mode = 'playing';
for (let i = 0;i < 5000 && flight.mode === 'playing';i++) {
  const row = flight.rows.filter(r => !r.passed).sort((a, b) => a.distance - b.distance)[0];
  if (flight.lane !== row.safeLane) m.gsky.steerFlight(flight, Math.sign(row.safeLane - flight.lane));
  if (flight.charge === 100) m.gsky.boostFlight(flight);
  m.gsky.stepFlight(flight, 1 / 60, random);
}
assert.equal(flight.mode, 'won'); assert(flight.rings >= 40 && flight.combo >= 40 && flight.score > 10000); assert.equal(flight.shield, 1);
const death = m.gsky.createFlight(() => 0); death.mode = 'playing'; death.shield = 0; death.rows[0].distance = .01; death.rows[0].obstacles = [1]; m.gsky.stepFlight(death, 1 / 60, () => 0); assert.equal(death.mode, 'over');
const p = m.gpushball, idle = p.idleAction;
const playing = () => {
  const s = p.createMatch();
  s.mode = 'playing';
  s.kickoff = 0;
  return s;
};
function step(s, actions, duration) {
  for (let time = 0;time < duration - .000001;time += 1 / 120)p.stepMatch(s, actions.map(a => ({ ...a, dash: time === 0 && a.dash })), Math.min(1 / 120, duration - time));
}
for (const mode of ['ready', 'paused', 'over']) {
  const s = playing();
  s.mode = mode;
  const before = structuredClone(s);
  p.stepMatch(s, [{ x: 1, y: 1, dash: true }, idle()], .05);
  assert.deepEqual(s, before);
}
{
  const s = playing(), before = structuredClone(s.robots);
  step(s, [{ x: 1, y: 0, dash: false }, { x: 1, y: 1, dash: false }], .5);
  for (let side = 0;side < 2;side++)assert(Math.abs(Math.hypot(s.robots[side].x - before[side].x, s.robots[side].y - before[side].y) - p.MOVE_SPEED * .5) < 1e-8);
  assert.deepEqual(p.normalizeAction({ x: NaN, y: Infinity, dash: false }), idle());
  const dash = playing();
  step(dash, [{ x: 1, y: 0, dash: true }, idle()], .1);
  assert(dash.robots[0].x > .8 && dash.robots[0].cooldown > 2.6);
  assert.equal(dash.robots[0].y, 5.5);
  step(dash, [{ x: 1, y: 0, dash: true }, idle()], .25);
  assert.equal(dash.robots[0].dashLeft, 0);
  assert(dash.robots[0].cooldown < 2.5);
  const collision = playing();
  collision.robots[0].x = collision.robots[1].x = 0;
  collision.robots[0].y = collision.robots[1].y = 3;
  step(collision, [idle(), idle()], .05);
  assert(Math.hypot(collision.robots[0].x - collision.robots[1].x, collision.robots[0].y - collision.robots[1].y) >= 1.43);
  step(collision, [{ x: 1, y: 1, dash: false }, idle()], 5);
  assert(collision.robots[0].x <= p.FIELD.width / 2 - p.ROBOT_RADIUS);
  assert(collision.robots[0].y <= p.FIELD.length / 2 - p.ROBOT_RADIUS);
}
for (const side of [0, 1]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const direction of [-1, 1]) {
  const radius = p.FIELD.cornerRadius, cx = p.FIELD.width / 2 - radius, cy = p.FIELD.length / 2 - radius, s = playing();
  s.ball = { x: sx * (p.FIELD.width / 2 - p.BALL_RADIUS), y: sy * (p.FIELD.length / 2 - p.BALL_RADIUS), vx: 0, vy: 0 };
  step(s, [idle(), idle()], 1 / 120);
  assert(Math.hypot(Math.abs(s.ball.x) - cx, Math.abs(s.ball.y) - cy) <= radius - p.BALL_RADIUS + 1e-8);
  s.robots[side].x = sx * 5.28;
  s.robots[side].y = sy * 8.28;
  step(s, [idle(), idle()], 1 / 120);
  assert(Math.hypot(Math.abs(s.robots[side].x) - cx, Math.abs(s.robots[side].y) - cy) <= radius - p.ROBOT_RADIUS + 1e-8);
  const ballOrbit = radius - p.BALL_RADIUS, robotOrbit = radius - p.ROBOT_RADIUS, angle = Math.PI / 4;
  const offset = Math.acos((ballOrbit ** 2 + robotOrbit ** 2 - (p.BALL_RADIUS + p.ROBOT_RADIUS) ** 2) / (2 * ballOrbit * robotOrbit)), from = angle - direction * offset;
  const start = { x: sx * (cx + ballOrbit * Math.cos(angle)), y: sy * (cy + ballOrbit * Math.sin(angle)) };
  s.ball = { ...start, vx: 0, vy: 0 };
  s.robots[side].x = sx * (cx + robotOrbit * Math.cos(from));
  s.robots[side].y = sy * (cy + robotOrbit * Math.sin(from));
  const action = { x: -sx * Math.sin(from) * direction, y: sy * Math.cos(from) * direction, dash: false };
  step(s, side === 0 ? [action, idle()] : [idle(), action], .8);
  assert(Math.hypot(s.ball.x - start.x, s.ball.y - start.y) > .8, 'Both sides release stationary balls from every curved corner');
  assert.deepEqual(s.score, [0, 0]);
}
{
  const s = playing();
  s.robots[0].y = 1.3;
  step(s, [{ x: 0, y: -1, dash: false }, idle()], .1);
  assert(s.ball.vy < -1);
  s.ball = { x: 5.5, y: 0, vx: 8, vy: 0 };
  step(s, [idle(), idle()], .05);
  assert(s.ball.vx < 0);
  const speed = Math.abs(s.ball.vx);
  step(s, [idle(), idle()], .1);
  assert(Math.abs(s.ball.vx) < speed);
  const wall = playing();
  wall.ball = { x: 4, y: -8.5, vx: 0, vy: -8 };
  step(wall, [idle(), idle()], .2);
  assert.deepEqual(wall.score, [0, 0]);
  assert(wall.ball.vy > 0);
  for (const side of [0, 1]) {
    const match = playing();
    for (let goal = 1;goal <= 3;goal++) {
      match.kickoff = 0;
      match.ball = { x: 0, y: side === 0 ? -9.3 : 9.3, vx: 0, vy: side === 0 ? -8 : 8 };
      step(match, [idle(), idle()], .05);
      assert.equal(match.score[side], goal);
      assert.equal(match.goalSerial, goal);
      assert.deepEqual(match.ball, { x: 0, y: 0, vx: 0, vy: 0 });
    }
    assert.equal(match.mode, 'over');
    assert.equal(match.winner, side);
  }
  const observed = p.observeMatch(s);
  observed.ball.x = 99;
  observed.robots[0].x = 99;
  observed.score[0] = 99;
  assert.notEqual(s.ball.x, 99);
  assert.notEqual(s.robots[0].x, 99);
  assert.notEqual(s.score[0], 99);
}
console.log('PASS pure rules: generated Cargo islands inside the hint budget, generated unique singles-solvable Sudoku puzzles, full boosted Sky sector and Pushball physics/scoring/corners');

const browser = await launch();
try {
  const ctx = await context(browser, { deterministic: true }), h = await harness(ctx), { page, state, advance, button } = h;
  await h.open('hub');
  assert.equal(await page.locator('.hub-card').count(), 8);
  const fixture = { grid: [[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, moves: 0 };
  await h.open('2048', { 'aeroplay:game2048:state': fixture });
  const beforePixels = await h.pixels();
  await h.swipe('left');
  assert.deepEqual((await state()).grid[0].slice(0, 2), [4, 4]);
  assert.equal((await state()).score, 8);
  assert.equal((await state()).moves, 1);
  await advance(100);
  assert.notEqual(await h.pixels(), beforePixels, 'Native swipe produces visible animation');
  await advance(400);
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).undoCount, 1, '2048 keeps its native move history after reload');
  await button('Undo').click();
  assert.deepEqual((await state()).grid, fixture.grid);
  assert.equal((await state()).score, 0);
  assert.equal((await state()).moves, fixture.moves);
  await h.key('ArrowDown');
  await advance(400);
  const saved = await state();
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  await h.dismiss();
  assert.deepEqual((await state()).grid, saved.grid);
  await until(state, async (s, i) => {
    const all = ['left', 'down', 'right', 'up'], directions = all.map((_, j) => all[(i + j) % 4]);
    const direction = directions.find(direction => m.g2048.preview2048Move(s.grid, direction).changed);
    assert(direction);
    await h.key('Arrow' + direction[0].toUpperCase() + direction.slice(1));
    await advance(400);
  }, s => s.mode === 'over', 1500, '2048 full played round reaches settlement');
  assert((await state()).score > 0);
  await h.shot('2048-result');
  await button('New game').click();
  assert.equal((await state()).mode, 'playing');
  assert.equal((await state()).score, 0);
  console.log('PASS 2048 native swipe, single merge, score, undo, legacy save/reload, full round and restart');

  await h.open('lightsout');
  const lights = await state();
  await h.pick(12);
  assert.equal((await state()).moves, 1);
  const expected = [...lights.board];
  m.glightsout.applyToggle(expected, 2, 2);
  assert.deepEqual((await state()).board, expected);
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.deepEqual((await state()).board, expected, 'Lights preserves the moved board before Undo');
  await button('Undo').click();
  assert.deepEqual((await state()).board, lights.board);
  assert.equal((await state()).moves, lights.moves);
  await until(state, async () => {
    await button('Hint').click();
    const s = await state();
    assert(s.hinted >= 0);
    await h.pick(s.hinted);
    await advance(400);
  }, s => s.mode === 'won', 25, 'Lights full minimum-move solve');
  assert.equal((await state()).moves, lights.par);
  await h.shot('lightsout-result');
  const won = mechanics(await state());
  await advance(2000);
  assert.deepEqual(mechanics(await state()), won);
  await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
  await button('Next puzzle').click();
  assert.equal((await state()).level, lights.level + 1);
  await button('Pause').click(); assert.equal((await state()).mode, 'paused', 'Next puzzle restores contextual Pause after loading a completed run');
  await button('Resume').click(); assert.equal((await state()).mode, 'playing');
  await h.pick(0);
  await h.action('restart').click();
  assert.equal((await state()).moves, 0);
  const restored = await state();
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.deepEqual((await state()).board, restored.board);
  console.log('PASS Lights cross toggle, undo, minimum hints, full solve, next/restart and legacy save');

  await h.open('flappy');
  await page.touchscreen.tap((await state()).playBounds.x + 30, (await state()).playBounds.y + 100);
  assert.equal((await state()).mode, 'playing');
  await until(state, async s => {
    assert.equal(s.mode, 'playing');
    const pipe = s.pipes.find(p => p.x + 58 >= s.bird.x - 12) ?? s.pipes.at(-1), target = pipe ? pipe.gapY + pipe.gap / 2 : 240;
    if (s.bird.y > target + 6 && s.bird.velocity > 0) await h.tapScene();
    await advance(25);
  }, s => s.passed >= 6, 1500, 'Flappy six scored gates');
  assert((await state()).score >= 6);
  await h.shot('flappy-flight');
  await button('Pause').click();
  const paused = mechanics(await state());
  await advance(3000);
  assert.deepEqual(mechanics(await state()), paused);
  await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
  const reloadedFlight = mechanics(await state());
  for (const field of ['mode', 'bird', 'pipes', 'score', 'passed', 'distance', 'time']) assert.deepEqual(reloadedFlight[field], paused[field], 'Flappy reload preserves ' + field);
  await button('Resume').click();
  await advance(4000);
  assert.equal((await state()).mode, 'over');
  await h.shot('flappy-result');
  await button('Try again').click();
  assert.equal((await state()).mode, 'playing', 'One native retry immediately starts a fresh flight');
  assert.equal((await state()).score, 0);
  const best = (await state()).best;
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).best, best);
  console.log('PASS Flappy tap, six gates, score, pause, actual collision, retry and best save');

  await h.open('sudoku');
  const opened = await state();
  assert.equal(opened.number, 1, 'Sudoku starts on a freshly generated puzzle');
  const generated = m.gsudoku.sudokuPuzzle(opened.number).solution;
  assert(opened.board.every((value, index) => value === 0 || value === Number(generated[index])), 'The generated puzzle matches its own solution');
  const cell = opened.board.findIndex((value, index) => !value && !opened.givens.includes(index) && generated[index] !== '1');
  assert(cell >= 0, 'The generated puzzle offers an editable empty cell');
  await h.pick({ type: 'select', index: cell });
  await h.action('notes').click();
  await button('2').click();
  assert.deepEqual((await state()).notes[cell], [2]);
  assert.equal((await state()).board[cell], 0);
  await h.action('notes').click();
  await button('1').click();
  assert.equal((await state()).mistakes, 1);
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).mistakes, 1, 'Sudoku persists the mistake before Undo');
  assert.equal((await state()).number, 1, 'Sudoku regenerates the same puzzle from its number');
  await button('Undo').click();
  assert.equal((await state()).board[cell], 0);
  assert.deepEqual((await state()).notes[cell], [2]);
  assert.equal((await state()).mistakes, 1, 'Undo restores the cell while retaining the mistake penalty');
  assert.equal((await state()).hints, 3);
  await h.action('hint').click();
  assert.equal((await state()).board[cell], Number(generated[cell]));
  assert.equal((await state()).hints, 2);
  await button('Erase').click();
  assert.equal((await state()).board[cell], 0);
  await button('Undo').click();
  assert.equal((await state()).board[cell], Number(generated[cell]));
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).board[cell], Number(generated[cell]));
  assert.equal((await state()).hints, 2);
  for (let i = 0;i < 81;i++)if ((await state()).board[i] !== Number(generated[i])) {
    await h.pick({ type: 'select', index: i });
    await button(generated[i]).click();
    await advance(400);
  }
  assert.equal((await state()).mode, 'won');
  const time = (await state()).elapsedSeconds;
  await advance(3000);
  assert.equal((await state()).elapsedSeconds, time);
  await h.shot('sudoku-result');
  await h.page.waitForTimeout(3400);
  assert.equal((await state()).number, 2, 'Sudoku generates and opens the next puzzle by itself');
  assert.equal((await state()).mode, 'playing');
  assert.equal((await state()).hints, 3);
  assert.notEqual((await state()).board.join(''), opened.board.join(''));
  assert(m.gsudoku.sudokuPuzzle(2).givens <= m.gsudoku.sudokuPuzzle(1).givens, 'The next puzzle is at least as hard');
  assert((await page.locator('.hud-stats').innerText()).includes('2 ·'), 'The stage HUD reports the generated puzzle number and difficulty');
  console.log('PASS Sudoku notes, mistakes, undo, hints, erase, generated save/reload, full solve, frozen timer and automatic next puzzle');

  await h.open('match3');
  let s = await state(), invalid;
  for (let y = 0;y < 8 && !invalid;y++)for (let x = 0;x < 7 && !invalid;x++) {
    const grid = s.grid.map(r => [...r]);
    [grid[y][x], grid[y][x + 1]] = [grid[y][x + 1], grid[y][x]];
    if (!m.gmatch3.findMatches(grid).length) invalid = [{ x, y }, { x: x + 1, y }];
  }
  assert(invalid);
  for (const point of invalid) await h.pick(point);
  await advance(500);
  assert.deepEqual((await state()).grid, s.grid);
  assert.equal((await state()).moves, s.moves);
  await until(state, async (before, i) => {
    await button('Hint').click();
    const hinted = (await state()).hinted;
    assert.equal(hinted.length, 2);
    assert.equal(Math.abs(hinted[0].x - hinted[1].x) + Math.abs(hinted[0].y - hinted[1].y), 1);
    for (const point of hinted) await h.pick(point);
    assert.equal((await state()).moves, before.moves + 1, 'Unlimited moves only ever count up');
    await until(state, () => advance(1200), s => !['clearing', 'falling'].includes(s.mode), 40, 'Match cascades settle');
    assert((await state()).score > before.score);
    assert(['playing', 'won'].includes((await state()).mode), 'A level never falls into a failed settlement');
    if (i === 2) await h.shot('match3-cascades');
  }, s => s.mode === 'won', 60, 'Match full played round');
  await h.shot('match3-result');
  s = await state();
  assert.equal(s.mode, 'won', 'Only the score target clears a level');
  await h.action('restart').click();
  assert.equal((await state()).level, s.level + 1, 'The next level takes over with a higher target');
  assert.equal((await state()).moves, 0, 'The next level starts from a fresh move count');
  assert((await state()).target > s.target);
  s = await state();
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.deepEqual((await state()).grid, s.grid);
  console.log('PASS Match valid/invalid native swaps, hints, counted-but-unlimited moves, cascades, full settlement, endless progression and save');

  await h.open('cargo');
  const cargoBeforeMove = await state();
  assert.equal(cargoBeforeMove.level, 1, 'Cargo starts on a freshly generated island');
  assert(cargoBeforeMove.par >= 2 && cargoBeforeMove.crates >= 1);
  const island = await state();
  const board = m.gcargo.parseCargo(island.map);
  const route = planner.solveCargo(board, { player: island.state.player, crates: island.state.crates }, 20000);
  assert(route, 'Island 1 has a deliverable route');
  assert.equal(route.pushes, island.par, 'The island par is the minimum push count');
  let walked = 0;
  for (const direction of route.moves) {
    await button(direction[0].toUpperCase() + direction.slice(1)).click();
    await advance(300);
    walked++;
    if ((await state()).pushes)
      break;
  }
  assert.equal((await state()).pushes, 1, 'Walking to the first crate and pushing it is native input');
  assert.equal((await state()).moves, walked);
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).pushes, 1, 'Cargo persists the native push before Undo');
  assert.equal((await state()).moves, walked, 'Cargo persists every native step');
  assert.deepEqual((await state()).map, island.map, 'Cargo regenerates the same island map from its number');
  await button('Undo').click();
  assert.equal((await state()).pushes, 0, 'Undo takes the push back');
  assert.equal((await state()).moves, walked - 1);
  assert.deepEqual((await state()).state.crates, island.state.crates, 'The crate returns to its starting cell');
  await button('Hint').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hintDirection !== null);
  assert(['up', 'down', 'left', 'right'].includes((await state()).hintDirection));
  assert.equal((await state()).usedHint, true);
  await button('Restart').click();
  await advance(300);
  assert.equal((await state()).moves, 0, 'Restart replays the same island');
  for (const direction of route.moves) {
    await button(direction[0].toUpperCase() + direction.slice(1)).click();
    await advance(300);
  }
  assert.equal((await state()).mode, 'won');
  assert.equal((await state()).pushes, island.par);
  await h.shot('cargo-result');
  await h.page.waitForTimeout(3400);
  assert.equal((await state()).level, 2, 'Cargo opens the next generated island by itself');
  assert.equal((await state()).mode, 'playing');
  assert.notDeepEqual((await state()).map, island.map);
  assert((await state()).stars[String(island.level - 1)] >= 1, 'The delivered island keeps its stars');
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).level, 2);
  assert.equal((await state()).mode, 'playing');
  console.log('PASS Cargo native Dpad, worker hint, undo, generated island delivered at par, stars, automatic next island and save');

  await h.open('sky');
  await button('Start flight').click();
  await h.action('boost').click();
  assert((await state()).boost > 0);
  await until(state, async (s, i) => {
    const row = s.rows.filter(r => !r.passed).sort((a, b) => a.distance - b.distance)[0];
    if (s.lane < row.safeLane) await h.action('right').click(); else if (s.lane > row.safeLane) await h.action('left').click();
    if (s.charge === 100) await h.action('boost').click();
    await advance(70);
    if (i === 80) {
      await button('Pause').click();
      const distance = (await state()).distance;
      await advance(3000);
      assert.equal((await state()).distance, distance);
      const savedFlight = mechanics(await state());
      await page.reload(); await page.waitForFunction(() => window.render_game_to_text);
      const { message: oldMessage, messageTime: oldMessageTime, ...savedSector } = savedFlight;
      const { message: restoredMessage, messageTime: restoredMessageTime, ...restoredSector } = mechanics(await state());
      assert.deepEqual(restoredSector, savedSector, 'Sky reload preserves the full paused sector and obstacle queue');
      assert.equal(restoredMessage, ''); assert.equal(restoredMessageTime, 0, 'Transient boost feedback expires on re-entry');
      await button('Resume').click();
    }
  }, s => s.mode !== 'playing', 1500, 'Sky full sector');
  s = await state();
  assert.equal(s.mode, 'won');
  assert(s.rings >= 40 && s.score > 5000);
  await h.shot('sky-result');
  await button('Next sector').click();
  assert.equal((await state()).sector, 2);
  assert.equal((await state()).score, s.score);
  await advance(35000);
  assert.equal((await state()).mode, 'over');
  await button('Fly again').click();
  assert.equal((await state()).score, 0);
  assert.equal((await state()).mode, 'playing');
  await h.action('sound').click();
  assert.equal(await h.action('sound').getAttribute('aria-pressed'), 'true');
  await h.open('cargo');
  assert.equal(await h.action('sound').getAttribute('aria-pressed'), 'true');
  await h.open('hub');
  assert.equal(await page.evaluate(() => typeof window.render_game_to_text), 'undefined');
  h.clean();
  await ctx.close();
  console.log('PASS Sky boost, pause, full sector, next sector, collision/retry and shared sound persistence');

  const live = await context(browser, { audit: true }), ph = await harness(live);
  await ph.open('pushball');
  assert.equal(await ph.action('mode').count(), 0, 'Fixed TAMEV opponent');
  const completed = await fullMatch(ph);
  await ph.shot('pushball-result');
  assert(completed.ai.decisions > 0, 'Actual local model supplies ordinary match input');
  const records = await ph.page.evaluate(() => ({ human: localStorage.getItem('aeroplay:pushball:matches'), assisted: localStorage.getItem('aeroplay:ai:pushball:matches') }));
  assert.equal(records.human, '1');
  assert.equal(records.assisted, null);
  await ph.button('Play again').click();
  await ph.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  assert.deepEqual((await ph.state()).score, [0, 0]);
  await ph.page.waitForTimeout(600);
  await ph.button('Pause').click();
  const matchTime = (await ph.state()).elapsed;
  await ph.page.waitForTimeout(300);
  assert.equal((await ph.state()).elapsed, matchTime);
  await ph.button('New match').click();
  await ph.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  assert.deepEqual((await ph.state()).score, [0, 0]);
  assert((await ph.state()).elapsed < matchTime);
  assert.equal((await ph.state()).record.matches, 1);
  assert.equal((await ph.state()).ai.info.initializations, 1);
  await ph.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).kickoff === 0);
  const more = ph.page.locator('summary[aria-label="More options"]'); await more.focus(); await ph.page.keyboard.press('Space');
  assert(await more.evaluate(el => el.parentElement.open), 'Focused More opens with native Space'); await ph.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'paused');
  await ph.page.keyboard.press('Space'); assert(!await more.evaluate(el => el.parentElement.open)); await ph.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
  await ph.page.locator('canvas').click({ position: { x: 4, y: 4 } });
  const before = await ph.state();
  await ph.page.keyboard.down('ArrowRight');
  await ph.page.waitForTimeout(300);
  assert((await ph.state()).robots[0].x > before.robots[0].x + .5);
  await ph.page.keyboard.press('Space');
  await ph.page.waitForTimeout(50);
  assert((await ph.state()).robots[0].cooldown > 2);
  await ph.page.keyboard.up('ArrowRight');
  await ph.action('pause').click();await ph.button('New match').click();await ph.page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='playing'&&JSON.parse(window.render_game_to_text()).kickoff===0);
  if(browserName==='chromium')await touchStickDash(live,ph);
  else {
  const stick = await ph.page.getByRole('group', { name: 'Movement joystick' }).boundingBox(), dash = await ph.action('dash').boundingBox();
  assert(stick && dash);
  const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }, movedPoint = { x: center.x - 27, y: center.y - 18 };
  await ph.page.mouse.move(center.x, center.y);
  await ph.page.mouse.down();
  await ph.page.mouse.move(movedPoint.x, movedPoint.y);
  const touchStart = await ph.state();
  await ph.page.waitForTimeout(300);
  assert((await ph.state()).robots[0].x < touchStart.robots[0].x - .3);
  await ph.page.keyboard.press('Space');
  await ph.page.waitForTimeout(100);
  assert((await ph.state()).robots[0].cooldown > 2);
  await ph.page.mouse.up();
  await ph.page.waitForTimeout(100);
  assert(Math.hypot((await ph.state()).controls[0].x, (await ph.state()).controls[0].y) < .01, 'Joystick release clears held input');
  await ph.page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.mode==='playing'&&s.kickoff===0&&s.robots[0].cooldown===0&&!document.querySelector('[data-action="dash"]').disabled;});
  await ph.action('pause').click();await ph.button('New match').click();await ph.page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text());return s.mode==='playing'&&s.kickoff===0&&!document.querySelector('[data-action="dash"]').disabled;});
  await ph.page.keyboard.down('ArrowLeft');await ph.page.waitForTimeout(50);
  const tapDash=await ph.action('dash').boundingBox();await ph.page.touchscreen.tap(tapDash.x+tapDash.width/2,tapDash.y+tapDash.height/2);
  await ph.page.waitForTimeout(100);assert((await ph.state()).robots[0].cooldown>2,'Native on-scene Dash tap acts in the current direction');await ph.page.keyboard.up('ArrowLeft');
  }
  await ph.open('hub');
  assert.equal((await ph.page.evaluate(() => window.__gpuAudit)).workers, 1, 'Only the resident ONNX worker remains');
  ph.clean();
  await live.close();
  console.log('PASS Pushball real TAMEV full match, 3 actual goals, personal records, replay, input, pause and teardown');
} finally {
  await browser.close();
}
