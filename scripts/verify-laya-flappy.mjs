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
const real = process.env.LAYA_URL?.replace(/\/+$/, '');
const endpoint = real ?? 'https://laya.example';
const seeds = (process.env.TEST_SEEDS ?? '1,42,2026').split(',').map(Number);
const gates = Number(process.env.TEST_GATES ?? 12);
const realTime = process.env.TEST_REALTIME === '1';
const output = path.resolve(
  `output/laya-flappy-${real ? 'real' : 'fixture'}-${name}${realTime ? '-realtime' : ''}`
);
await fs.mkdir(output, { recursive: true });
const results = [];

try {
  for (const seed of seeds) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block'
    });
    await context.addInitScript(
      ({ seed, realTime }) => {
        let random = seed;
        Math.random = () =>
          (random = (Math.imul(random, 1664525) + 1013904223) >>> 0) /
          4294967296;
        if (!realTime) {
          window.requestAnimationFrame = () => 1;
          window.cancelAnimationFrame = () => {};
        }
      },
      { seed, realTime }
    );
    const calls = [],
      errors = [];
    await context.route(`${endpoint}/**`, async (route) => {
      const request = route.request();
      if (real) {
        // Relay the real service without depending on headless private-network permissions.
        const started = performance.now();
        const response = await fetch(request.url(), {
          method: request.method(),
          headers: {
            'Content-Type': 'application/json',
            Origin: new URL(base).origin
          },
          body: request.postData() ?? undefined,
          signal: AbortSignal.timeout(7000)
        });
        const body = await response.text();
        if (request.url().endsWith('/decision'))
          calls.push({
            observation: request.postDataJSON(),
            decision: JSON.parse(body),
            status: response.status,
            roundTripMs: performance.now() - started
          });
        await route
          .fulfill({
            status: response.status,
            contentType: 'application/json',
            body
          })
          .catch(() => {});
      } else if (request.url().endsWith('/health')) {
        await route.fulfill({
          json: {
            ready: true,
            protocol: 'aeroplay-laya-v1',
            model: 'Flight transport fixture',
            games: ['flappy']
          }
        });
      } else {
        const observation = request.postDataJSON();
        const choice = observation.context.includes('Flap: safe, closest')
          ? '0'
          : '1';
        assert(Object.hasOwn(observation.question.criteria, choice));
        calls.push({ observation, decision: { choice }, status: 200 });
        await route.fulfill({
          json: { choice, model: 'Flight transport fixture' }
        });
      }
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const state = () =>
      page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const advance = (ms) => page.evaluate((ms) => window.advanceTime(ms), ms);
    const count = () =>
      page
        .locator('.game-shell')
        .getAttribute('data-laya-decisions')
        .then(Number);
    await page.goto(`${base}/#hub`);
    await page.evaluate(
      (endpoint) =>
        localStorage.setItem(
          'aeroplay:laya-settings',
          JSON.stringify({ endpoint })
        ),
      endpoint
    );
    await page.reload();
    await page.waitForSelector(
      '.laya-settings-button[data-connection="ready"]'
    );
    await page.evaluate(() => {
      location.hash = 'flappy';
    });
    await page.waitForSelector('canvas[data-ready="true"]');
    await page.locator('.laya-watch').tap();
    await page.waitForSelector('.game-shell[data-player="laya"]');
    await page.waitForSelector('canvas[data-ready="true"]');
    let lastGate = 0;
    const limit = realTime ? gates * 200 : 600;
    for (let turn = 0; turn < limit && (await state()).passed < gates; turn++) {
      const before = await state();
      if (before.mode !== 'playing') break;
      if (realTime) {
        await page.waitForTimeout(100);
      } else {
        await page.waitForFunction(
          () =>
            Number(
              document.querySelector('.game-shell').dataset.layaDecisions
            ) > JSON.parse(window.render_game_to_text()).laya.turn,
          null,
          { polling: 20 }
        );
        const decided = await state();
        assert.equal(
          decided.bird.y,
          before.bird.y,
          'Position stays stable throughout inference'
        );
        assert.deepEqual(
          decided.pipes,
          before.pipes,
          'Pipes wait with the bird'
        );
        await advance(500);
      }
      const after = await state();
      if (after.passed > lastGate) {
        lastGate = after.passed;
        console.log(
          `${real ? 'REAL' : 'FIXTURE'} ${name} seed ${seed}: gate ${lastGate}, score ${after.score}, decisions ${await count()}`
        );
      }
    }
    const final = await state();
    if (realTime && final.mode === 'playing')
      await page.locator('.laya-pause').tap();
    await page.screenshot({
      path: path.join(output, `seed-${seed}.png`),
      fullPage: true
    });
    await fs.writeFile(
      path.join(output, `seed-${seed}.json`),
      JSON.stringify({ state: final, calls }, null, 2)
    );
    assert.equal(
      final.mode,
      'playing',
      JSON.stringify({ seed, state: final, lastCalls: calls.slice(-3) })
    );
    assert(final.passed >= gates);
    assert.deepEqual(errors, []);
    const humanSaves = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith('aeroplay:flappy:')
        )
      )
    );
    assert.deepEqual(humanSaves, {}, 'Model runs do not write human records');
    results.push({
      seed,
      gates: final.passed,
      score: final.score,
      decisions: await count(),
      requests: calls.length,
      model: calls[0]?.decision.model
    });
    await context.close();
  }
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(
    `PASS ${real ? 'real-model' : 'model-independent transport'} Flappy flights: ${JSON.stringify(results)}`
  );
} finally {
  await browser.close();
}
