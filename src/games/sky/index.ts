import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { SkyRun } from './model';
import { SkyView } from './view';
import { skyHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store } = context;
  stage.mount(hud.element, hud.playArea, 'flight', 10.5, 10, 0x203d51);
  const model = new SkyRun(store.load('best', 0));
  if (context.player.type === 'human')
    model.restore(store.load('run', null));
  const view = new SkyView(stage), audio = new GameAudio();
  const refresh = skyHUD(context, model, audio);
  let savedBest = store.load('best', 0), lastBoost = false, savedRun = '';
  const persist = () => {
    audio.unlock();
    if (model.best !== savedBest) {
      savedBest = model.best;
      store.save('best', savedBest);
    }
    const run = model.savedRun(), value = JSON.stringify(run);
    if (value !== savedRun) {
      savedRun = value;
      store.save('run', run);
    }
  };
  return mountRun(context, { model, continuous: true, start: () => model.start(), render: dt => { view.render(model, dt); if (model.state.boost > 0 && !lastBoost)
      audio.play('boost'); lastBoost = model.state.boost > 0; for (const event of model.events.splice(0))
      audio.play(event === 'sector' ? 'win' : event); if (model.best !== savedBest) {
      persist();
    } }, refresh,
    keys: (key, repeat = false) => repeat ? undefined : ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: model.mode === 'ready' ? 'start' : 'boost', ' ': model.mode === 'ready' ? 'start' : 'boost', a: 'left', d: 'right', p: 'pause', Enter: model.mode === 'ready' ? 'start' : model.mode === 'paused' ? 'pause' : model.mode === 'over' ? 'restart' : undefined } as Record<string, string | undefined>)[key],
    swipe: true, pick: () => model.mode === 'ready' ? 'start' : undefined, persist, dispose: () => audio.dispose() });
}
