import { load, save } from './storage';
import type { HUD } from './hud';

type Cue = 'select' | 'move' | 'collect' | 'boost' | 'hit' | 'win' | 'lose' | 'shuffle';
type Voice = { oscillator: OscillatorNode; gain: GainNode };
type Score = { root: number; bpm: number; space: number; melody: number[]; pulse: boolean };
// Geometric phrases, open fifths and warm overtones share the visual palette's restraint.
// Negative entries are rests; each score takes eight bars before returning home.
const SCORES = {
  '2048': { root: 48, bpm: 88, space: 2, melody: [0, -1, 7, -1, 4, -1, 9, 7, -1, 2, -1, 7, 4, -1, 2, -1], pulse: true },
  lightsout: { root: 50, bpm: 68, space: 3, melody: [12, -1, -1, 7, -1, 2, -1, -1, 9, -1, -1, 4, -1, 7, -1, -1], pulse: false },
  flappy: { root: 53, bpm: 104, space: 2, melody: [0, -1, 4, 7, -1, 9, -1, 7, 2, -1, 4, -1, 7, -1, 2, -1], pulse: true },
  sudoku: { root: 48, bpm: 60, space: 4, melody: [7, -1, -1, -1, 14, -1, -1, 9, -1, -1, 4, -1, -1, 2, -1, -1], pulse: false },
  match3: { root: 55, bpm: 96, space: 2, melody: [0, 4, -1, 7, -1, 9, 7, -1, 2, -1, 9, -1, 7, 4, -1, 2], pulse: true },
  cargo: { root: 50, bpm: 80, space: 3, melody: [0, -1, 7, -1, -1, 4, -1, 2, 9, -1, -1, 7, -1, 4, 2, -1], pulse: true },
  sky: { root: 45, bpm: 112, space: 2, melody: [0, -1, 7, 12, -1, 9, -1, 7, 2, -1, 9, 14, -1, 12, 7, -1], pulse: true },
  pushball: { root: 46, bpm: 108, space: 2, melody: [0, -1, 0, 7, -1, 4, -1, 7, 2, -1, 2, 9, -1, 7, 4, -1], pulse: true }
} satisfies Record<string, Score>;
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class GameAudio {
  private context: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private live = new Set<Voice>();
  private cleanup = () => { };
  private playing = () => false;
  private timer = 0;
  private next = 0;
  private step = 0;
  private sounding = false;
  private disposed = false;
  private blocked = false;
  private lastCue = new Map<Cue, number>();
  private score: Score;
  enabled = load('sound-enabled', false);

  constructor(game: keyof typeof SCORES) { this.score = SCORES[game]; }

  /** One control and gesture unlock path for touch, keyboard and assistive clicks. */
  bind(hud: HUD, playing: () => boolean) {
    this.playing = playing;
    const button = hud.button('sound', 'Sound', 'sound', () => { this.toggle(); label(); });
    const label = () => {
      hud.label(button, this.enabled ? 'Sound on' : 'Sound off', this.enabled ? 'Mute music and sound effects' : 'Enable music and sound effects');
      button.setAttribute('aria-pressed', String(this.enabled));
    };
    const gesture = (event: Event) => {
      if (!event.isTrusted) return;
      this.blocked = false;
      this.unlock();
      queueMicrotask(() => this.sync());
    };
    const hidden = () => { this.blocked = document.hidden; this.sync(); };
    const blur = () => { this.blocked = true; this.sync(); };
    const focus = () => { this.blocked = false; this.sync(); };
    hud.element.addEventListener('pointerdown', gesture, true);
    hud.element.addEventListener('pointerup', gesture, true);
    hud.element.addEventListener('click', gesture, true);
    window.addEventListener('keydown', gesture, true);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('pagehide', blur);
    this.cleanup = () => {
      hud.element.removeEventListener('pointerdown', gesture, true);
      hud.element.removeEventListener('pointerup', gesture, true);
      hud.element.removeEventListener('click', gesture, true);
      window.removeEventListener('keydown', gesture, true);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pagehide', blur);
    };
    label();
  }

  toggle() {
    this.enabled = !this.enabled;
    save('sound-enabled', this.enabled);
    if (this.enabled) this.unlock();
    else this.silence();
    this.sync();
  }

  private unlock() {
    if (!this.enabled || this.disposed || document.hidden) return;
    try {
      if (!this.context) {
        const audio = this.context = new AudioContext();
        const master = audio.createGain(), filter = audio.createBiquadFilter(), compressor = audio.createDynamicsCompressor();
        this.music = audio.createGain();
        this.effects = audio.createGain();
        master.gain.value = .7;
        this.music.gain.value = .5;
        this.effects.gain.value = .7;
        filter.type = 'lowpass';
        filter.frequency.value = 2800;
        compressor.threshold.value = -18;
        compressor.ratio.value = 4;
        this.music.connect(filter);
        filter.connect(master);
        this.effects.connect(master);
        master.connect(compressor);
        compressor.connect(audio.destination);
      }
      const audio = this.context;
      if (audio.state !== 'running') void audio.resume().then(() => this.sync()).catch(() => { });
      else this.sync();
    } catch {
      // Gameplay remains usable if the browser cannot allocate an audio device.
    }
  }

  /** Called by the game draw path, including pauses and help/result transitions. */
  sync() {
    if (this.disposed) return;
    const active = this.enabled && !document.hidden && !this.blocked && this.playing();
    if (!active) {
      if (this.sounding || this.blocked || document.hidden) this.silence();
      return;
    }
    const audio = this.context;
    if (!audio || audio.state !== 'running' || this.sounding) return;
    this.sounding = true;
    this.next = audio.currentTime + .035;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  private schedule() {
    if (!this.enabled || this.disposed || document.hidden || this.blocked || !this.playing()) { this.silence(); return; }
    const audio = this.context;
    if (!audio || audio.state !== 'running') { this.silence(); return; }
    // Audio-clock lookahead keeps music steady without replaying missed beats after a stall.
    if (this.next < audio.currentTime) this.next = audio.currentTime + .025;
    const { root, bpm, space, melody, pulse } = this.score, beat = 60 / bpm;
    while (this.next < audio.currentTime + .14) {
      const step = this.step % 64, at = this.next, bass = root + [0, -5, -3, -5][Math.floor(step / 16)];
      if (step % 8 === 0) this.tone(bass - 12, at, beat * 1.4, .1, 'sine', true);
      if (step % 16 === 0) {
        this.tone(bass + 7, at, beat * 5, .025, 'sine', true);
        this.tone(bass + 14, at, beat * 5, .018, 'sine', true);
      }
      if (step % space === 0) {
        const note = melody[Math.floor(step / space) % melody.length];
        if (note >= 0) {
          this.tone(root + 12 + note, at, beat * .85, .075, 'sine', true);
          this.tone(root + 24 + note, at, beat * .3, .009, 'sine', true);
        }
      }
      if (pulse && step % 4 === 2) this.tone(root - 12, at, .07, .045, 'triangle', true, root - 20);
      this.step++;
      this.next += beat / 2;
    }
  }

  play(cue: Cue) {
    const audio = this.context;
    if (!this.enabled || this.disposed || document.hidden || this.blocked || audio?.state !== 'running') return;
    const at = audio.currentTime, last = this.lastCue.get(cue) ?? -Infinity;
    if (at - last < (cue === 'hit' ? .12 : .055)) return;
    this.lastCue.set(cue, at);
    const root = this.score.root + 12;
    // Effects stay in the score's register; suspended intervals replace arcade fanfares.
    const notes: Record<Cue, number[]> = {
      select: [7], move: [0], collect: [7, 14], boost: [0, 7, 12],
      hit: [-12], win: [0, 7, 14, 19], lose: [0, -3, -7], shuffle: [12, 7, 2, 0]
    };
    notes[cue].forEach((note, index) => this.tone(root + note, at + index * .07,
      cue === 'win' ? .48 : cue === 'select' ? .055 : cue === 'move' ? .09 : .22,
      cue === 'select' ? .045 : cue === 'move' ? .09 : .15,
      cue === 'hit' || cue === 'move' ? 'triangle' : 'sine', false,
      cue === 'hit' ? root - 20 : cue === 'boost' ? root + note + 7 : undefined));
    // A short dip leaves room for feedback without pumping on every ordinary move.
    if (this.music && !['select', 'move'].includes(cue)) {
      this.music.gain.cancelScheduledValues(at);
      this.music.gain.setTargetAtTime(.3, at, .015);
      this.music.gain.setTargetAtTime(.5, at + .26, .16);
    }
  }

  private tone(midi: number, at: number, duration: number, volume: number, type: OscillatorType, music: boolean, end?: number) {
    const audio = this.context, bus = music ? this.music : this.effects;
    if (!audio || !bus || this.live.size >= 48) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency(midi), at);
    if (end !== undefined) oscillator.frequency.exponentialRampToValueAtTime(frequency(end), at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + (music && duration > 1 ? .15 : .008));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(bus);
    const voice = { oscillator, gain };
    this.live.add(voice);
    oscillator.onended = () => { this.live.delete(voice); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at);
    oscillator.stop(at + duration + .01);
  }

  private silence() {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.sounding = false;
    const at = this.context?.currentTime ?? 0;
    for (const voice of this.live) {
      // Cancel audible tails and voices already queued ahead of the audio clock.
      voice.gain.gain.cancelScheduledValues(at);
      voice.gain.gain.setTargetAtTime(.0001, at, .006);
      voice.oscillator.stop(at + .025);
    }
    this.live.clear();
    this.lastCue.clear();
  }

  dispose() {
    this.disposed = true;
    this.cleanup();
    this.silence();
    const audio = this.context;
    this.context = null;
    this.music = this.effects = null;
    void audio?.close().catch(() => { });
  }
}
