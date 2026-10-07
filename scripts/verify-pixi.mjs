import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const browserName = process.env.TEST_BROWSER ?? 'chromium';
const browser = await (browserName === 'webkit' ? webkit : chromium).launch({
  headless: true
});
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const output = path.resolve(`output/pixi-${browserName}`);
await fs.mkdir(output, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block'
});
const page = await context.newPage();
const errors = [],
  external = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('request', (request) => {
  if (
    /^https?:/.test(request.url()) &&
    new URL(request.url()).origin !== new URL(base).origin
  )
    external.push(request.url());
});
await page.addInitScript(() => {
  window.__renderAudit = { created: 0, released: 0, draws: 0 };
  const getContext = HTMLCanvasElement.prototype.getContext;
  const seen = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = getContext.apply(this, args);
    if (
      gl &&
      this.dataset.renderer === 'pixi' &&
      args[0].startsWith('webgl') &&
      !seen.has(gl)
    ) {
      seen.add(gl);
      window.__renderAudit.created++;
      for (const name of [
        'drawElements',
        'drawArrays',
        'drawElementsInstanced',
        'drawArraysInstanced'
      ]) {
        if (!gl[name]) continue;
        const draw = gl[name].bind(gl);
        gl[name] = (...args) => {
          window.__renderAudit.draws++;
          return draw(...args);
        };
      }
      const getExtension = gl.getExtension.bind(gl);
      const extensions = new WeakSet();
      gl.getExtension = (name) => {
        const extension = getExtension(name);
        if (
          name === 'WEBGL_lose_context' &&
          extension &&
          !extensions.has(extension)
        ) {
          extensions.add(extension);
          const lose = extension.loseContext.bind(extension);
          extension.loseContext = () => {
            window.__renderAudit.released++;
            lose();
          };
        }
        return extension;
      };
    }
    return gl;
  };
});
const games = [
  'snake',
  'tetris',
  '2048',
  'flappy',
  'maze',
  'match3',
  'sudoku',
  'lightsout'
];
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const tap = (name) => page.getByRole('button', { name, exact: true }).tap();
async function open(game) {
  await page.evaluate((game) => {
    location.hash = game;
  }, game);
  await page.waitForFunction(
    (game) =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === game,
    game
  );
  await page.waitForSelector('canvas[data-renderer="pixi"][data-ready="true"]');
  assert.equal(await page.locator('canvas').count(), 1);
}
async function shot(name) {
  await advance(0);
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true
  });
  await fs.writeFile(
    path.join(output, `${name}.json`),
    JSON.stringify(await state(), null, 2)
  );
}
async function pixels() {
  const buffer = await page.locator('canvas').screenshot();
  return createHash('sha256').update(buffer).digest('hex');
}

