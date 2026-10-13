import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const out = 'output/layout';
await mkdir(out, { recursive: true });

// Laptop, iPhone portrait and iPhone landscape, sized from the reference devices.
const viewports = [
  { name: 'macbook-14', width: 1512, height: 982, dsf: 2, mobile: false },
  { name: 'iphone-portrait', width: 390, height: 844, dsf: 3, mobile: true },
  { name: 'iphone-landscape', width: 844, height: 390, dsf: 3, mobile: true }
];
const games = [
  'snake', 'tetris', '2048', 'flappy', 'maze', 'match3', 'sudoku', 'lightsout',
  'sky', 'cargo', 'pushball'
];

const browser = await webkit.launch({ headless: true });
try {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const failures = [];
    for (const route of games) {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/#${route}`);
      await page.waitForTimeout(1100);
      const layout = await page.evaluate(() => {
        const box = (selector) => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        };
        return {
          docHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          overflowRight: [...document.querySelectorAll('*')]
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .map((el) => el.className || el.tagName)
            .slice(0, 3),
          visual: box('.game-area > canvas, .game-area > .pixi-board, .game-area > .three-view, .game-area > .pushball-view, .game-area > .game-surface')
        };
      });
      await page.screenshot({ path: `${out}/${vp.name}-${route}.png` });
      if (errors.length) failures.push(`${route}: page errors ${errors.join(' / ')}`);
      if (!layout.visual) failures.push(`${route}: no game surface found`);
      if (layout.visual && layout.visual.h < 120)
        failures.push(`${route}: the play surface fell back to ${layout.visual.h}px`);
      if (layout.overflowRight.length)
        failures.push(`${route}: overflows right (${layout.overflowRight.join(', ')})`);
      if (layout.docHeight > layout.viewportHeight + 2)
        failures.push(
          `${route}: page is ${layout.docHeight}px tall in a ${layout.viewportHeight}px viewport`
        );
    }
    await context.close();
    assert.deepEqual(failures, [], `${vp.name} layout:`);
    console.log(
      `PASS ${vp.name} (${vp.width}x${vp.height}): ${games.length} games fit without scrolling or horizontal overflow`
    );
  }
} finally {
  await browser.close();
}
