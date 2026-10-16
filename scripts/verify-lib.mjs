import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export { assert };
export const games = ['2048', 'lightsout', 'flappy', 'sudoku', 'match3', 'cargo', 'sky', 'pushball'];
export const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
export const browserName = process.env.TEST_BROWSER ?? 'webkit';
export const viewports = [
  { name: 'iphone-portrait', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'iphone-landscape', width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'macbook', width: 1512, height: 982, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
];
export async function engine() {
  return (await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'))[browserName];
}
export async function launch() {
  return (await engine()).launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
}
export async function bundle(contents, options = {}) {
  const output = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, bundle: true,
    write: false, platform: 'node', format: 'esm', logLevel: 'silent', ...options
  });
  return output.outputFiles[0].text;
}
export async function models() {
  const contents = games.map(game => `export * as g${game.replace(/\W/g, '')} from './src/games/${game}/model.ts';`).join('\n');
  return import(`data:text/javascript;base64,${Buffer.from(await bundle(contents)).toString('base64')}`);
}
export async function context(browser, options = {}) {
  const { deterministic = false, audit = false, name, width = 390, height = 844, ...settings } = options;
  const { name: viewportName, width: defaultWidth, height: defaultHeight, ...device } = viewports[0];
  const ctx = await browser.newContext({ ...device, viewport: { width, height }, serviceWorkers: 'block', ...settings });
  if (deterministic) await ctx.addInitScript(() => {
    let seed = 314, frame = 0;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    window.requestAnimationFrame = () => ++frame;
    window.cancelAnimationFrame = () => { };
  });
  if (audit) await ctx.addInitScript(() => {
    const audit = window.__gpuAudit = { contexts: 0, draws: 0, live: { buffer: 0, texture: 0, program: 0 }, workers: 0, workerLog: [] };
    const get = HTMLCanvasElement.prototype.getContext, seen = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
      const gl = get.call(this, kind, ...args);
      if (gl && kind.startsWith('webgl') && !seen.has(gl)) {
        seen.add(gl);
        audit.contexts++;
        for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
          const draw = gl[name]?.bind(gl);
          if (draw) gl[name] = (...args) => {
            audit.draws++;
            return draw(...args);
          };
        }
        for (const resource of ['buffer', 'texture', 'program']) {
          const suffix = resource[0].toUpperCase() + resource.slice(1), live = new Set();
          const create = gl['create' + suffix].bind(gl), remove = gl['delete' + suffix].bind(gl);
          gl['create' + suffix] = (...args) => {
            const object = create(...args);
            if (object) {
              live.add(object);
              audit.live[resource]++;
            }
            return object;
          };
          gl['delete' + suffix] = object => {
            if (live.delete(object)) audit.live[resource]--;
            return remove(object);
          };
        }
      }
      return gl;
    };
    const WorkerClass = window.Worker;
    window.Worker = class extends WorkerClass {
      constructor(...args) {
        super(...args);
        audit.workers++;
        this.__alive = true;
        this.__auditIndex = audit.workerLog.length;
        audit.workerLog.push({url:String(args[0]),alive:true});
      }
      terminate() {
        if (this.__alive) {
          this.__alive = false;
          audit.workers--;
          audit.workerLog[this.__auditIndex].alive=false;
        }
        return super.terminate();
      }
    };
  });
  return ctx;
}
export async function harness(ctx, url = base, folder = `output/verification-${browserName}`) {
  const page = await ctx.newPage(), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin) external.push(request);
  });
  page.setDefaultTimeout(20000);
  const waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = (fn, arg, options) => waitForFunction(fn, arg, { polling: 20, ...options });
  await mkdir(folder, { recursive: true });
  const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const advance = ms => page.evaluate(ms => window.advanceTime(ms), ms);
  const accessibleControl = locator => new Proxy(locator, { get(target, key) {
    if (key === 'isVisible') return async () => await target.filter({ visible: true }).count() > 0;
    if (key === 'click') return async options => {
      const control = await target.count() > 1 ? target.filter({ visible: true }) : target;
      if (await control.evaluate(element => !!element.closest('details:not([open])')).catch(() => false))
        await page.locator('summary[aria-label="More options"]').click();
      return control.click(options);
    };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  }});
  const button = name => accessibleControl(page.getByRole('button', { name, exact: true, includeHidden: true }));
  const action = id => accessibleControl(page.locator(`[data-action="${id}"]`));
  const tapScene = async () => { const box = await page.locator('.play-area').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2; if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
  const startFlappy = async () => { if (await button('Resume').isVisible()) await button('Resume').click(); else await tapScene(); };
  async function dismiss() {
    if (await button('Got it').isVisible().catch(() => false)) await button('Got it').click();
  }
  async function open(game, saves) {
    if (!page.url().startsWith(url)) {
      const hub = new URL(url);
      hub.hash = 'hub';
      await page.goto(hub.href);
    }
    else await page.evaluate(() => {
      location.hash = 'hub';
    });
    await page.waitForSelector('.hub-card');
    if (saves) await page.evaluate(saves => {
      for (const [key, value] of Object.entries(saves)) localStorage.setItem(key, JSON.stringify(value));
    }, saves);
    if (game === 'hub') return;
    await page.locator(`.hub-card[data-game="${game}"]`).click();
    await page.waitForFunction(game => window.render_game_to_text && JSON.parse(window.render_game_to_text()).game === game, game, { polling: 20 });
    await page.waitForSelector('canvas[data-renderer="three"][data-ready="true"]');
    await dismiss();
    assert.equal(await page.locator('canvas').count(), 1, `${game}: one shared canvas`);
  }
  async function pick(input) {
    const s = await state(), value = JSON.stringify(input);
    const point = s.picks.find(point => JSON.stringify(point.input) === value);
    assert(point, `${s.game}: an actual projected mesh exists for input ${value}`);
    await page.touchscreen.tap(point.x, point.y);
  }
  async function swipe(direction) {
    const s = await state(), box = s.boardBounds ?? s.playBounds;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const end = { ...start }, distance = Math.min(box.width, box.height) * .28;
    end.x += direction === 'right' ? distance : direction === 'left' ? -distance : 0;
    end.y += direction === 'down' ? distance : direction === 'up' ? -distance : 0;
    if (browserName === 'chromium') {
      const session = await ctx.newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 5 });
      await page.mouse.up();
    }
  }
  async function key(key) {
    await page.locator('canvas').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press(key);
  }
  async function shot(name) {
    const s = await page.evaluate(() => window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null);
    await page.screenshot({ path: `${folder}/${name}.png` });
    await writeFile(`${folder}/${name}.json`, JSON.stringify(s, null, 2));
  }
  const pixels = async () => createHash('sha256').update(await page.locator('canvas').screenshot()).digest('hex');
  const clean = () => {
    assert.deepEqual(errors, [], 'No browser errors');
    assert.deepEqual(external.filter(request => request.failure()?.errorText !== 'csp').map(request => request.url()), [], 'Zero external network requests');
  };
  return { page, state, advance, button, action, tapScene, startFlappy, dismiss, open, pick, swipe, key, shot, pixels, clean, errors, external };
}
export function mechanics(s) {
  const { renderer, motion, picks, coordinates, boardBounds, playBounds, ai, player, visual, ...rest } = s;
  return rest;
}
export async function until(read, step, predicate, limit = 1000, label = 'Expected game outcome') {
  for (let i = 0;i < limit;i++) {
    const s = await read();
    if (predicate(s)) return s;
    await step(s, i);
  }
  const s = await read();
  assert(predicate(s), `${label}: ${JSON.stringify(s)}`);
  return s;
}
export async function fullMatch(h) {
  await h.button('Start match').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing', null, { timeout: 120000 });
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ai.info?.initializations === 1, null, { timeout: 120000 });
  await h.page.locator('canvas').click({ position: { x: 4, y: 4 } });
  const deadline = Date.now() + 90000;
  let completed;
  while (Date.now() < deadline) {
    const s = await h.state();
    if (s.mode === 'over') {
      completed = s;
      break;
    }
    if (s.kickoff === 0 && s.robots[0].x < 3.5) {
      await h.page.keyboard.down('ArrowRight');
      await h.page.waitForTimeout(850);
      await h.page.keyboard.up('ArrowRight');
    } else await h.page.waitForTimeout(200);
  }
  if(!completed){await h.shot('pushball-timeout');const s=await h.state();console.log('Pushball timeout diagnostics',JSON.stringify({mode:s.mode,score:s.score,elapsed:s.elapsed,robots:s.robots,ball:s.ball,ai:s.ai}));}
  assert(completed, 'Real TAMEV completes an actual match against a sideline human within 90 seconds');
  assert.equal(completed.winner, 1);
  assert.equal(completed.score[1], 3);
  assert.equal(completed.ai.error, '');
  return completed;
}
export async function touchStickDash(ctx,h) {
  const stick=await h.page.getByRole('group',{name:'Movement joystick'}).boundingBox(),dash=await h.action('dash').boundingBox();assert(stick&&dash);
  const point={x:stick.x+stick.width/2,y:stick.y+stick.height/2,id:0},moved={...point,x:point.x-27,y:point.y-18},button={x:dash.x+dash.width/2,y:dash.y+dash.height/2,id:1};
  const session=await ctx.newCDPSession(h.page),touch=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  const before=await h.state();await touch('touchStart',[point]);await touch('touchMove',[moved]);await h.page.waitForTimeout(300);
  assert((await h.state()).robots[0].x<before.robots[0].x-.3,'Native touch joystick supplies movement');
  await touch('touchStart',[moved,button]);await touch('touchEnd',[moved]);await h.page.waitForTimeout(100);
  assert((await h.state()).robots[0].cooldown>2,'Two native touches hold joystick and dash simultaneously');
  await touch('touchEnd',[]);await h.page.waitForTimeout(100);assert(Math.hypot((await h.state()).controls[0].x,(await h.state()).controls[0].y)<.01);await session.detach();
}

