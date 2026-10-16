import { assert, games, viewports, launch, context, harness, mechanics, inspectLayout as inspect, models, fullMatch } from './verify-lib.mjs';
import { readFile } from 'node:fs/promises';

const browser = await launch();

try {
  const failures = [];
  for (const vp of [...viewports,{name:'macbook-min',width:1440,height:900,deviceScaleFactor:2,isMobile:false,hasTouch:false}]) {
    const ctx = await context(browser, vp), h = await harness(ctx, undefined, `output/layout-${vp.name}`);
    for (const route of ['hub', ...games]) {
      await h.open(route);
      await h.page.waitForTimeout(450);
      try {
        await inspect(h, route, vp);
        if (route !== 'hub') { await h.page.getByLabel('More options', { exact: true }).click(); await inspect(h, route + '-menu', vp); await h.page.getByLabel('More options', { exact: true }).click(); }
      } catch (error) {
        failures.push(`${route} ${vp.name}: ${error.message}`);
      }
      await h.shot(route);
      assert.equal(await h.page.locator('.player-settings,dialog,.grid-2048,.match3-cell,.sudoku-cell,.light-cell').count(), 0, 'No old settings or DOM board overlays');
      if (route === 'hub') {
        assert.equal(await h.page.locator('.hub-card').count(), 8);
        assert(await h.page.locator('.card-preview').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), 'Real previews load');
      }
    }
    h.clean();
    await ctx.close();
    console.log(`Checked 9 pages × ${vp.name} ${vp.width}×${vp.height}`);
  }
  assert.deepEqual(failures, [], 'All36 exact layouts: no scroll, overflow, clipped controls or gameplay overlap');
  console.log('PASS all27 requested device layouts plus nine at MacBook1440×900');
  const rotation=await context(browser,{deterministic:true}),rr=await harness(rotation);
  await rr.open('sudoku');await rr.pick({type:'select',index:2});await rr.action('notes').click();await rr.button('2').click();
  const sudoku=await rr.state();
  for(const vp of [viewports[1],viewports[0]]) {
    await rr.page.setViewportSize({width:vp.width,height:vp.height});await rr.page.waitForTimeout(450);await inspect(rr,'sudoku',vp);
    const s=await rr.state();assert.deepEqual(s.board,sudoku.board);assert.deepEqual(s.notes,sudoku.notes);assert.equal(s.selected,sudoku.selected);assert.equal(s.noteMode,sudoku.noteMode);
  }
  await rr.open('cargo');await rr.button('Right').click();const cargo=await rr.state();
  for(const vp of [viewports[1],viewports[0]]) {
    await rr.page.setViewportSize({width:vp.width,height:vp.height});await rr.page.waitForTimeout(450);await inspect(rr,'cargo',vp);
    const s=await rr.state();assert.deepEqual(s.state,cargo.state);assert.equal(s.moves,cargo.moves);assert.equal(s.pushes,cargo.pushes);
  }
  rr.clean();await rotation.close();console.log('PASS live Sudoku/Cargo rotation keeps controls fitted and game state intact');
  const m=await models();
  for(const vp of viewports) {
    const ac=await context(browser,vp),ah=await harness(ac,undefined,`output/layout-${vp.name}`);
    const board=Array(25).fill(1);await ah.open('lightsout',{'aeroplay:lightsout:state-v2':{board,initial:board,moves:0,level:20,hintsUsed:0}});
    await ah.button('Watch TAMEV').click();await ah.page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).player.decisions>0);
    await inspect(ah,'lightsout-ai-playing',vp);await ah.action('ai-pause').click();await inspect(ah,'lightsout-ai-paused',vp);
    await ah.page.waitForTimeout(450);const paused=await ah.state();await ah.page.waitForTimeout(250);assert.equal((await ah.state()).renderer.frames,paused.renderer.frames,'Paused AI renderer becomes idle');
    await ah.action('ai-pause').click();await ah.page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='won');await inspect(ah,'lightsout-ai-result',vp);await ah.shot('lightsout-ai-result');
    for(const game of ['2048','flappy','sudoku','match3','cargo','sky']) {
      await ah.open(game);await ah.button('Watch TAMEV').click();await ah.page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).ai.info?.initializations===1);
      await inspect(ah,game+'-ai-playing',vp);
      if(await ah.action('ai-pause').isVisible()){await ah.action('ai-pause').click();await inspect(ah,game+'-ai-paused',vp);}
    }
    await ah.open('2048',{'aeroplay:game2048:state':{grid:[[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]],score:100,moves:20}});await inspect(ah,'2048-result',vp);
    await ah.open('sudoku',{'aeroplay:sudoku:state-v2':{puzzleIndex:0,board:[...m.gsudoku.PUZZLES[0].solution].map(Number),elapsedSeconds:64,mistakes:1,bestSeconds:64}});await inspect(ah,'sudoku-result',vp);
    await ah.open('match3',{'aeroplay:match3:run':{grid:m.gmatch3.createMatchBoard(),score:0,moves:0,level:1}});await inspect(ah,'match3-result',vp);
    await ah.open('cargo',{'aeroplay:cargo:run':{level:0,state:{player:18,crates:[19]},moves:2,pushes:2,usedHint:false}});await inspect(ah,'cargo-result',vp);
    await ah.open('flappy');await ah.startFlappy();await ah.advance(6000);assert.equal((await ah.state()).mode,'over');await inspect(ah,'flappy-result',vp);
    await ah.open('sky');await ah.button('Start flight').click();
    for(let i=0;i<30&&(await ah.state()).mode==='playing';i++){const s=await ah.state(),row=s.rows.filter(row=>!row.passed).sort((a,b)=>a.distance-b.distance)[0],lane=row.obstacles[0];while((await ah.state()).lane!==lane){const direction=(await ah.state()).lane<lane?'right':'left';if(await ah.action(direction).isVisible())await ah.action(direction).click();else await ah.key(direction==='right'?'ArrowRight':'ArrowLeft');}await ah.advance(2000);}
    assert.equal((await ah.state()).mode,'over');await inspect(ah,'sky-result',vp);ah.clean();await ac.close();
  }
  const pc=await context(browser),ph=await harness(pc);await ph.open('pushball');await fullMatch(ph);
  for(const vp of viewports){await ph.page.setViewportSize({width:vp.width,height:vp.height});await ph.page.waitForTimeout(450);await inspect(ph,'pushball-result',vp);}
  ph.clean();await pc.close();console.log('PASS active AI, paused AI and all8 settlement HUDs at allthree requested viewports');
  const ctx = await context(browser, { audit: true }), h = await harness(ctx);
  let baseline;
  for (let cycle = 0;cycle < 3;cycle++) {
    for (const game of games) {
      await h.open(game);
      await h.page.waitForTimeout(450);
    }
    await h.open('hub');
    await h.page.waitForTimeout(200);
    const audit = await h.page.evaluate(() => window.__gpuAudit);
    assert.equal(audit.contexts, 1, 'All eight games reuse one actual GPU context');
    assert.equal(audit.workers, 0, 'Human navigation leaves no game workers');
    if (!baseline) baseline = audit.live;
    else for (const [kind, count] of Object.entries(audit.live)) assert(count <= baseline[kind], `Navigation releases ${kind} allocations`);
  }
  for (let i = 0;i < 20;i++) await h.page.evaluate(game => {
    location.hash = game;
  }, games[i % games.length]);
  await h.open('lightsout'); await h.page.waitForTimeout(400);
  const unscaled = (await h.state()).picks;
  await h.open('pushball'); await h.open('lightsout'); await h.page.waitForTimeout(400);
  assert.deepEqual((await h.state()).picks, unscaled, 'Leaving an entry animation cannot shrink the next scene');
  await h.open('2048');
  await h.page.waitForTimeout(500);
  const drawCount = await h.page.evaluate(() => window.__gpuAudit.draws);
  await h.page.waitForTimeout(200);
  assert.equal(await h.page.evaluate(() => window.__gpuAudit.draws), drawCount, 'Idle board stops rendering');
  await h.open('flappy');
  await h.startFlappy();
  await h.advance(550);
  await h.page.getByLabel('More options', { exact: true }).click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'paused');
  const scene = (await h.state()).playBounds;
  await h.page.mouse.move(scene.x + scene.width / 2, scene.y + scene.height / 2); await h.page.mouse.down();
  await h.page.waitForTimeout(180); await h.page.mouse.up();
  assert((await h.state()).bird.velocity > 0, 'The gesture that dismisses More does not also flap');
  await h.button('Pause').click();
  await h.page.waitForTimeout(450);
  const paused = mechanics(await h.state()), draws = await h.page.evaluate(() => window.__gpuAudit.draws);
  await h.page.waitForTimeout(250);
  assert.deepEqual(mechanics(await h.state()), paused, 'Paused gameplay is frozen');
  assert.equal(await h.page.evaluate(() => window.__gpuAudit.draws), draws, 'Paused scene stops rendering');
  const lost = await h.page.locator('canvas').evaluate(canvas => {
    const extension = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.__lose = extension;
    extension.loseContext();
    return true;
  });
  assert(lost, 'WebGL context loss is available for recovery verification');
  await h.page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).renderer.available===false);
  assert(await h.page.locator('.hud-button').evaluateAll(buttons=>buttons.filter(button=>button.dataset.action!=='back'&&button.getBoundingClientRect().width).every(button=>button.disabled)),'Graphics interruption disables every visible action except Back');
  const unavailable=mechanics(await h.state());await h.key('p');await h.advance(1000);assert.deepEqual(mechanics(await h.state()),unavailable,'P shortcut cannot resume or advance invisible physics during graphics loss');
  await h.page.waitForTimeout(100);
  await h.page.evaluate(() => window.__lose.restoreContext());
  await h.page.waitForFunction(() => !document.querySelector('canvas').getContext('webgl2').isContextLost());
  await h.button('Resume').click();
  assert.equal((await h.state()).mode, 'playing');
  await h.open('hub');
  h.clean();
  await ctx.close();
  const reduced = await context(browser, { reducedMotion: 'reduce', deterministic: true }), rh = await harness(reduced);
  for (const game of games) {
    await rh.open(game);
    const s = await rh.state();
    assert(s.motion.reduced);
    assert.equal(s.motion.tweens, 0);
    assert.equal(s.motion.particles, 0);
    if (game === '2048') await rh.swipe('left');
    if (game === 'lightsout') await rh.pick(12);
    if (game === 'sudoku') {
      const cell = s.board.findIndex((v, i) => !v && !s.givens.includes(i));
      await rh.pick({ type: 'select', index: cell });
      await rh.action('hint').click();
    }
    await rh.advance(0);
    const after = await rh.state();
    assert.equal(after.motion.tweens, 0);
    assert.equal(after.motion.particles, 0);
  }
  rh.clean();
  await reduced.close();
  const css = await readFile('styles/tokens.css', 'utf8'), stage = await readFile('src/core/stage.ts', 'utf8');
  for (const side of ['top', 'right', 'bottom', 'left']) assert(css.includes(`safe-area-inset-${side}`), `${side} safe-area inset is retained`);
  assert.equal((stage.match(/new WebGLRenderer\(/g) ?? []).length, 1);
  assert(stage.includes('ACESFilmicToneMapping') && stage.includes('PCFShadowMap'), 'ACES and the supported soft PCF shadow renderer are retained');
  for (const game of games) assert(!/\bfrom\s+['"]three/.test(await readFile(`src/games/${game}/model.ts`, 'utf8')), `${game}: pure model has zero three imports`);
  console.log('PASS shared GPU lifetime, allocation teardown, idle/pause, context recovery and reduced motion');
} finally {
  await browser.close();
}
