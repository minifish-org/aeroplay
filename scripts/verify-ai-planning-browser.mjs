import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => { let seed = 42; Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296; });
await mkdir('output/ai-planning', { recursive: true });
try {
  await page.goto(`${process.env.TEST_URL ?? 'http://127.0.0.1:5173'}/#flappy`);
  await page.waitForSelector('.player-watch');
  await page.evaluate(async () => { const { prepareTamev } = await import('/src/core/ai-model.ts'); await prepareTamev(); });
  await page.click('.player-watch');
  await page.waitForTimeout(4500);
  const result = await page.evaluate(() => ({ state: JSON.parse(window.render_game_to_text()), decisions: Number(document.querySelector('.game-shell').dataset.playerDecisions), discarded: Number(document.querySelector('.game-shell').dataset.playerDiscarded), panel: document.querySelector('.player-session').textContent }));
  await page.screenshot({ path: 'output/ai-planning/flappy.png' });
  await writeFile('output/ai-planning/flappy.json', JSON.stringify({ ...result, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(result.decisions > 5, 'Real TAMEV selects plans executed as ordinary inputs');
  assert.ok(result.state.distance > 250, 'Flight advances normally while planning and inference run');
  await page.click('.player-takeover');
  assert.equal(await page.locator('.game-shell').getAttribute('data-player'), 'human');
  console.log(`PASS real TAMEV planning: ${result.decisions} native inputs, ${result.state.passed} gates, distance ${Math.round(result.state.distance)}; takeover succeeds; no browser errors`);
} finally { await browser.close(); }
