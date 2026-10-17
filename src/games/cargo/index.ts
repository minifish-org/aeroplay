import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { getHint, planningSignature } from '../../ai/player';
import { CargoRun, type CargoSave, type CargoDirection } from './model';
import { CargoView } from './view';
import { cargoHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store, player } = context;
  stage.mount(hud.element, hud.playArea, 'island', 11, 10, 0x233f4b);
  const model = new CargoRun(store.load<CargoSave | null>('run', null), store.load('stars', {}));
  const view = new CargoView(stage), audio = new GameAudio('cargo');
  let thinking = false, message = '', job: AbortController | null = null, lastKey = '', lastMoves = model.moves, lastPushes = model.pushes;
  let autoNext = 0, lastMode = model.mode;
  // An island delivered in this session hands the next generated one over by itself.
  const autoAdvance = () => {
    const mode = model.mode;
    if (mode !== 'won') {
      if (autoNext)
        window.clearTimeout(autoNext), autoNext = 0;
      lastMode = mode;
      return;
    }
    if (lastMode === 'won' || autoNext || player.type !== 'human' || hud.helpOpen)
      return;
    lastMode = mode;
    autoNext = window.setTimeout(() => {
      autoNext = 0;
      if (model.mode !== 'won' || player.type !== 'human' || hud.helpOpen)
        return;
      model.act('next');
      persist();
      hud.onChange();
    }, 2600);
  };
  const refresh = cargoHUD(context, model, () => {
    if (thinking || player.type !== 'human')
      return;
    const state = model.planning();
    if (!state)
      return;
    job?.abort();
    job = new AbortController();
    const ticket = job, key = planningSignature(state);
    thinking = true;
    message = '';
    model.usedHint = true;
    persist();
    void getHint(state, ticket.signal).then(plan => { if (ticket.signal.aborted || key !== planningSignature(model.planning() ?? state))
      return; model.hintDirection = plan?.steps[0]?.input as CargoDirection ?? null; message = plan ? '' : 'No delivery route found · Undo or restart.'; })
      .catch(error => { if (!ticket.signal.aborted)
      message = error instanceof Error ? error.message : 'Hint unavailable.'; })
      .finally(() => { if (job === ticket) {
      thinking = false;
      refresh(thinking, message);
      hud.onChange();
    } });
  });
  function persist() { store.save('run', model.save()); store.save('stars', model.stars); }
  return mountRun(context, { model, audio, render: dt => { const key = model.planning() ? planningSignature(model.planning()!) : model.mode; if (lastKey && lastKey !== key && thinking) {
      job?.abort();
      thinking = false;
      message = '';
    } lastKey = key; if (model.moves !== lastMoves) {
      audio.play(model.mode === 'won' ? 'win' : model.moves < lastMoves ? 'select' : model.pushes > lastPushes ? 'collect' : 'move');
      lastMoves = model.moves;
      lastPushes = model.pushes;
    } view.render(model, dt); }, active: () => view.animating, refresh: () => { refresh(thinking, message); autoAdvance(); }, persist, swipe: true,
    keys: key => ({ ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left', w: 'up', d: 'right', s: 'down', a: 'left', z: 'undo', Z: 'undo' } as Record<string, string>)[key], rejected: input => { view.bump(input, model); audio.play('hit'); }, dispose: () => { window.clearTimeout(autoNext); job?.abort(); } });
}
