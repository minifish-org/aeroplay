import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const browser = await chromium.launch({ headless: true });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:4173';
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const errors = [],
  external = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (new URL(request.url()).origin !== new URL(base).origin)
    external.push(request.url());
});
try {
  await page.goto(base);
  await page.waitForFunction(() =>
    document
      .querySelector('.offline-badge')
      ?.textContent.includes('Offline ready')
  );
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await (
        await caches.open(names.find((n) => n.startsWith('aeroplay-')))
      ).keys()
    ).map((r) => new URL(r.url).pathname);
  });
  assert(cached.some((p) => p.endsWith('.js')));
  assert(cached.some((p) => p.endsWith('.css')));
  assert(cached.includes('/index.html'));
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.hub-card');
  assert.equal(await page.locator('.hub-card').count(), 8);
  for (const id of [
    'snake',
    'tetris',
    '2048',
    'flappy',
    'maze',
    'match3',
    'sudoku',
    'lightsout'
  ]) {
    await page.evaluate((id) => {
      location.hash = id;
    }, id);
    await page.waitForFunction(
      (id) =>
        window.render_game_to_text &&
        JSON.parse(window.render_game_to_text()).game === id,
      id
    );
    assert(await page.locator('.game-area').isVisible());
  }
  await page.evaluate(() => {
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
    );
    location.hash = '2048';
  });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === '2048'
  );
  const box = await page.locator('.grid-2048').boundingBox();
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width - 30, y: box.y + box.height / 2 }]
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: box.x + 30, y: box.y + box.height / 2 }]
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).moves === 1
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).score),
    4
  );
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).score),
    4
  );
  await fs.mkdir('output/offline', { recursive: true });
  await page.screenshot({
    path: 'output/offline/2048-swipe.png',
    fullPage: true
  });
  await page.evaluate(() => {
    location.hash = 'snake';
  });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === 'snake'
  );
  const snakeBox = await page.locator('canvas').boundingBox();
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {
        x: snakeBox.x + snakeBox.width / 2,
        y: snakeBox.y + snakeBox.height - 30
      }
    ]
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: snakeBox.x + snakeBox.width / 2, y: snakeBox.y + 30 }]
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).direction.y === -1
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode),
    'playing'
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).tap();
  await page.screenshot({
    path: 'output/offline/snake-touch.png',
    fullPage: true
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    `PASS Offline: ${cached.length} cached resources, offline reload, all eight games, saved scores, real 2048/Snake touch swipes, no external requests or page errors`
  );
} finally {
  await browser.close();
}
