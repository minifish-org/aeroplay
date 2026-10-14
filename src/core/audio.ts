import { load, save } from './storage';
export class GameAudio {
  private context: AudioContext | null = null;
  enabled = load('sound-enabled', false);
  toggle() { this.enabled = !this.enabled; save('sound-enabled', this.enabled); if(this.enabled) { this.unlock(); this.play('collect'); } }
  unlock() { if(!this.enabled) return; this.context ??= new AudioContext(); if(this.context.state === 'suspended') void this.context.resume(); }
  play(cue: 'collect' | 'boost' | 'hit' | 'move' | 'win') {
    if(!this.enabled || this.context?.state !== 'running') return;
    const notes = { collect: [660,880], boost: [220,440,880], hit: [140,70], move: [260], win: [523,659,784,1047] }[cue];
    const audio = this.context;
    notes.forEach((frequency,index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(); const at = audio.currentTime + index * .065;
      oscillator.type = cue === 'hit' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequency,at);
      gain.gain.setValueAtTime(0,at); gain.gain.linearRampToValueAtTime(.07,at+.012); gain.gain.exponentialRampToValueAtTime(.001,at+.18);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at+.2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
  dispose() { void this.context?.close(); this.context = null; }
}
