import { mountRun, type GameContext } from '../../core/loop';
import { create2048Model } from './model';
import { createView } from './view';
import { createHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store } = context;
  stage.mount(hud.element, hud.playArea, 'board', 6.6, 6.6, 0x20374b);
  const model = create2048Model(store.load('state', null), store.load<number>('best', 0));
  const render = createView(stage, model), refresh = createHUD(context, model);
  return mountRun(context, { model, render, refresh, rejected: render.bump, active: refresh.active, persist: () => { store.save('state', model.saved()); store.save('best', model.best); }, swipe: true,
    keys: key => ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'undo', Z: 'undo' } as Record<string, string>)[key] });
}
