import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the Playwright module path.');
const { webkit } = await import(pathToFileURL(modulePath).href);
const origin = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5173';
const games = ['2048', 'lightsout', 'flappy', 'sudoku', 'match3', 'cargo', 'sky', 'pushball'];
await mkdir('public/assets/previews', { recursive: true });
const browser = await webkit.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 900, height: 760 }, deviceScaleFactor: 1,
    serviceWorkers: 'block', reducedMotion: 'reduce'
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== new URL(origin).origin) errors.push('External request: ' + request.url());
  });
  for (const game of games) {
    await page.goto(origin + '/#' + game);
    await page.waitForFunction(game => window.render_game_to_text && JSON.parse(window.render_game_to_text()).game === game, game);
    for (let i = 0; i < 5; i++) {
      const help = page.getByRole('button', { name: 'Got it', exact: true });
      if (!await help.isVisible()) break;
      await help.click();
    }
    if (game === '2048') {
      await page.locator('canvas').focus();
      for (let move = 0; move < 48; move++) await page.keyboard.press(['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'][move % 4]);
    }
    if (game === 'flappy') {
      await page.locator('canvas').focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(520);
      await page.keyboard.press('p');
    }
    await page.waitForTimeout(400);
    const clip = await page.evaluate(() => {
      return JSON.parse(window.render_game_to_text()).playBounds;
    });
    if (errors.length) throw new Error(errors.join('\n'));
    const pixels = await page.evaluate(clip => {
      const source = document.querySelector('canvas'), bounds = source.getBoundingClientRect();
      const image = document.createElement('canvas'); image.width = Math.round(clip.width); image.height = Math.round(clip.height);
      image.getContext('2d').drawImage(source,
        (clip.x - bounds.x) * source.width / bounds.width, (clip.y - bounds.y) * source.height / bounds.height,
        clip.width * source.width / bounds.width, clip.height * source.height / bounds.height,
        0, 0, image.width, image.height);
      return image.toDataURL('image/jpeg', .88).split(',')[1];
    }, clip);
    await writeFile('public/assets/previews/' + game + '.jpg', Buffer.from(pixels, 'base64'));
    console.log('Captured actual Three scene: ' + game);
  }
  await context.close();
} finally {
  await browser.close();
}
