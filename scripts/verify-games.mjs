import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Use an existing Playwright installation without changing production dependencies.
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const browserType = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1
});
const page = await context.newPage();
const waitForFunction = page.waitForFunction.bind(page);
page.waitForFunction = (fn, arg, options) =>
  waitForFunction(fn, arg, { polling: 20, ...options });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  let seed = 20260911;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Keep real animation frames out of deterministic gameplay tests.
  let frame = 0;
  window.requestAnimationFrame = () => ++frame;
  window.cancelAnimationFrame = () => {};
});
const output = path.resolve(
  `output/verification-${process.env.TEST_BROWSER ?? 'chromium'}`
);
await fs.mkdir(output, { recursive: true });
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const button = (name) => page.getByRole('button', { name, exact: true });
async function open(game, saved) {
  await page.goto(`${base}/#hub`);
  if (saved) {
    await page.evaluate((saved) => {
      for (const [key, value] of Object.entries(saved))
        localStorage.setItem(key, JSON.stringify(value));
    }, saved);
  }
  await page.evaluate((game) => {
    location.hash = game;
  }, game);
  await page.waitForFunction(
    (game) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === game,
    game
  );
}
async function shot(name) {
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true
  });
}
async function layout() {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    'No horizontal overflow'
  );
}
const keyFor = (dx, dy) =>
  dx === 1
    ? 'ArrowRight'
    : dx === -1
      ? 'ArrowLeft'
      : dy === 1
        ? 'ArrowDown'
        : 'ArrowUp';

