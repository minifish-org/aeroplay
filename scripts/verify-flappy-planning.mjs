import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/games/flappyFlight.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm'
});
const { planFlight, flightCollision } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
assert.deepEqual(
  Object.keys(planFlight(40, 80, [], 0).choices),
  ['1'],
  'A flap near the ceiling is excluded'
);
assert.deepEqual(
  Object.keys(planFlight(430, 90, [], 0).choices),
  ['0'],
  'Falling into the ground requires a flap'
);
const pipe = { x: 82, gapY: 60, gap: 180, scored: false };
assert.deepEqual(
  Object.keys(planFlight(112, -160, [pipe], 0).choices),
  ['1'],
  'Check the whole upward arc, not only the first short step'
);
assert.deepEqual(
  Object.keys(planFlight(112, 0, [{ ...pipe, x: 124 }], 0).choices),
  ['1'],
  'Look ahead to a pipe arriving during the upward arc'
);
assert.equal(flightCollision(440, []), false);
assert.equal(flightCollision(441, []), true);
const untouched = structuredClone(pipe);
planFlight(160, 120, [pipe], 0);
assert.deepEqual(pipe, untouched, 'Planning never moves real pipes');
console.log(
  'PASS flight planning: ceiling, ground, upward arc, approaching pipe, immutable state'
);

const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const name = process.env.TEST_BROWSER ?? 'chromium';
const browser = await (name === 'webkit' ? webkit : chromium).launch({
  headless: true
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block'
});
await context.addInitScript(() => {
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const arrived = Array.from({ length: 3 }, deferred);
const release = Array.from({ length: 3 }, deferred);
const waitForArrival = async (index) => {
  let timer;
  try {
    await Promise.race([
      arrived[index].promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Decision request did not arrive')),
          10000
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};
let requests = 0;
await context.route('https://laya.example/**', async (route) => {
  if (route.request().url().endsWith('/health')) {
    await route.fulfill({
      json: {
        ready: true,
        protocol: 'aeroplay-laya-v1',
        model: 'Delayed flight fixture',
        games: ['flappy']
      }
    });
    return;
  }
  const observation = route.request().postDataJSON();
  const index = requests++;
  if (index < 3) {
    arrived[index].resolve();
    await release[index].promise;
  }
  const choice = observation.context.includes('Flap: safe, closest')
    ? '0'
    : '1';
  assert(Object.hasOwn(observation.question.criteria, choice));
  await route
    .fulfill({ json: { choice, model: 'Delayed flight fixture' } })
    .catch(() => {});
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
const count = () =>
  page.locator('.game-shell').getAttribute('data-laya-decisions').then(Number);
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
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
  await page.evaluate(() => {
    location.hash = 'flappy';
  });
  await page.waitForSelector('canvas[data-ready="true"]');
  await page.locator('.laya-watch').tap();
  await page.waitForSelector('.game-shell[data-player="laya"]');
  await waitForArrival(0);
  const held = await state();
  await advance(2000);
  const waiting = await state();
  assert.deepEqual(waiting.bird, held.bird);
  assert.deepEqual(waiting.pipes, held.pipes);
  assert.equal(waiting.laya.turn, held.laya.turn);
  assert.equal(waiting.mode, 'playing');
  assert.equal(await count(), 0);
  console.log(
    'PASS long inference holds bird, pipes and observation instead of expiring'
  );
  await page.locator('.laya-pause').tap();
  release[0].resolve();
  await page.waitForTimeout(150);
  assert.equal(await count(), 0, 'An answer received after pause never acts');
  assert.equal((await state()).mode, 'paused');
  await page.locator('.laya-pause').tap();
  await waitForArrival(1);
  release[1].resolve();
  await page.waitForFunction(
    () => document.querySelector('.game-shell').dataset.layaDecisions === '1',
    null,
    { polling: 20 }
  );
  assert.equal((await state()).bird.y, held.bird.y);
  await advance(200);
  const inFlight = await state();
  assert(inFlight.bird.y !== held.bird.y);
  assert.equal(inFlight.laya.turn, 0, 'A flight step is still in progress');
  await page.locator('.laya-pause').tap();
  await advance(1000);
  assert.deepEqual((await state()).bird, inFlight.bird);
  await page.locator('.laya-pause').tap();
  await advance(500);
  assert.equal(
    (await state()).laya.turn,
    1,
    'Resume finishes exactly the remaining flight step'
  );
  await waitForArrival(2);
  console.log(
    'PASS pause, late reply rejection and resume midway through a flight'
  );
  await page.locator('.laya-takeover').tap();
  release[2].resolve();
  await page.waitForTimeout(150);
  assert.equal(await count(), 1, 'Takeover rejects the pending model response');
  assert.equal(
    await page.locator('.game-area').evaluate((area) => area.inert),
    false
  );
  const human = await state();
  await advance(200);
  assert((await state()).bird.y !== human.bird.y);
  await page.getByRole('button', { name: 'Flap', exact: true }).tap();
  assert.equal((await state()).bird.velocity, -235);
  await advance(3000);
  assert.equal((await state()).mode, 'over');
  await page.getByRole('button', { name: 'Try again', exact: true }).tap();
  assert.equal((await state()).mode, 'ready');
  assert.equal((await state()).score, 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('aeroplay:flappy:best')),
    null
  );
  const output = path.resolve(`output/flappy-planning-${name}`);
  await fs.mkdir(output, { recursive: true });
  await advance(350);
  await page.screenshot({
    path: path.join(output, 'lifecycle.png'),
    fullPage: true
  });
  await page.getByRole('button', { name: 'Back', exact: true }).tap();
  await page.waitForFunction(
    () => document.querySelector('.hub-grid') !== null,
    null,
    {
      polling: 20
    }
  );
  assert.equal(await page.locator('canvas').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS takeover, human controls, loss/retry, save isolation and navigation'
  );
} finally {
  release.forEach((item) => item.resolve());
  await browser.close();
}
