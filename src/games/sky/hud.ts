import type { GameAudio } from '../../core/audio';
import type { GameContext } from '../../core/loop';
import { SECTOR_LENGTH, type SkyRun } from './model';
export function skyHUD(context: GameContext, model: SkyRun, audio: GameAudio) {
  const { hud, player } = context, send = (input: unknown) => player.submitHumanInput(input);
  const pause = hud.button('pause', 'Pause', 'pause', () => send('pause')), restart = hud.button('restart', 'Restart', 'restart', () => send('restart')), sound = hud.button('sound', 'Sound', 'sound', () => audio.toggle());
  const distance = document.createElement('div'), meter = document.createElement('progress'), caption = document.createElement('span');
  distance.style.cssText = 'display:grid;gap:var(--space-xs);width:94px;font-size:var(--text-sm)';
  meter.style.cssText = 'width:94px;height:8px';
  meter.max = SECTOR_LENGTH;
  meter.setAttribute('aria-label', 'Sector flight distance');
  distance.append(caption, meter);
  hud.actions.append(distance);
  const bank = hud.bank('steer', 124);
  hud.button('left', 'Left', 'left', () => send('left'), bank);
  const boost = hud.button('boost', 'Boost', 'boost', () => send('boost'), bank);
  hud.button('right', 'Right', 'right', () => send('right'), bank);
  hud.intro('sky', 'Steer toward golden rings and avoid barriers. Boost doubles ring points. Your shield absorbs one hit.');
  return () => {
    const state = model.state, biome = ['Cloud Coast', 'Amber Heights', 'Blue Horizon'][(state.sector - 1) % 3];
    hud.stats({ Score: state.score, Best: model.best, Rings: state.rings, Streak: state.combo + ' / ' + state.maxCombo, Sector: state.sector + ' · ' + biome, Shield: state.shield ? 'Ready' : 'Used' });
    meter.value = state.distance;
    meter.setAttribute('aria-valuetext', Math.round(state.distance) + ' of ' + SECTOR_LENGTH + ' meters');
    caption.textContent = Math.round(state.distance) + ' / ' + SECTOR_LENGTH + ' m';
    hud.label(sound, audio.enabled ? 'Sound on' : 'Sound off');
    sound.setAttribute('aria-pressed', String(audio.enabled));
    restart.hidden = state.mode === 'ready' || state.mode === 'over';
    boost.disabled = state.charge < 100 || state.boost > 0 || state.mode !== 'playing' || player.type === 'ai';
    hud.label(boost, state.boost > 0 ? 'Boost ' + state.boost.toFixed(1) + 's' : state.charge < 100 ? 'Boost ' + Math.round(state.charge) + '%' : 'Boost', state.boost > 0 ? 'Boost active: ' + state.boost.toFixed(1) + ' seconds remaining' : state.charge < 100 ? 'Boost charge: ' + Math.round(state.charge) + ' percent' : 'Boost ready');
    pause.disabled = !['playing', 'paused'].includes(state.mode) || player.type === 'ai';
    hud.label(pause, state.mode === 'paused' ? 'Resume' : 'Pause');
    const title = state.mode === 'ready' ? 'Ready to fly' : state.mode === 'paused' ? 'Flight paused' : state.mode === 'over' ? 'Flight complete' : state.mode === 'won' ? 'Sector cleared' : '';
    hud.panel(title, state.mode === 'ready' ? 'Find the open lane.' : state.score + ' points · ' + state.rings + ' rings', state.mode === 'paused' ? [] : [{ label: state.mode === 'ready' ? 'Start flight' : state.mode === 'won' ? 'Next sector' : 'Fly again', symbol: 'play', press: () => send(state.mode === 'ready' ? 'start' : state.mode === 'won' ? 'next' : 'restart') }]);
    hud.notice(state.messageTime > 0 ? state.message : '');
  };
}
