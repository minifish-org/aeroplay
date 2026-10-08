import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const name = process.env.TEST_BROWSER ?? 'chromium';
const browser = await (name === 'webkit' ? webkit : chromium).launch({
  headless: true
});
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const output = path.resolve(`output/motion-${name}`);
await fs.mkdir(output, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block'
});
await context.addInitScript(() => {
  let seed = 20260911;
  Math.random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const tap = (text) =>
  page.getByRole('button', { name: text, exact: true }).tap();
async function open(game, saves) {
  await page.goto(`${base}/#hub`);
  if (saves)
    await page.evaluate((saves) => {
      for (const [key, value] of Object.entries(saves))
        localStorage.setItem(key, JSON.stringify(value));
    }, saves);
  await page.evaluate((game) => {
    location.hash = game;
  }, game);
  await page.waitForFunction(
    (game) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === game,
    game,
    { polling: 20 }
  );
  await page.waitForSelector('canvas[data-ready="true"]');
  await page.waitForTimeout(260);
  await advance(500);
}
async function shot(label) {
  await page.screenshot({
    path: path.join(output, `${label}.png`),
    fullPage: true
  });
  await fs.writeFile(
    path.join(output, `${label}.json`),
    JSON.stringify(await state(), null, 2)
  );
}
function assertMergeSettled(s) {
  assert.equal(s.visual.phase, 'idle');
  const expected = s.grid.flatMap((row, y) =>
    row.flatMap((value, x) =>
      value ? [{ value, x: 59 + x * 94, y: 59 + y * 94 }] : []
    )
  );
  const actual = s.visual.tiles.map(({ value, x, y }) => ({ value, x, y }));
  const sort = (a, b) => a.y - b.y || a.x - b.x;
  assert.deepEqual(actual.sort(sort), expected.sort(sort));
}
const mergeSave = {
  'aeroplay:game2048:state': {
    grid: [
      [2, 2, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0,
    moves: 0
  }
};

try {
  await open('2048', mergeSave);
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state()).visual.phase, 'slide');
  await advance(100);
  let s = await state();
  assert.equal(s.score, 12);
  assert(
    !s.visual.tiles.some((tile) => tile.value === 8),
    'Merged numbers appear only after contact'
  );
  assert(
    s.visual.tiles.some((tile) => tile.x > 59 && tile.x < 153),
    'Source tile is between cells'
  );
  await shot('2048-sliding');
  await advance(150);
  assert((await state()).visual.tiles.some((tile) => tile.value === 8));
  await shot('2048-contact');
  await advance(400);
  assertMergeSettled(await state());
  for (const key of [
    'ArrowDown',
    'ArrowRight',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight'
  ])
    await page.keyboard.press(key);
  assert((await state()).visual.queued > 0);
  await advance(3500);
  assertMergeSettled(await state());
  await page.keyboard.press('ArrowLeft');
  await tap('Undo');
  assertMergeSettled(await state());
  console.log(
    'PASS 2048: source numbers slide, contact precedes merge/spawn, rapid input settles, undo cancels motion'
  );

  await open('match3');
  await tap('Hint');
  const pair = (await state()).hinted;
  for (const p of pair)
    await page.locator(`.match3-cell[data-x="${p.x}"][data-y="${p.y}"]`).tap();
  assert.equal((await state()).visual.phase, 'swap');
  await advance(80);
  s = await state();
  assert(
    s.visual.gems.every((gem) => gem.alpha === 1),
    'No gem disappears during the swap'
  );
  await shot('gems-swap');
  await advance(160);
  s = await state();
  assert.equal(s.visual.phase, 'clear');
  assert(s.visual.gems.some((gem) => gem.alpha > 0 && gem.alpha < 1));
  await shot('gems-clear');
  await advance(190);
  s = await state();
  assert.equal(s.mode, 'falling');
  assert(
    s.visual.gems.some(
      (gem) =>
        Math.abs((gem.y - 35.5) / 47 - Math.round((gem.y - 35.5) / 47)) > 0.02
    )
  );
  await shot('gems-falling');
  for (
    let i = 0;
    i < 60 && ['clearing', 'falling'].includes((await state()).mode);
    i++
  )
    await advance(250);
  assert.equal((await state()).moves, 29);
  assert.equal((await state()).visual.phase, 'idle');
  console.log(
    'PASS Match-3: complete swap, then fading clear, staggered gravity and settled cascades'
  );

  await open('lightsout');
  const lights = (await state()).board;
  await page.locator('.light-cell').nth(12).tap();
  assert.deepEqual((await state()).visual.brightness, lights);
  await advance(90);
  assert(
    (await state()).visual.brightness.some((alpha) => alpha > 0 && alpha < 1)
  );
  await shot('lights-fading');
  await page.locator('.light-cell').nth(12).tap();
  await advance(700);
  s = await state();
  assert.deepEqual(s.visual.brightness, s.board);
  assert.deepEqual(s.board, lights);
  console.log(
    'PASS Lights Out: gradual brightness, cross timing, reversal during a fade'
  );

  await open('sudoku');
  const empty = (await state()).board.flatMap((value, i) =>
    !value ? [i] : []
  );
  await page.locator(`.sudoku-cell[data-idx="${empty[0]}"]`).tap();
  await advance(250);
  const selected = (await state()).visual;
  await page.locator(`.sudoku-cell[data-idx="${empty[1]}"]`).tap();
  assert.equal((await state()).visual.x, selected.x);
  await advance(80);
  await shot('sudoku-selection');
  await advance(150);
  await page.getByRole('button', { name: /^Hint/ }).tap();
  await advance(70);
  s = await state();
  assert(s.board[empty[1]] > 0);
  assert(
    s.visual.cells[empty[1]].alpha > 0 && s.visual.cells[empty[1]].alpha < 1
  );
  await shot('sudoku-entry');
  await advance(400);
  await tap('Undo');
  assert((await state()).visual.cells[empty[1]].outgoing?.value);
  await advance(80);
  await shot('sudoku-erasing');
  await advance(300);
  assert(!(await state()).visual.cells[empty[1]].outgoing);
  console.log(
    'PASS Sudoku: moving selection, soft number entry, fading erase with stable undo'
  );

  await open('maze');
  s = await state();
  const old = s.visual;
  const direction = !s.grid[0][0].right ? 'ArrowRight' : 'ArrowDown';
  await page.keyboard.press(direction);
  await advance(70);
  s = await state();
  const c = 356 / s.size,
    target = { x: 2 + (s.player.x + 0.5) * c, y: 2 + (s.player.y + 0.5) * c };
  assert(s.visual.x !== old.x || s.visual.y !== old.y);
  assert(s.visual.x !== target.x || s.visual.y !== target.y);
  await shot('maze-walking');
  for (let i = 0; i < 6; i++) {
    s = await state();
    const walls = s.grid[s.player.y][s.player.x];
    const key = !walls.right
      ? 'ArrowRight'
      : !walls.bottom
        ? 'ArrowDown'
        : !walls.left
          ? 'ArrowLeft'
          : 'ArrowUp';
    await page.keyboard.press(key);
  }
  await advance(1800);
  s = await state();
  assert.equal(s.visual.walking, false);
  assert.equal(s.visual.queued, 0);
  assert.equal(s.visual.x, +(2 + (s.player.x + 0.5) * c).toFixed(2));
  assert.equal(s.visual.y, +(2 + (s.player.y + 0.5) * c).toFixed(2));
  console.log(
    'PASS Maze: movement between cells, queued turns and final player position'
  );

  await open('snake');
  await tap('Start');
  const snake = (await state()).visual;
  await advance(280);
  s = await state();
  const head = s.segments.at(-1);
  assert(s.visual.x > snake.x && s.visual.x < head.x * 18 + 9);
  await shot('snake-moving');
  await tap('Pause');
  const frozen = (await state()).visual;
  await advance(1000);
  assert.deepEqual((await state()).visual, frozen);
  console.log(
    'PASS Snake: visible travel between steps and paused interpolation'
  );

  await open('flappy');
  await tap('Take flight');
  await advance(35);
  s = await state();
  assert(s.visual.rotation < 0 && s.visual.rotation > -0.4);
  assert(s.visual.scale < 1 && s.visual.scale > 0.88);
  await shot('flappy-flap');
  console.log(
    'PASS Flappy: eased pitch, flap compression and continuous flight'
  );

  await open('tetris');
  await tap('Start');
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
  let cleared = false;
  for (let turn = 0; turn < 65 && !cleared; turn++) {
    s = await state();
    assert.equal(s.mode, 'playing');
    let matrix = s.piece.matrix,
      best;
    for (let r = 0; r < 4; r++, matrix = rotate(matrix))
      for (let x = -3; x < 10; x++) {
        if (collision(s.board, matrix, x, 0)) continue;
        let y = 0;
        while (!collision(s.board, matrix, x, y + 1)) y++;
        let board = s.board.map((row) => [...row]);
        matrix.forEach((row, j) =>
          row.forEach((v, i) => {
            if (v) board[y + j][x + i] = v;
          })
        );
        const rows = board.filter((row) => row.every(Boolean)).length;
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
          rows * 15;
        if (!best || cost < best.cost) best = { cost, r, x, rows };
      }
    assert(best);
    for (let r = 0; r < best.r; r++) await page.keyboard.press('ArrowUp');
    while ((await state()).piece.x !== best.x)
      await page.keyboard.press(
        (await state()).piece.x > best.x ? 'ArrowLeft' : 'ArrowRight'
      );
    await tap('Drop');
    const nextY = (await state()).piece.y;
    await advance(80);
    assert.equal((await state()).visual.phase, 'drop');
    assert.equal(
      (await state()).piece.y,
      nextY,
      'Next piece does not fall behind the landing animation'
    );
    if (best.rows) {
      cleared = true;
      await shot('tetris-drop');
      await advance(170);
      assert.equal((await state()).visual.phase, 'clear');
      assert(
        (await state()).visual.board.some(
          (block) => block.alpha > 0 && block.alpha < 1
        )
      );
      await shot('tetris-clear');
      await advance(170);
      assert.equal((await state()).visual.phase, 'settle');
      await shot('tetris-settle');
    }
    await advance(700);
  }
  assert(
    cleared,
    'Native controls produce a complete line to observe all three stages'
  );
  assert.equal((await state()).visual.phase, 'idle');
  console.log(
    'PASS Tetris: visible hard drop, fading line, downward collapse and paused gravity until resolution'
  );
  assert.deepEqual(errors, []);

  const real = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  const realPage = await real.newPage();
  await realPage.goto(`${base}/#hub`);
  await realPage.evaluate((saves) => {
    for (const [key, value] of Object.entries(saves))
      localStorage.setItem(key, JSON.stringify(value));
    location.hash = '2048';
  }, mergeSave);
  await realPage.waitForSelector('canvas[data-ready="true"]');
  for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'])
    await realPage.keyboard.press(key);
  await realPage.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).visual.phase === 'idle'
  );
  assertMergeSettled(
    await realPage.evaluate(() => JSON.parse(window.render_game_to_text()))
  );
  await realPage.keyboard.press('ArrowDown');
  await realPage.getByRole('button', { name: 'Back', exact: true }).click();
  await realPage.waitForTimeout(700);
  assert.equal(await realPage.locator('canvas').count(), 0);
  await real.close();
  console.log(
    'PASS real animation frames complete queued transitions and cancel on navigation'
  );

  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block'
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${base}/#hub`);
  await reducedPage.evaluate((saves) => {
    for (const [key, value] of Object.entries(saves))
      localStorage.setItem(key, JSON.stringify(value));
    location.hash = '2048';
  }, mergeSave);
  await reducedPage.waitForSelector('canvas[data-ready="true"]');
  await reducedPage.keyboard.press('ArrowLeft');
  assertMergeSettled(
    await reducedPage.evaluate(() => JSON.parse(window.render_game_to_text()))
  );
  await reduced.close();
  console.log(
    'PASS reduced motion resolves directly without a pending transition'
  );
} finally {
  await browser.close();
}
