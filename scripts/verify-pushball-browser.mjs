import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [], external = [];
const base = process.env.TEST_URL ?? 'http://127.0.0.1:4192/';
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (!request.url().startsWith(new URL(base).origin) && /^https?:/.test(request.url())) external.push(request.url()); });
const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  await page.goto(`${base}#pushball`);
  await page.getByRole('button', { name: 'Start match', exact: true }).waitFor();
  assert.equal(await page.locator('.player-watch').count(), 0, 'Versus mode has no watch/takeover controls');
  assert.equal(await page.locator('.game-area').evaluate(element => element.inert), false);
  if (process.env.TEST_OFFLINE === '1') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await context.setOffline(true); await page.reload();
    await page.getByRole('button', { name: 'Start match', exact: true }).waitFor();
  }
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing', null, { timeout: 120000 });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ai.decisions >= 3, null, { timeout: 20000 });
  const live = await read();
  assert.equal(live.ai.error, ''); assert(live.ai.modelReady);
  assert(Math.hypot(live.robots[1].y + 5.5, live.robots[1].x) > 0.1, 'Real TAMEV supplies movement');
  console.log(`PASS real TAMEV + planning: ${live.ai.decisions} native inputs, plan ${live.ai.plan}`);
  const before = await read();
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
  assert((await read()).robots[0].x > before.robots[0].x + 0.5);
  await page.keyboard.press('Space'); await page.waitForTimeout(50);
  assert((await read()).robots[0].cooldown > 2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await read(); await page.waitForTimeout(300);
  assert.equal((await read()).elapsed, paused.elapsed); assert.equal((await read()).ai.status, 'paused');
  await page.getByRole('button', { name: 'Resume match', exact: true }).click();
  await page.waitForFunction(time => JSON.parse(window.render_game_to_text()).elapsed > time + 0.1, paused.elapsed);
  console.log('PASS keyboard movement, directional dash, pause/resume and fresh opponent planning');
  if (engine === chromium) {
    // Use a fresh kickoff so scoring cannot reset the joystick or cooldown
    // between the two native touches in this control test.
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'New match', exact: true }).click();
    await page.waitForFunction(() => {
      const state = JSON.parse(window.render_game_to_text());
      return state.mode === 'playing' && state.kickoff === 0;
    });
    const session = await context.newCDPSession(page);
    const stick = await page.locator('.pushball-stick').boundingBox();
    const dash = await page.locator('.pushball-dash').boundingBox();
    const point = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 0 };
    const movePoint = { ...point, x: point.x - 27, y: point.y - 18 };
    const touch = (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
    const start = await read();
    await touch('touchStart', [point]); await touch('touchMove', [movePoint]);
    await page.waitForTimeout(400);
    const moved = await read(); assert(moved.robots[0].x < start.robots[0].x - 0.4);
    assert.equal(moved.robots[0].cooldown, 0);
    const dashPoint = { x: dash.x + dash.width / 2, y: dash.y + dash.height / 2, id: 1 };
    await touch('touchStart', [movePoint, dashPoint]); await touch('touchEnd', [movePoint]);
    await page.waitForTimeout(100); assert((await read()).robots[0].cooldown > 2);
    await touch('touchEnd', []); await page.waitForTimeout(100);
    assert(Math.hypot(...Object.values((await read()).controls[0]).slice(0, 2)) < 0.01);
    await session.detach(); console.log('PASS native touch joystick, simultaneous dash and release');
  }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(50);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: no horizontal overflow`);
    if (width <= 390) assert(await page.locator('.pushball-utility').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight), `${width}px: controls fit without scrolling`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  await fs.mkdir('output', { recursive: true });
  await page.screenshot({ path: `output/pushball-${process.env.TEST_BROWSER ?? 'chromium'}${process.env.TEST_OFFLINE === '1' ? '-offline' : ''}.png` });
  const sceneCanvas = page.locator('.pushball-view canvas');
  await sceneCanvas.evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  assert.equal((await read()).mode, 'paused');
  await sceneCanvas.evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextrestored')));
  await page.getByRole('button', { name: 'Resume match', exact: true }).click();
  assert.equal((await read()).mode, 'playing');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.waitForFunction(() => !window.render_game_to_text);
  await page.locator('[data-game="pushball"]').click();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ai.decisions >= 1, null, { timeout: 15000 });
  const second = await read(); assert.equal(second.ai.error, '');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await fs.writeFile(`output/pushball-${process.env.TEST_BROWSER ?? 'chromium'}${process.env.TEST_OFFLINE === '1' ? '-offline' : ''}.json`, JSON.stringify({ live, second, errors, external, offline: process.env.TEST_OFFLINE === '1' }, null, 2));
  console.log('PASS 320/390/768px layouts, graphics interruption, navigation teardown, remount and zero external requests');
} finally { await browser.close(); }
