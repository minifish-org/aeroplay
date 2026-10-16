import { load, save } from './storage';
export class GameAudio {
  private context: AudioContext | null = null;
  private live = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();
  enabled = load('sound-enabled', false);
  toggle() { this.enabled = !this.enabled; save('sound-enabled', this.enabled); if (this.enabled) {
    this.unlock();
    this.play('collect');
  } }
  /** A context closed mid-teardown rejects this promise; a silent game must not report it. */
  unlock() {
    if (!this.enabled)
      return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended')
      void this.context.resume().catch(() => { });
  }
  play(cue: 'collect' | 'boost' | 'hit' | 'move' | 'win') {
    if (!this.enabled || this.context?.state !== 'running')
      return;
    const notes = { collect: [660, 880], boost: [220, 440, 880], hit: [140, 70], move: [260], win: [523, 659, 784, 1047] }[cue];
    const audio = this.context;
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const at = audio.currentTime + index * .065;
      oscillator.type = cue === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.07, at + .012);
      gain.gain.exponentialRampToValueAtTime(.001, at + .18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + .2);
      const voice = { oscillator, gain };
      this.live.add(voice);
      // A voice that ends after its context closed must not throw from this handler.
      oscillator.onended = () => {
        this.live.delete(voice);
        try {
          oscillator.disconnect();
          gain.disconnect();
        }
        catch {
          return;
        }
      };
    });
  }
  /** Silent teardown: every voice stops and leaves the graph before its context closes. */
  dispose() {
    for (const { oscillator, gain } of this.live)
      try {
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
      }
      catch {
        continue;
      }
    this.live.clear();
    const context = this.context;
    this.context = null;
    void context?.close();
  }
}