export async function inspectLayout(h, route, vp) {
  const layout = await h.page.evaluate(() => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const visible = element => {
      const r = element.getBoundingClientRect(), style = getComputedStyle(element);
      return r.width && r.height && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('details:not([open]) .hud-menu');
    };
    const stage = document.querySelector('.game-stage'), s = window.render_game_to_text ? JSON.parse(window.render_game_to_text()) : null;
    const controls = [...document.querySelectorAll('button,summary,select,.joystick')].filter(visible).map(element => {
      const r = rect(element), clipped = [];
      for (let parent = element.parentElement;parent;parent = parent.parentElement) {
        const style = getComputedStyle(parent), p = rect(parent);
        if (/hidden|clip|auto|scroll/.test(style.overflowX) && (r.x < p.x - 1 || r.right > p.right + 1)) clipped.push(parent.className);
        if (/hidden|clip|auto|scroll/.test(style.overflowY) && (r.y < p.y - 1 || r.bottom > p.bottom + 1)) clipped.push(parent.className);
      }
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        label: element.getAttribute('aria-label') ?? element.textContent, ...r, clipped, hit: top === element || element.contains(top),
        panel: !!element.closest('.hud-panel,.hud-menu'), textClipped: element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2
      };
    });
    return {
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      stage: stage ? rect(stage) : null, play: s?.playBounds, mode: s?.mode, controls,
      overflow: [...document.querySelectorAll('body *')].filter(element => visible(element) && !element.closest('svg')).filter(element => {
        const r = rect(element);
        return r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
      }).map(element => element.className || element.tagName).slice(0, 8)
    };
  });
  const label = `${route} ${vp.name}`;
  assert.equal(layout.width, vp.width, `${label}: exact viewport width`);
  assert.equal(layout.height, vp.height, `${label}: exact viewport height`);
  assert(layout.scrollWidth <= layout.width + 2, `${label}: no horizontal overflow`);
  assert(layout.scrollHeight <= layout.height + 2, `${label}: no scrolling`);
  assert.deepEqual(layout.overflow, [], `${label}: all visible elements fit`);
  for (const c of layout.controls) {
    assert(c.width >= 43 && c.height >= 43, `${label}: ${c.label} has a reliable touch target`);
    assert.deepEqual(c.clipped, [], `${label}: ${c.label} is not clipped`);
    assert(!c.textClipped, `${label}: ${c.label} label fits`);
    assert(c.hit, `${label}: ${c.label} accepts input without another element covering it`);
    if (layout.stage) {
      const stage = layout.stage;
      assert(c.x >= stage.x + 11 && c.y >= stage.y + 11 && c.right <= stage.right - 11 && c.bottom <= stage.bottom - 11,
        `${label}: ${c.label} remains at least 12px inside the scene`);
      if (!c.panel && layout.mode === 'playing') {
        const p = layout.play;
        assert(c.right <= p.x + 1 || c.x >= p.x + p.width - 1 || c.bottom <= p.y + 1 || c.y >= p.y + p.height - 1,
          `${label}: ${c.label} does not cover the playable viewport`);
      }
    }
  }
  if (route !== 'hub') {
    const s = await h.state();
    assert(s.playBounds.width >= 120 && s.playBounds.height >= 120, `${label}: usable playable viewport`);
    assert.equal(s.renderer.contexts, 1);
    assert(s.renderer.pixelRatio <= 2);
    assert(s.motion.particles <= s.motion.maxParticles && s.motion.maxParticles === 48);
    for (const p of s.picks) assert(p.x >= s.playBounds.x - 1 && p.y >= s.playBounds.y - 1 && p.x <= s.playBounds.x + s.playBounds.width + 1 && p.y <= s.playBounds.y + s.playBounds.height + 1,
      `${label}: playable mesh is fully framed`);
  }
  return layout;
}
