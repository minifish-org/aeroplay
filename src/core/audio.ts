import { load, save } from './storage';
import { createTouchButton } from './ui';

export class GameAudio {
  private context: AudioContext | null = null;
  private enabled = load('sound-enabled', false);
  readonly button = createTouchButton(
    this.enabled ? 'Sound: On' : 'Sound: Off',
    () => {
      this.enabled = !this.enabled;
      save('sound-enabled', this.enabled);
      this.button.textContent = this.enabled ? 'Sound: On' : 'Sound: Off';
      this.button.setAttribute('aria-pressed', String(this.enabled));
      if (this.enabled) {
        this.unlock();
        this.play('collect');
      }
    }
  );

  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended')
      void this.context.resume().catch(() => {});
  }

  play(cue: 'collect' | 'boost' | 'hit' | 'move' | 'win') {
    if (!this.enabled || !this.context || this.context.state !== 'running')
      return;
    const notes = {
      collect: [660, 880],
      boost: [220, 440, 880],
      hit: [140, 70],
      move: [260],
      win: [523, 659, 784, 1047]
    }[cue];
    const audio = this.context;
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      const at = audio.currentTime + index * 0.065;
      oscillator.type = cue === 'hit' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.07, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.2);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }

  dispose() {
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