try {
  await page.goto(base);
  assert.equal(await page.locator('.hub-card').count(), 10);
  await button('Arcade').click();
  assert.equal(await page.locator('.hub-card').count(), 4);
  await button('Puzzles').click();
  assert.equal(await page.locator('.hub-card').count(), 6);
  await button('All games').click();
  await layout();
  await shot('hub-mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot('hub-desktop');
  await page.setViewportSize({ width: 390, height: 844 });

  await open('snake');
  assert.equal((await state()).mode, 'ready');
  await button('Start').tap();
  for (let tick = 0; tick < 500 && (await state()).score < 40; tick++) {
    const s = await state(),
      head = s.segments.at(-1),
      target = s.food;
    const blocked = new Set(s.segments.slice(1).map((p) => `${p.x},${p.y}`));
    const queue = [[head]],
      seen = new Set([`${head.x},${head.y}`]);
    let route;
    for (let i = 0; i < queue.length; i++) {
      const way = queue[i],
        p = way.at(-1);
      if (p.x === target.x && p.y === target.y) {
        route = way;
        break;
      }
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1]
      ]) {
        if (way.length === 1 && dx === -s.direction.x && dy === -s.direction.y)
          continue;
        const n = { x: p.x + dx, y: p.y + dy },
          key = `${n.x},${n.y}`;
        if (
          n.x < 0 ||
          n.y < 0 ||
          n.x >= 20 ||
          n.y >= 20 ||
          blocked.has(key) ||
          seen.has(key)
        )
          continue;
        seen.add(key);
        queue.push([...way, n]);
      }
    }
    assert(route?.length > 1, 'Food remains reachable in test route');
    await page.keyboard.press(keyFor(route[1].x - head.x, route[1].y - head.y));
    await advance(210);
    assert.equal((await state()).mode, 'playing');
  }
  assert.equal((await state()).score, 40);
  assert((await state()).bonus);
  await shot('snake-golden');
  await button('Pause').tap();
  const pausedSnake = await state();
  await advance(8000);
  assert.deepEqual(await state(), pausedSnake);
  await button('Resume').tap();
  await advance(9000);
  assert.equal((await state()).mode, 'over');
  assert.equal((await state()).score, 40);
  await button('Play again').tap();
  assert.equal((await state()).score, 0);
  await button('Mode: Classic').tap();
  await button('Start').tap();
  await advance(6000);
  assert.equal((await state()).mode, 'playing');
  await layout();
  console.log(
    'PASS Snake: food, bonus, pause, death/result, retry, edge wrapping'
  );

  await open('flappy');
  await button('Take flight').tap();
  for (let tick = 0; tick < 1000 && (await state()).passed < 6; tick++) {
    const s = await state();
    assert.equal(s.mode, 'playing');
    const pipe =
      s.pipes.find((p) => p.x + 58 >= s.bird.x - 12) ?? s.pipes.at(-1);
    const target = pipe ? pipe.gapY + pipe.gap / 2 : 240;
    if (s.bird.y > target + 6 && s.bird.velocity > 0)
      await page.keyboard.press('Space');
    await advance(25);
  }
  assert((await state()).passed >= 6);
  assert((await state()).score >= 6);
  await shot('flappy-flight');
  await button('Pause').tap();
  const pausedFlappy = await state();
  await advance(3000);
  assert.deepEqual(await state(), pausedFlappy);
  await button('Resume').tap();
  await advance(4000);
  assert.equal((await state()).mode, 'over');
  await button('Try again').tap();
  assert.equal((await state()).mode, 'ready');
  assert.equal((await state()).score, 0);
  await layout();
  console.log(
    'PASS Flappy: six gates, score, fair spacing, pause, collision, restart'
  );

  await open('tetris');
  await button('Start').tap();
  const first = (await state()).current;
  await button('Hold').tap();
  assert.equal((await state()).held, first);
  const held = await state();
  await button('Hold').tap();
  assert.deepEqual(await state(), held);
  await button('Pause').tap();
  const pausedTetris = await state();
  await advance(3000);
  assert.deepEqual(await state(), pausedTetris);
  await button('Resume').tap();
  const rotate = (m) => m[0].map((_, x) => m.map((row) => row[x]).reverse());
  const collision = (board, m, px, py) =>
    m.some((row, y) =>
      row.some(
        (v, x) =>
          v &&
          (px + x < 0 ||
            px + x >= 10 ||
            py + y >= 20 ||
            (py + y >= 0 && board[py + y][px + x]))
      )
    );
  for (let turn = 0; turn < 65 && (await state()).lines < 4; turn++) {
    const s = await state();
    assert.equal(s.mode, 'playing');
    let m = s.piece.matrix,
      best;
    for (let r = 0; r < 4; r++, m = rotate(m))
      for (let x = -3; x < 10; x++) {
        if (collision(s.board, m, x, 0)) continue;
        let y = 0;
        while (!collision(s.board, m, x, y + 1)) y++;
        let board = s.board.map((row) => [...row]);
        m.forEach((row, j) =>
          row.forEach((v, i) => {
            if (v) board[y + j][x + i] = v;
          })
        );
        const cleared = board.filter((row) => row.every(Boolean)).length;
        board = board.filter((row) => !row.every(Boolean));
        while (board.length < 20) board.unshift(Array(10).fill(0));
        const heights = Array.from({ length: 10 }, (_, x) => {
          const y = board.findIndex((row) => row[x]);
          return y < 0 ? 0 : 20 - y;
        });
        let holes = 0;
        for (let x = 0; x < 10; x++)
          for (let y = 20 - heights[x]; y < 20; y++) if (!board[y][x]) holes++;
        const cost =
          holes * 100 +
          heights.reduce((a, b) => a + b, 0) +
          heights
            .slice(1)
            .reduce((sum, h, i) => sum + Math.abs(h - heights[i]), 0) *
            2 -
          cleared * 15;
        if (!best || cost < best.cost) best = { cost, r, x };
      }
    assert(best);
    for (let r = 0; r < best.r; r++) await page.keyboard.press('ArrowUp');
    let currentX = (await state()).piece.x;
    while (currentX !== best.x) {
      await page.keyboard.press(currentX > best.x ? 'ArrowLeft' : 'ArrowRight');
      const afterX = (await state()).piece.x;
      assert.notEqual(afterX, currentX);
      currentX = afterX;
    }
    await button('Drop').tap();
  }
  assert((await state()).lines >= 4);
  assert((await state()).score >= 400);
  await shot('tetris-lines');
  for (let i = 0; i < 30 && (await state()).mode !== 'over'; i++)
    await button('Drop').tap();
  assert.equal((await state()).mode, 'over');
  assert((await state()).score > 0);
  await layout();
  console.log(
    'PASS Tetris: hold lock, pause, rotation, placement, line clears, scoring, top-out'
  );

  const fixture2048 = {
    grid: [
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0,
    moves: 0
  };
  await open('2048', { 'aeroplay:game2048:state': fixture2048 });
  await page.keyboard.press('ArrowLeft');
  let s2048 = await state();
  assert.deepEqual(s2048.grid[0].slice(0, 2), [4, 4]);
  assert.equal(s2048.score, 8);
  assert.equal(s2048.moves, 1);
  await button('Undo').tap();
  assert.deepEqual((await state()).grid, fixture2048.grid);
  assert.equal((await state()).score, 0);
  await page.keyboard.press('ArrowDown');
  s2048 = await state();
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.deepEqual((await state()).grid, s2048.grid);
  await shot('2048-mobile');
  await open('2048', {
    'aeroplay:game2048:state': {
      grid: [
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2]
      ],
      score: 100,
      moves: 20
    }
  });
  assert.equal((await state()).mode, 'over');
  await button('Restart').tap();
  assert.equal((await state()).mode, 'playing');
  await layout();
  console.log(
    'PASS 2048: one merge per tile, scoring, undo, persistence, dead board'
  );

  await open('match3');
  for (let i = 0; i < 30 && (await state()).mode === 'playing'; i++) {
    const before = await state();
    await button('Hint').tap();
    const { hinted } = await state();
    assert.equal(hinted.length, 2);
    for (const p of hinted)
      await page
        .locator(`.match3-cell[data-x="${p.x}"][data-y="${p.y}"]`)
        .tap();
    assert.equal((await state()).moves, before.moves - 1);
    for (
      let j = 0;
      j < 100 && ['clearing', 'falling'].includes((await state()).mode);
      j++
    )
      await advance(400);
    assert((await state()).score > before.score);
    if (i === 2) await shot('match3-cascades');
  }
  assert(['won', 'over'].includes((await state()).mode));
  await shot('match3-result');
  if ((await state()).mode === 'won') {
    await button('Next level →').tap();
    assert.equal((await state()).level, 2);
  } else {
    await button('Try again').tap();
    assert.equal((await state()).moves, 30);
  }
  await layout();
  console.log(
    'PASS Match-3: hints, valid swaps, move costs, cascades, level end and restart'
  );

  await open('maze');
  const solveMaze = (s, target) => {
    const queue = [[s.player]],
      seen = new Set([`${s.player.x},${s.player.y}`]);
    for (let i = 0; i < queue.length; i++) {
      const route = queue[i],
        p = route.at(-1);
      if (p.x === target.x && p.y === target.y) return route;
      const w = s.grid[p.y][p.x];
      for (const [dx, dy, wall] of [
        [1, 0, w.right],
        [-1, 0, w.left],
        [0, 1, w.bottom],
        [0, -1, w.top]
      ]) {
        const n = { x: p.x + dx, y: p.y + dy },
          key = `${n.x},${n.y}`;
        if (!wall && !seen.has(key)) {
          seen.add(key);
          queue.push([...route, n]);
        }
      }
    }
  };
  await button('Hint · 3').tap();
  assert.equal((await state()).hints, 2);
  assert((await state()).path.length);
  const mazeState = await state();
  const targets = [
    ...mazeState.stars,
    { x: mazeState.size - 1, y: mazeState.size - 1 }
  ];
  for (const target of targets) {
    const route = solveMaze(await state(), target);
    assert(route);
    for (let i = 1; i < route.length; i++) {
      await page.keyboard.press(
        keyFor(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
      );
      await advance(50);
      if ((await state()).mode === 'won') break;
    }
    if ((await state()).mode === 'won') break;
  }
  assert.equal((await state()).mode, 'won');
  const finishedMaze = await state();
  await advance(2000);
  assert.equal((await state()).elapsed, finishedMaze.elapsed);
  await shot('maze-result');
  await button('Next expedition →').tap();
  assert.equal((await state()).level, 2);
  await layout();
  console.log(
    'PASS Maze: reachable stars/exit, hints, movement, completion, stopped timer, progression'
  );

  await open('sudoku');
  await page.locator('.sudoku-cell').nth(2).tap();
  await button('Notes: Off').tap();
  await button('2').tap();
  assert.deepEqual((await state()).notes[2], [2]);
  assert.equal((await state()).board[2], 0);
  await shot('sudoku-pencil');
  await button('Notes: On').tap();
  await button('1').tap();
  assert.equal((await state()).mistakes, 1);
  await button('Undo').tap();
  assert.equal((await state()).board[2], 0);
  assert.deepEqual((await state()).notes[2], [2]);
  await button('Hint · 3').tap();
  assert.equal((await state()).board[2], 4);
  assert.equal((await state()).hints, 2);
  await shot('sudoku-notes');
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal((await state()).board[2], 4);
  assert.equal((await state()).hints, 2);
  const sudokuSource = await fs.readFile('src/games/sudoku.ts', 'utf8');
  const puzzles = [
    ...sudokuSource.matchAll(/puzzle:\s+'([0-9]+)',\s+solution:\s+'([0-9]+)'/g)
  ];
  assert.equal(puzzles.length, 3);
  for (const [, puzzle, answer] of puzzles) {
    assert.equal(answer.length, 81);
    for (let i = 0; i < 81; i++)
      assert(puzzle[i] === '0' || puzzle[i] === answer[i]);
    for (let r = 0; r < 9; r++) {
      assert.equal(new Set(answer.slice(r * 9, r * 9 + 9)).size, 9);
      assert.equal(
        new Set(Array.from({ length: 9 }, (_, y) => answer[y * 9 + r])).size,
        9
      );
    }
    for (let y = 0; y < 9; y += 3)
      for (let x = 0; x < 9; x += 3)
        assert.equal(
          new Set(
            Array.from(
              { length: 9 },
              (_, i) => answer[(y + Math.floor(i / 3)) * 9 + x + (i % 3)]
            )
          ).size,
          9
        );
  }
  const solution = puzzles[0][2];
  for (let i = 0; i < 81; i++)
    if ((await state()).board[i] !== Number(solution[i])) {
      await page.locator('.sudoku-cell').nth(i).tap();
      await page.keyboard.press(solution[i]);
    }
  assert.equal((await state()).mode, 'won');
  const solvedTime = (await state()).elapsed;
  await page.waitForTimeout(1100);
  assert.equal((await state()).elapsed, solvedTime);
  await button('New puzzle').tap();
  assert.equal((await state()).puzzleIndex, 1);
  assert.equal((await state()).hints, 3);
  await layout();
  console.log(
    'PASS Sudoku: valid puzzles/answers, notes, mistakes, undo, hints, persistence, solved timer, next'
  );

  await open('lightsout');
  const lightsBefore = await state();
  await page.locator('.light-cell').nth(12).tap();
  assert.equal((await state()).moves, 1);
  await button('Undo').tap();
  assert.deepEqual((await state()).board, lightsBefore.board);
  for (let i = 0; i < 25 && (await state()).mode !== 'won'; i++) {
    await button('Hint').tap();
    const { hinted } = await state();
    assert(hinted >= 0);
    await page.locator('.light-cell').nth(hinted).tap();
  }
  assert.equal((await state()).mode, 'won');
  assert.equal((await state()).moves, lightsBefore.par);
  await shot('lightsout-result');
  await button('Next puzzle →').tap();
  assert.equal((await state()).level, 2);
  await page.locator('.light-cell').nth(0).tap();
  await button('Retry').tap();
  assert.equal((await state()).moves, 0);
  await layout();
  console.log(
    'PASS Lights Out: cross toggle, undo, minimum-move hints, solve, progression, retry'
  );

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const game of [
      'snake',
      'tetris',
      '2048',
      'flappy',
      'maze',
      'match3',
      'sudoku',
      'lightsout'
    ]) {
      await open(game);
      await layout();
    }
  }
  await button('Back').tap();
  await page.waitForSelector('.hub-card');
  assert.equal(await page.locator('.hub-card').count(), 10);
  assert.equal(
    await page.evaluate(() => typeof window.render_game_to_text),
    'undefined'
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS Responsive 320/390/768px, navigation cleanup, no browser errors'
  );
} finally {
  await browser.close();
}
