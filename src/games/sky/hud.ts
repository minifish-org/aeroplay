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
  meter.setAttribute('aria-label', 'Distance into the current sector');
  distance.append(caption, meter);
  hud.actions.append(distance);
  const bank = hud.bank('steer', 124);
  hud.button('left', 'Left', 'left', () => send('left'), bank);
  const boost = hud.button('boost', 'Boost', 'boost', () => send('boost'), bank);
  hud.button('right', 'Right', 'right', () => send('right'), bank);
  hud.intro('sky', 'Steer toward golden rings and avoid barriers. Boost doubles ring points. Your shield absorbs one hit, and the flight runs on forever: every 1000 meters opens a faster sector.');
  return () => {
    const state = model.state, biome = ['Cloud Coast', 'Amber Heights', 'Blue Horizon'][(state.sector - 1) % 3];
    hud.stats({ Score: state.score, Sector: state.sector + ' · ' + biome, Flown: (state.total / 1000).toFixed(1) + ' km' });
    meter.value = state.distance;
    meter.setAttribute('aria-valuetext', Math.round(state.distance) + ' of ' + SECTOR_LENGTH + ' meters into sector ' + state.sector);
    caption.textContent = Math.round(state.distance) + ' / ' + SECTOR_LENGTH + ' m';
    hud.label(sound, audio.enabled ? 'Sound on' : 'Sound off');
    sound.setAttribute('aria-pressed', String(audio.enabled));
    restart.hidden = state.mode !== 'paused';
    boost.disabled = state.charge < 100 || state.boost > 0 || state.mode !== 'playing' || player.type === 'ai';
    hud.label(boost, state.boost > 0 ? 'Boost ' + state.boost.toFixed(1) + 's' : state.charge < 100 ? 'Boost ' + Math.round(state.charge) + '%' : 'Boost', state.boost > 0 ? 'Boost active: ' + state.boost.toFixed(1) + ' seconds remaining' : state.charge < 100 ? 'Boost charge: ' + Math.round(state.charge) + ' percent' : 'Boost ready');
    pause.hidden = player.type === 'ai' || state.mode !== 'playing';
    const title = state.mode === 'ready' ? 'Ready to fly' : state.mode === 'paused' ? 'Flight paused' : state.mode === 'over' ? 'Barrier hit' : '';
    hud.panel(title, state.mode === 'ready' ? 'Fly through gold rings. Avoid marked barriers.' : state.score + ' points · ' + state.rings + ' rings · sector ' + state.sector + (state.mode === 'over' ? ' · ' + Math.round(state.total) + ' m flown · Best streak ' + state.maxCombo : ''), player.type === 'ai' ? [] : [{ label: state.mode === 'ready' ? 'Start flight' : state.mode === 'paused' ? 'Resume' : 'Fly again', symbol: 'play', press: () => send(state.mode === 'ready' ? 'start' : state.mode === 'paused' ? 'pause' : 'restart') }]);
    hud.notice(state.messageTime > 0 ? state.message : '');
  };
}
