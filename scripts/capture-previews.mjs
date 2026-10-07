import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Capture the real presentation classes with representative, synthetic boards.
// This authoring tool uses an isolated browser context on Vite's development server.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 420, height: 600 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block'
});
const output = path.resolve('public/assets/previews');
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
await fs.mkdir(output, { recursive: true });
try {
  for (const game of [
    'snake',
    'tetris',
    '2048',
    'flappy',
    'match3',
    'sudoku',
    'lightsout'
  ]) {
    await page.goto(`${base}/?preview=${game}`);
    await page.evaluate(async (game) => {
      document.body.innerHTML = '<div id="preview"></div>';
      document.body.style.cssText = 'margin:0;padding:0;background:#0b1226';
      const host = document.querySelector('#preview');
      const canvas = document.createElement('canvas');
      host.append(canvas);
      const board = document.createElement('div');
      host.append(board);
      let view;
      if (game === 'snake') {
        const { SnakeView } = await import('/src/games/views/snake.ts');
        view = new SnakeView(canvas);
        const snake = [
          { x: 4, y: 13 },
          { x: 4, y: 12 },
          { x: 4, y: 11 },
          { x: 4, y: 10 },
          { x: 5, y: 10 },
          { x: 6, y: 10 },
          { x: 7, y: 10 },
          { x: 8, y: 10 },
          { x: 8, y: 9 },
          { x: 8, y: 8 },
          { x: 9, y: 8 },
          { x: 10, y: 8 },
          { x: 11, y: 8 },
          { x: 12, y: 8 },
          { x: 12, y: 7 },
          { x: 12, y: 6 }
        ];
        view.draw(
          snake,
          { x: 0, y: -1 },
          { x: 12, y: 3 },
          { x: 16, y: 7 },
          'playing',
          0
        );
      }
      if (game === 'tetris') {
        const { TetrisView } = await import('/src/games/views/tetris.ts');
        view = new TetrisView(canvas);
        const grid = Array.from({ length: 20 }, () => Array(10).fill(0));
        const rows = [
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [0, 0, 5, 5, 0, 0, 0, 0, 0, 0],
          [0, 5, 5, 3, 0, 0, 2, 0, 0, 0],
          [0, 6, 3, 3, 3, 0, 2, 2, 2, 0],
          [6, 6, 6, 4, 4, 0, 1, 1, 1, 1],
          [7, 7, 0, 4, 4, 0, 5, 5, 3, 3],
          [0, 7, 7, 6, 6, 6, 0, 5, 5, 3]
        ];
        rows.forEach((row, i) => {
          grid[13 + i] = row;
        });
        view.draw(
          grid,
          {
            x: 3,
            y: 6,
            matrix: [
              [0, 1, 0],
              [1, 1, 1],
              [0, 0, 0]
            ]
          },
          11,
          'playing',
          0,
          0
        );
      }
      if (game === '2048') {
        const { MergeView } = await import('/src/games/views/puzzles.ts');
        canvas.remove();
        view = new MergeView(board);
        view.draw(
          [
            [2, 8, 16, 128],
            [4, 32, 256, 16],
            [2, 64, 8, 512],
            [0, 16, 32, 4]
          ],
          {}
        );
      }
      if (game === 'flappy') {
        const { FlappyView } = await import('/src/games/views/flappy.ts');
        view = new FlappyView(canvas);
        view.draw(
          226,
          -80,
          [{ x: 177, gapY: 145, gap: 170, scored: false }],
          700,
          'playing',
          0,
          false
        );
      }
      if (game === 'match3') {
        const { GemView } = await import('/src/games/views/gems.ts');
        canvas.remove();
        view = new GemView(board);
        const grid = Array.from({ length: 8 }, (_, y) =>
          Array.from(
            { length: 8 },
            (_, x) => (x * 3 + y * 2 + ((x * y) % 3)) % 5
          )
        );
        view.draw(grid, { x: 3, y: 3 }, [], [], 'playing', 0, []);
      }
      if (game === 'sudoku') {
        const { SudokuView } = await import('/src/games/views/puzzles.ts');
        canvas.remove();
        view = new SudokuView(board);
        const puzzle =
          '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
        [...puzzle].forEach((value, i) => {
          const cell = document.createElement('button');
          cell.textContent = value === '0' ? '' : value;
          cell.className = `sudoku-cell ${value !== '0' ? 'given' : ''} ${Math.floor(i / 9) === 3 || i % 9 === 4 ? 'peer' : ''} ${i === 31 ? 'selected' : ''}`;
          board.append(cell);
        });
        view.draw(board);
      }
      if (game === 'lightsout') {
        const { LightsView } = await import('/src/games/views/puzzles.ts');
        canvas.remove();
        view = new LightsView(board);
        view.draw(
          [
            0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1,
            0, 0
          ],
          -1
        );
      }
      window.__preview = view;
      if (!['2048', 'match3', 'sudoku', 'lightsout'].includes(game)) {
        board.remove();
        canvas.style.cssText = 'display:block;width:400px;height:auto;margin:0';
      } else host.style.width = '400px';
    }, game);
    await page.waitForSelector('canvas[data-ready="true"]');
    await page.evaluate(() => {
      window.__preview.scene.advance(250);
    });
    await page.locator('canvas').screenshot({
      path: path.join(output, `${game}.jpg`),
      type: 'jpeg',
      quality: 92
    });
    await page.evaluate(() => window.__preview.dispose());
    console.log(`Captured ${game}`);
  }
  for (const game of ['maze', 'sky', 'cargo']) {
    await page.goto(`${base}/?preview=${game}#${game}`);
    await page.waitForFunction(
      (game) =>
        window.render_game_to_text &&
        JSON.parse(window.render_game_to_text()).game === game,
      game
    );
    if (game === 'sky') {
      await page
        .getByRole('button', { name: 'Take flight →', exact: true })
        .click();
      await page.evaluate(() => window.advanceTime(1200));
    }
    if (game === 'maze') {
      await page.waitForSelector('canvas[data-ready="true"]');
      await page.getByRole('button', { name: 'Hint · 3', exact: true }).click();
      await page.evaluate(() => window.advanceTime(200));
    }
    await page.waitForTimeout(200);
    await page.locator('canvas').screenshot({
      path: path.join(output, `${game}.jpg`),
      type: 'jpeg',
      quality: 92
    });
    console.log(`Captured ${game}`);
  }
} finally {
  await browser.close();
}
