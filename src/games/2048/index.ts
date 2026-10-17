import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { create2048Model } from './model';
import { createView } from './view';
import { createHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store } = context;
  stage.mount(hud.element, hud.playArea, 'board', 6.6, 6.6, 0x20374b);
  const model = create2048Model(store.load('state', null), store.load<number>('best', 0));
  const render = createView(stage, model), refresh = createHUD(context, model);
  const audio = new GameAudio('2048');
  let moves = model.moves, score = model.score, mode = model.mode;
  return mountRun(context, { model, audio, render: dt => {
    render(dt);
    if (model.mode === 'over' && mode !== 'over') audio.play('lose');
    else if (model.moves > moves) audio.play(model.score > score ? 'collect' : 'move');
    else if (model.moves < moves) audio.play('select');
    moves = model.moves; score = model.score; mode = model.mode;
  }, refresh, rejected: render.bump, active: () => render.active() || refresh.active(), inspect: () => ({ visual: render.inspect() }), persist: () => { store.save('state', model.saved()); store.save('best', model.best); }, swipe: true,
    keys: key => ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'undo', Z: 'undo' } as Record<string, string>)[key] });
}
