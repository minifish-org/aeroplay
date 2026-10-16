import { mountRun, type GameContext } from '../../core/loop';
import { createLightsOutModel } from './model';
import { createView } from './view';
import { createHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store } = context;
  stage.mount(hud.element, hud.playArea, 'board', 6.5, 6.5, 0x20374b);
  const model = createLightsOutModel(store.load('state-v2', null)), render = createView(stage, model), refresh = createHUD(context, model);
  return mountRun(context, { model, render, refresh, active: render.active, inspect: () => ({ visual: render.inspect() }), persist: () => store.save('state-v2', model.saved()) });
}
