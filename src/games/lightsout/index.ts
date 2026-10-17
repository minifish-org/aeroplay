import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { createLightsOutModel } from './model';
import { createView } from './view';
import { createHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store } = context;
  stage.mount(hud.element, hud.playArea, 'board', 6.5, 6.5, 0x20374b);
  const model = createLightsOutModel(store.load('state-v2', null)), render = createView(stage, model), refresh = createHUD(context, model);
  const audio = new GameAudio('lightsout');
  let moves = model.moves, mode = model.mode, level = model.level;
  return mountRun(context, { model, audio, render: dt => {
    render(dt);
    if (model.mode === 'won' && mode !== 'won') audio.play('win');
    else if (model.level === level && model.moves !== moves) audio.play('move');
    moves = model.moves; mode = model.mode; level = model.level;
  }, refresh, active: render.active, inspect: () => ({ visual: render.inspect() }), persist: () => store.save('state-v2', model.saved()) });
}
