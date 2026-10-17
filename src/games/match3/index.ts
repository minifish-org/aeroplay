import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { createMatch3Model, type GemPoint } from './model';
import { createMatch3View } from './view';
import { createMatch3HUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store, player } = context;
  const model = createMatch3Model(store.load('run', null), store.load('best', 0)), audio = new GameAudio('match3');
  const view = createMatch3View(stage, model);
  let saved = '', best = model.best, score = model.score, serial = model.serial, reshuffles = model.reshuffles;
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
  let drag: { x: number; y: number; id: number; from: GemPoint } | null = null;
  const cancelDrag = () => { drag = null; };
  const down = (event: PointerEvent) => {
    if (event.target instanceof Element && event.target.closest('button,summary,details,.hud-panel,.hud-inputs'))
      return;
    const from = stage.pick(event.clientX, event.clientY) as GemPoint | undefined;
    if (from && Number.isInteger(from.x) && Number.isInteger(from.y))
      drag = { x: event.clientX, y: event.clientY, id: event.pointerId, from };
  };
  const up = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId)
      return;
    const gesture = drag, dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    cancelDrag();
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20 || hud.helpOpen)
      return;
    const to = { x: gesture.from.x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0), y: gesture.from.y + (Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : 0) };
    if (to.x < 0 || to.x > 7 || to.y < 0 || to.y > 7)
      return;
    if (model.selected)
      player.submitHumanInput({ ...model.selected });
    player.submitHumanInput(gesture.from);
    player.submitHumanInput(to);
  };
  hud.element.addEventListener('pointerdown', down);
  hud.element.addEventListener('pointerup', up);
  hud.element.addEventListener('pointercancel', cancelDrag);
  const dispose = mountRun(context, { model, audio, clearInput: cancelDrag, active: () => model.mode === 'playing' && ['clearing', 'falling'].includes(model.phase) || view.active(), inspect: () => ({ visual: view.inspect() }),
    render: dt => { view.draw(dt); if (model.score > score) {
      audio.play('collect');
    } else if (model.reshuffles > reshuffles) audio.play('shuffle');
    else if (serial !== model.serial && model.swap && !model.swap.accepted) audio.play('hit');
    score = model.score; serial = model.serial; reshuffles = model.reshuffles;
    },
    refresh: () => { updateHUD(); persist(); }, persist,
    pick: (x, y) => stage.pick(x, y) });
  return () => {
    dispose();
    hud.element.removeEventListener('pointerdown', down);
    hud.element.removeEventListener('pointerup', up);
    hud.element.removeEventListener('pointercancel', cancelDrag);
  };
}
