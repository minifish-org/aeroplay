import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const name = process.env.TEST_BROWSER ?? 'chromium';
const browser = await (name === 'webkit' ? webkit : chromium).launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage(), errors = [], external = [];
const base = process.env.TEST_URL ?? 'http://127.0.0.1:4193/';
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const cached = await page.evaluate(async () => {
    const files = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) files.push(new URL(request.url).pathname);
    return files;
  });
  assert(cached.some(file => file.includes('opponent.worker-')), 'New opponent planning worker is precached');
  assert(cached.some(file => file.includes('ai-planning.worker-')), 'Existing solo planning worker is precached');
  assert(cached.includes('/models/tamev-nano/model_int8.onnx'));
  assert(cached.some(file => file.endsWith('.wasm')));
  await context.setOffline(true);
  await page.goto(`${base}#pushball`); await page.reload();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ai.decisions >= 4, null, { timeout: 120000 });
  const cold = await read();
  assert.equal(cold.ai.error, ''); assert.equal(cold.ai.modelInitializations, 1);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(100);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width <= 390) assert(await page.locator('.pushball-utility').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight), `${width}px controls fit in the viewport`);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
  await fs.mkdir('output', { recursive: true });
  await page.screenshot({ path: `output/pushball-${name}-offline.png` });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('[data-game="pushball"]').click();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ai.decisions >= 1, null, { timeout: 20000 });
  const remount = await read(); assert.equal(remount.ai.modelInitializations, 1); assert.equal(remount.ai.error, '');
  let completed = null;
  if (process.env.TEST_COMPLETE_MATCH === '1') {
    // Keep the human on the sideline so this exercises scoring, not a winning-strategy benchmark.
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const state = await read();
      if (state.mode === 'over') { completed = state; break; }
      if (state.kickoff === 0 && state.robots[0].x < 3.5) {
        await page.keyboard.down('ArrowRight'); await page.waitForTimeout(850); await page.keyboard.up('ArrowRight');
      } else await page.waitForTimeout(250);
    }
    assert(completed, 'AI finishes a match against a sideline human within 90 seconds');
    assert.equal(completed.winner, 1); assert.equal(completed.score[1], 3);
    assert.equal(completed.ai.error, '', 'An imminent winning goal is not a planning failure');
    const records = await page.evaluate(() => ({ human: localStorage.getItem('aeroplay:pushball:matches'), assisted: localStorage.getItem('aeroplay:ai:pushball:matches') }));
    assert.equal(records.human, '1'); assert.equal(records.assisted, null);
    await page.getByRole('button', { name: 'Play again', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing');
    assert.deepEqual((await read()).score, [0, 0]);
    console.log('PASS real AI goals, first-to-three result, personal match record and replay');
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await fs.writeFile(`output/pushball-${name}-offline.json`, JSON.stringify({ cached: cached.length, cold, remount, completed, errors, external }, null, 2));
  console.log(`PASS production cold-offline TAMEV, ${cached.length} precached resources, both planner bundles, resident remount, fitted controls and zero external requests`);
} finally { await browser.close(); }
