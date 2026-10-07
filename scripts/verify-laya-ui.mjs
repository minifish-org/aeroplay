import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Fake transport verifies adapter and UI integration, not a model's playing skill.
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const browser = await (
  process.env.TEST_BROWSER === 'webkit' ? webkit : chromium
).launch({ headless: true });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  serviceWorkers: 'block'
});
const games = [
  'snake',
  'tetris',
  '2048',
  'flappy',
  'maze',
  'match3',
  'sudoku',
  'lightsout',
  'sky',
  'cargo'
];
await context.route('https://laya.example/**', async (route) => {
  const request = route.request();
  if (request.url().endsWith('/health')) {
    await route.fulfill({
      json: {
        ready: true,
        protocol: 'aeroplay-laya-v1',
        model: 'Verification transport',
        games
      }
    });
  } else {
    const payload = request.postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route
      .fulfill({
        json: {
          choice: Object.keys(payload.question.criteria)[0],
          model: 'Verification transport'
        }
      })
      .catch(() => {});
  }
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const humanSaves = () =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(
        ([key]) =>
          key.startsWith('aeroplay:') &&
          !key.startsWith('aeroplay:laya:') &&
          !['aeroplay:laya-settings', 'aeroplay:last-game'].includes(key)
      )
    )
  );
try {
  await page.goto(`${base}/#hub`);
  await page.evaluate(() =>
    localStorage.setItem(
      'aeroplay:laya-settings',
      JSON.stringify({ endpoint: 'https://laya.example' })
    )
  );
  await page.reload();
  await page.waitForSelector('.laya-settings-button[data-connection="ready"]');
  for (const game of games) {
    await page.evaluate((game) => {
      location.hash = game;
    }, game);
    await page.waitForFunction(
      (game) =>
        window.render_game_to_text &&
        JSON.parse(window.render_game_to_text()).game === game,
      game
    );
    if (!['sky', 'cargo'].includes(game))
      await page.waitForSelector('canvas[data-ready="true"]');
    await page.locator('.laya-watch').tap();
    await page.waitForSelector('.game-shell[data-player="laya"]');
    const saved = await humanSaves();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('.game-shell').dataset.layaDecisions) >= 1
    );
    assert(await page.locator('.game-area').evaluate((area) => area.inert));
    await page.locator('.laya-pause').tap();
    await page.waitForSelector('.game-shell[data-laya-status="paused"]');
    const decisions = await page
      .locator('.game-shell')
      .getAttribute('data-laya-decisions');
    await page.waitForTimeout(350);
    assert.equal(
      await page.locator('.game-shell').getAttribute('data-laya-decisions'),
      decisions,
      'Late decisions cannot act after pause'
    );
    assert.deepEqual(
      await humanSaves(),
      saved,
      'Laya does not change personal saves'
    );
    await page.locator('.laya-takeover').tap();
    await page.waitForSelector('.game-shell[data-player="human"]');
    assert.equal(
      await page.locator('.game-area').evaluate((area) => area.inert),
      false
    );
    console.log(
      `PASS ${game}: decision, pause, stale response rejection, save isolation, human takeover`
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
