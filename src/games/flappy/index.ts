import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { createFlappyModel } from './model';
import { createFlappyView } from './view';
import { createFlappyHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store, player } = context;
  const model = createFlappyModel(store.load('best', 0)), audio = new GameAudio('flappy');
  if (player.type === 'human')
    model.restore(store.load('run', null));
  const view = createFlappyView(stage, model);
  let best = store.load('best', 0), serial = model.serial, savedRun = '';
  const persist = () => { if (best !== model.best) {
    best = model.best;
    store.save('best', best);
  } const run = model.savedRun(), value = JSON.stringify(run); if (value !== savedRun) {
    savedRun = value;
    store.save('run', run);
  } };
  const utility = (input: unknown) => { if (player.type !== 'human')
    return; if (input === 'pause') {
    if (model.mode === 'paused')
      model.resume();
    else
      model.pause();
  }
  else if (input === 'resume')
    model.resume();
  else
    model.act(input); persist(); };
  const updateHUD = createFlappyHUD(hud, model, input => { player.submitHumanInput(input); }, utility, () => player.type === 'human');
  return mountRun(context, { model, audio, continuous: true,
    render: () => { view.draw(); if (serial !== model.serial) {
      serial = model.serial;
      if (model.event === 'score')
        audio.play('collect');
      else if (model.event === 'hit')
        audio.play('hit');
      else if (model.event === 'flap')
        audio.play('move');
      if (model.event === 'score' || model.event === 'hit')
        persist();
    } },
    refresh: updateHUD, persist,
    keys: (key, repeat) => { if (repeat && (key === ' ' || key.toLowerCase() === 'p'))
      return undefined; if (key.toLowerCase() === 'p') {
      if (player.type === 'ai') {
        if (model.mode === 'paused')
          player.resume();
        else
          player.pause();
      }
      else {
        utility('pause');
        hud.onChange();
      }
      return undefined;
    } return key === ' ' ? 'flap' : undefined; }, pick: () => 'flap',
    start: () => { if (model.mode === 'ready')
      model.act('flap'); } });
}
