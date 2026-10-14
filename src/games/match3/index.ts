import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { createMatch3Model } from './model';
import { createMatch3View } from './view';
import { createMatch3HUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store, player } = context;
  const model = createMatch3Model(store.load('run', null), store.load('best', 0)), audio = new GameAudio();
  const view = createMatch3View(stage, model);
  let saved = '', best = model.best, score = model.score, mode = model.mode;
  const persist = () => {
    if (model.phase !== 'clearing' && model.phase !== 'falling') {
      const state = model.saved(), key = JSON.stringify(state);
      if (key !== saved) {
        saved = key;
        store.save('run', state);
      }
    }
    if (best !== model.best) {
      best = model.best;
      store.save('best', best);
    }
  };
  const utility = (input: unknown) => { if (hud.helpOpen)
    return; if (input === 'resume' && player.type === 'ai') {
    player.resume();
    return;
  } if (player.type !== 'human')
    return; model.act(input); if (input === 'resume')
    model.resume(); persist(); };
  const updateHUD = createMatch3HUD(hud, model, utility, () => player.type === 'human');
  const sound = hud.button('sound', 'Sound', 'sound', () => audio.toggle());
  return mountRun(context, { model, active: () => model.mode === 'playing' && ['clearing', 'falling'].includes(model.phase),
    render: () => { view.draw(); if (score !== model.score) {
      score = model.score;
      audio.play('collect');
    } if (mode !== model.mode) {
      mode = model.mode;
      if (mode === 'won')
        audio.play('win');
    } },
    refresh: () => { updateHUD(); sound.setAttribute('aria-pressed', String(audio.enabled)); persist(); }, persist,
    pick: (x, y) => { audio.unlock(); return stage.pick(x, y); }, dispose: () => audio.dispose() });
}
