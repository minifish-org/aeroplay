import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

const engines = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const name = process.env.TEST_BROWSER ?? 'chromium';
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const engineCode = (await transform((await readFile('src/core/engine.ts', 'utf8')).replace('this.rafId = requestAnimationFrame(this.tick);', ''), { loader: 'ts', format: 'esm' })).code;
const browser = await engines[name].launch({ headless: true });
const results = [];
await mkdir('output/player-fairness', { recursive: true });

async function run(game, ai) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript(() => {
    let seed = 1;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    localStorage.clear();
  });
  await context.route(/\/src\/core\/engine\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: engineCode }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#hub`); await page.waitForSelector('.hub-card');
  const result = await page.evaluate(async ({ game, ai }) => {
    const { Player, HumanPlayer } = await import('/src/core/player.ts');
    const module = await import(`/src/games/${game === '2048' ? 'game2048' : game}.ts`);
    const replies = [];
    const controller = ai ? { type: 'ai', choose: (o, signal) => new Promise(resolve => replies.push({ o, signal, resolve })) } : new HumanPlayer();
    const player = new Player(controller);
    const dispose = module.default.mount(document.querySelector('#app'), () => {}, player);
    player.start();
    const before = JSON.parse(window.render_game_to_text());
    const trace = [];
    for (let step = 0; step < (['match3', 'sudoku'].includes(game) ? 2 : 1); step++) {
      const observation = player.observe();
      if (!observation) throw new Error(`Missing observation: ${game}`);
      let choice = Object.keys(observation.choices)[0];
      if (game === 'snake') choice = 'down';
      if (game === 'tetris') choice = 'left';
      if (game === 'sky') choice = 'right';
      if (game === 'match3' && step === 1) choice = Object.entries(observation.choices).sort((a, b) => Number(b[1].match(/clears (\d+)/)?.[1]) - Number(a[1].match(/clears (\d+)/)?.[1]))[0][0];
      if (game === 'sudoku' && step === 1) choice = Object.entries(observation.choices).find(([, text]) => text.includes('does not repeat'))[0];
      const input = observation.inputs[choice];
      trace.push({ choice, input });
      if (ai) {
        if (!player.thinking) void player.tick();
        replies.shift().resolve(choice);
        for (let i = 0; i < 5; i++) await Promise.resolve();
      } else player.submitHumanInput(input);
    }
    window.advanceTime(250);
    const after = JSON.parse(window.render_game_to_text());
    player.dispose(); dispose();
    return { before, after, trace };
  }, { game, ai });
  assert.deepEqual(errors, []);
  await context.close();
  return result;
}

function mechanics(value) {
  const { visual, renderer, drawCalls, coordinates, elapsed, ...rest } = value;
  return rest;
}
try {
  for (const game of ['flappy', 'snake', 'tetris', '2048', 'maze', 'match3', 'lightsout', 'sudoku', 'sky', 'cargo']) {
    const human = await run(game, false), ai = await run(game, true);
    assert.deepEqual(ai.trace, human.trace, `${game}: identical control inputs`);
    assert.deepEqual(mechanics(ai.before), mechanics(human.before), `${game}: same initial mechanics`);
    assert.deepEqual(mechanics(ai.after), mechanics(human.after), `${game}: same inputs and time produce the same game`);
    if (['maze', 'cargo', 'lightsout'].includes(game)) assert.equal((game === 'maze' ? ai.after.steps : ai.after.moves) - (game === 'maze' ? ai.before.steps : ai.before.moves), 1, `${game}: one input is one move, with no route macro`);
    results.push({ game, human, ai });
    console.log(`PASS ${game}: human and AI use identical inputs, mechanics and animation clock`);
  }
  await writeFile(`output/player-fairness/inputs-${name}.json`, JSON.stringify(results, null, 2) + '\n');
} finally { await browser.close(); }
