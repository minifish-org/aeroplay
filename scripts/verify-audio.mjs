import { assert, games, launch, context, harness, bundle, browserName } from './verify-lib.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = `output/audio-review/${browserName}`;
await mkdir(folder, { recursive: true });
const browser = await launch();
try {
  const ctx = await context(browser);
  await ctx.addInitScript(() => {
    const Native = window.AudioContext;
    window.__audioAudit = [];
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        this.audit = { context: this, voices: [], gains: [], analyser: this.createAnalyser() };
        this.audit.analyser.fftSize = 2048;
        window.__audioAudit.push(this.audit);
      }
      createGain() {
        const node = super.createGain(), connect = node.connect.bind(node);
        this.audit.gains.push(node);
        node.connect = (...args) => { node.__bus = args[0]; return connect(...args); };
        return node;
      }
      createDynamicsCompressor() {
        const node = super.createDynamicsCompressor(), connect = node.connect.bind(node);
        node.connect = (...args) => {
          if (args[0] === this.destination) { connect(this.audit.analyser); this.audit.analyser.connect(this.destination); return args[0]; }
          return connect(...args);
        };
        return node;
      }
      createOscillator() {
        const node = super.createOscillator(), connect = node.connect.bind(node), start = node.start.bind(node);
        const voice = { ended: false, music: false };
        this.audit.voices.push(voice);
        node.connect = (...args) => { voice.gain = args[0]; return connect(...args); };
        node.start = (...args) => { voice.music = voice.gain.__bus === this.audit.gains[1]; return start(...args); };
        node.addEventListener('ended', () => { voice.ended = true; });
        return node;
      }
    };
  });
  const h = await harness(ctx, undefined, folder), { page } = h;
  await h.open('2048');
  await h.key('ArrowLeft');
  assert.equal(await page.evaluate(() => window.__audioAudit.length), 0, 'Default mute never allocates an audio context');
  await h.action('sound').click();
  await page.waitForFunction(() => window.__audioAudit.at(-1)?.context.state === 'running');
  const energy = () => page.waitForFunction(() => {
    const audit = window.__audioAudit.at(-1), samples = new Float32Array(2048);
    audit.analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) > .0003;
  });
  const silent = () => page.waitForFunction(() => window.__audioAudit.every(audit => audit.context.state === 'closed' || audit.voices.every(voice => voice.ended)));
  await energy();
  // Muting a playing score must stop both currently sounding and future scheduled voices.
  await h.action('sound').click();
  await silent();
  const count = await page.evaluate(() => window.__audioAudit.at(-1).voices.length);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__audioAudit.at(-1).voices.length), count, 'Mute cancels the scheduler');
  await h.action('sound').click();
  await energy();
  await h.action('ai-pause').click();
  await silent();
  await h.action('ai-pause').click();
  await energy();
  console.log('PASS default mute, real output, queued-voice cancellation and pause/resume');

  for (const game of games) {
    await h.open(game);
    assert.equal(await h.action('sound').getAttribute('aria-pressed'), 'true', `${game}: shared preference`);
    await h.key('Shift'); // Also proves keyboard-only activation after an asynchronous route load.
    if (game === 'flappy') await h.startFlappy();
    if (game === 'sky' && (await h.state()).mode === 'ready') await h.button('Start flight').click();
    if (game === 'pushball') {
      await h.button('Start match').click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'playing', null, { timeout: 90000 });
    }
    await energy();
    assert(await page.evaluate(() => window.__audioAudit.at(-1).voices.some(voice => voice.music)), `${game}: actual music oscillators`);
    if (game === '2048') await h.key('ArrowRight');
    if (game === 'lightsout') await h.pick(0);
    if (game === 'sudoku') { const s = await h.state(); await h.pick({ type: 'select', index: s.board.findIndex(value => !value) }); await page.keyboard.press('1'); }
    if (game === 'cargo') { const s = await h.state(); const moves = ['up', 'right', 'down', 'left']; for (const move of moves) { await h.action(move).click(); if ((await h.state()).moves !== s.moves) break; } }
    if (game === 'match3') {
      await h.pick({ x: 0, y: 0 }); await h.pick({ x: 1, y: 0 }); await h.advance(900);
    }
    if (game === 'sky') await h.key('ArrowUp');
    if (game === 'pushball') { await h.advance(1500); await h.key('Space'); await h.advance(50); }
    assert(await page.evaluate(() => window.__audioAudit.at(-1).voices.some(voice => !voice.music)), `${game}: native gameplay effect`);
    await h.shot(`${game}-audio`);
    await h.open('hub');
    await page.waitForFunction(() => window.__audioAudit.every(audit => audit.context.state === 'closed'));
    console.log(`PASS ${game}: music, gameplay feedback, persistence and route cleanup`);
  }
  await h.open('lightsout');
  await h.button('Watch TAMEV').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'won', null, { timeout: 60000 });
  await page.waitForFunction(() => window.__audioAudit.at(-1).voices.filter(voice => voice.music).every(voice => voice.ended));
  await h.action('ai-next').click();
  await energy();
  await h.action('ai-pause').click();
  await silent();
  console.log('PASS audible watched solve, terminal music stop, next puzzle and AI pause');
  await h.open('2048'); await h.key('ArrowLeft'); await energy();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await silent();
  const hiddenCount = await page.evaluate(() => window.__audioAudit.at(-1).voices.length);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__audioAudit.at(-1).voices.length), hiddenCount, 'Hidden tab never schedules notes');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await h.action('ai-pause').click();
  await energy();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await silent();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await energy();
  await h.open('hub');
  h.clean();
  console.log('PASS visibility and focus stop/resume without changing the saved sound preference');

  // Render the production graph against a real offline audio device and a controlled audio clock.
  const source = (await bundle("export { GameAudio } from './src/core/audio.ts';", { platform: 'browser' })).replace('export {\n  GameAudio\n};', 'window.RenderAudio = GameAudio;');
  await ctx.route('**/__audio-test.js', route => route.fulfill({ contentType: 'text/javascript', body: source }));
  await page.addScriptTag({ url: new URL('/__audio-test.js', page.url()).href });
  const rendered = await page.evaluate(async games => {
    const Native = window.AudioContext, interval = window.setInterval, clear = window.clearInterval;
    const output = [];
    try {
      for (const game of games) {
        const rate = 22050, duration = 47, offline = new OfflineAudioContext(1, rate * duration, rate);
        let playing = true, serial = 0;
        const callbacks = new Map();
        window.setInterval = callback => { callbacks.set(++serial, callback); return serial; };
        window.clearInterval = id => callbacks.delete(id);
        window.AudioContext = class {
          constructor() { return new Proxy(offline, { get(target, key) {
            if (key === 'state') return 'running';
            if (key === 'close' || key === 'resume') return () => Promise.resolve();
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          } }); }
        };
        localStorage.setItem('aeroplay:sound-enabled', 'false');
        const audio = new window.RenderAudio(game), root = document.createElement('div');
        audio.bind({ element: root, button: () => document.createElement('button'), label: () => {} }, () => playing);
        audio.toggle();
        let suspension = offline.suspend(.1), cueIndex = 0;
        const cues = ['select', 'move', 'collect', 'boost', 'hit', 'win', 'lose', 'shuffle'];
        const rendering = offline.startRendering();
        for (let tick = 1; tick < 470; tick++) {
          await suspension;
          if (tick < 400) for (const callback of callbacks.values()) callback();
          else {
            if (playing) { playing = false; audio.sync(); }
            if (cueIndex < cues.length && tick / 10 >= 40.1 + cueIndex * .65) audio.play(cues[cueIndex++]);
            if (tick === 456) audio.toggle();
          }
          if (tick < 469) suspension = offline.suspend((tick + 1) / 10);
          await offline.resume();
        }
        const buffer = await rendering, samples = buffer.getChannelData(0);
        let peak = 0, power = 0, tail = 0, latePower = 0;
        for (let i = 0; i < samples.length; i++) {
          peak = Math.max(peak, Math.abs(samples[i])); power += samples[i] ** 2;
          if (i >= rate * 32 && i < rate * 40) latePower += samples[i] ** 2;
          if (i > rate * 46) tail = Math.max(tail, Math.abs(samples[i]));
        }
        const excerpt = Array.from(samples.slice(0, rate * 8));
        output.push({ game, peak, rms: Math.sqrt(power / samples.length), lateRms: Math.sqrt(latePower / (rate * 8)), tail, excerpt });
        audio.dispose();
      }
    } finally { window.AudioContext = Native; window.setInterval = interval; window.clearInterval = clear; }
    return output;
  }, games);
  const fingerprints = new Set(), montage = [];
  for (const { game, peak, rms, lateRms, tail, excerpt } of rendered) {
    assert(peak > .01 && peak < .9 && rms > .002, `${game}: audible, finite, unclipped output (${peak}, ${rms})`);
    assert(lateRms > .0005, `${game}: music continues across the loop boundary`);
    assert(tail < .00001, `${game}: no output after mute`);
    const pcm = Buffer.alloc(excerpt.length * 2);
    excerpt.forEach((value, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), i * 2));
    fingerprints.add(createHash('sha256').update(pcm).digest('hex'));
    montage.push(pcm);
    console.log(`PASS ${game}: 40-second score + eight cues, peak ${peak.toFixed(3)}, RMS ${rms.toFixed(4)}, silent tail`);
  }
  assert.equal(fingerprints.size, 8, 'Eight distinct arrangements');
  const pcm = Buffer.concat(montage), wav = Buffer.alloc(44);
  wav.write('RIFF'); wav.writeUInt32LE(pcm.length + 36, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  await writeFile(`${folder}/eight-game-music.wav`, Buffer.concat([wav, pcm]));
  await writeFile(`${folder}/levels.json`, JSON.stringify(rendered.map(({ excerpt, ...stats }) => stats), null, 2));
  h.clean();
  await ctx.close();
} finally { await browser.close(); }