try {
  await page.goto(`${base}/#hub`);
  await page.evaluate(() =>
    localStorage.setItem(
      'aeroplay:game2048:state',
      JSON.stringify({
        grid: [
          [2, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0]
        ],
        score: 0,
        moves: 0
      })
    )
  );
  for (const game of games) {
    await open(game);
    const before = await pixels();
    if (game === 'snake') {
      await tap('Start');
      await page.keyboard.press('ArrowUp');
      await advance(260);
    }
    if (game === 'tetris') {
      await tap('Start');
      await page.keyboard.press('ArrowLeft');
      await tap('Drop');
      await advance(150);
    }
    if (game === '2048') {
      await page.keyboard.press('ArrowLeft');
      await advance(80);
      await shot('2048-merge');
      await advance(220);
      assert.equal((await state()).score, 4);
    }
    if (game === 'flappy') {
      await tap('Take flight');
      await advance(120);
    }
    if (game === 'maze') {
      const s = await state(),
        cell = s.grid[s.player.y][s.player.x];
      await page.keyboard.press(!cell.right ? 'ArrowRight' : 'ArrowDown');
      await advance(150);
    }
    if (game === 'match3') {
      await tap('Hint');
      const { hinted } = await state();
      for (const p of hinted)
        await page
          .locator(`.match3-cell[data-x="${p.x}"][data-y="${p.y}"]`)
          .tap();
      await advance(65);
      await shot('match3-impact');
      await advance(140);
      await shot('match3-falling');
      await advance(1600);
      assert.equal((await state()).moves, 29);
      assert((await state()).score > 0);
    }
    if (game === 'sudoku') {
      const s = await state(),
        index = s.board.findIndex(
          (value, i) => !value && !s.givens.includes(i)
        );
      await page.locator(`.sudoku-cell[data-idx="${index}"]`).tap();
      await tap('Notes: Off');
      await page.keyboard.press('1');
      await advance(120);
      assert((await state()).notes[index].includes(1));
    }
    if (game === 'lightsout') {
      await page.locator('.light-cell').first().tap();
      await advance(90);
      await shot('lightsout-ripple');
      await advance(700);
    }
    await shot(game);
    assert.notEqual(
      await pixels(),
      before,
      `${game} changes its rendered board after input`
    );
    const box = await page.locator('canvas').boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 391);
    console.log(
      `PASS ${game}: Pixi scene, native input, visual feedback, mobile screenshot`
    );
  }
  for (const game of ['2048', 'lightsout', 'sudoku']) {
    await open(game);
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => window.__renderAudit.draws);
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => window.__renderAudit.draws),
      before,
      `${game} renderer does not redraw while idle`
    );
  }
  for (const game of ['snake', 'tetris', 'flappy']) {
    await open(game);
    await tap(game === 'flappy' ? 'Take flight' : 'Start');
    if (game === 'tetris') await tap('Drop');
    else await page.waitForTimeout(120);
    await tap('Pause');
    await page.waitForTimeout(50);
    const before = await page.evaluate(() => window.__renderAudit.draws);
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => window.__renderAudit.draws),
      before,
      `${game} stops rendering paused effects`
    );
  }
  for (let i = 0; i < 20; i++) {
    const game = games[i % games.length];
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
  await page.evaluate(() => {
    location.hash = 'hub';
  });
  await page.waitForSelector('.hub-card');
  await page.waitForTimeout(500);
  const audit = await page.evaluate(() => window.__renderAudit);
  assert.equal(
    audit.created,
    1,
    'All eight games reuse one GPU context, including interrupted initialization'
  );
  assert.equal(
    audit.released,
    0,
    'The reusable context remains available for the page lifetime'
  );
  assert.equal(await page.locator('canvas').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    'PASS idle and paused rendering, rapid navigation, one reusable GPU context, no errors or external requests'
  );

  const reduced = await browser.newContext({
    viewport: { width: 320, height: 844 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block'
  });
  const reducedPage = await reduced.newPage();
  for (const game of games) {
    await reducedPage.goto(`${base}/#${game}`);
    await reducedPage.waitForSelector('canvas[data-ready="true"]');
    assert(
      await reducedPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    );
  }
  await reducedPage.screenshot({
    path: path.join(output, 'reduced-motion-320.png'),
    fullPage: true
  });
  await reduced.close();
  console.log('PASS reduced motion and 320px layouts for all eight scenes');

  const fallback = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  await fallback.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind.startsWith('webgl') ? null : get.call(this, kind, ...args);
    };
    Object.defineProperty(navigator, 'gpu', { get: () => undefined });
  });
  const fallbackPage = await fallback.newPage(),
    fallbackErrors = [];
  fallbackPage.on('pageerror', (error) => fallbackErrors.push(error.message));
  fallbackPage.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      if (
        message.text() !== 'Service Worker registration blocked by Playwright'
      )
        fallbackErrors.push(message.text());
  });
  for (const game of games) {
    await fallbackPage.goto(`${base}/#${game}`);
    await fallbackPage.waitForSelector('canvas[data-ready="true"]');
    if (game === 'lightsout') {
      await fallbackPage.locator('.light-cell').first().click();
      await fallbackPage.waitForTimeout(300);
    }
  }
  await fallbackPage.screenshot({
    path: path.join(output, 'canvas-fallback.png'),
    fullPage: true
  });
  assert.deepEqual(fallbackErrors, []);
  await fallback.close();
  console.log(
    'PASS Canvas fallback without GPU acceleration or unsupported filter warnings'
  );
} finally {
  await browser.close();
}
