import { mountRun, type GameContext } from '../../core/loop';
import { createSudokuModel } from './model';
import { createSudokuView } from './view';
import { createSudokuHUD } from './hud';
export default function mount(context: GameContext) {
  const { stage, hud, store, player } = context;
  const model = createSudokuModel(store.load('state-v2', null), store.load<number | null>('bestSeconds', null));
  const view = createSudokuView(stage, model);
  let saved = '', best = model.bestSeconds;
  const persist = () => { const state = model.saved(), key = JSON.stringify(state); if (key !== saved) { store.save('state-v2', state); saved = key; } if (best !== model.bestSeconds) { best = model.bestSeconds; store.save('bestSeconds', best); } };
  const utility = (input: unknown) => { if (player.type !== 'human' || hud.helpOpen) return; if (input === 'resume') model.resume(); else model.act(input); persist(); };
  const updateHUD = createSudokuHUD(hud, model, input => { player.submitHumanInput(input); }, utility, () => player.type === 'human');
  const keys = (key: string) => {
    if (/^[1-9]$/.test(key)) return { type: 'value', value: Number(key) };
    if (key === 'Backspace' || key === 'Delete' || key === '0') return { type: 'value', value: 0 };
    if (key.toLowerCase() === 'n') return { type: 'notes' };
    if (key.toLowerCase() === 'z') return 'undo';
    const offset = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[key];
    return offset === undefined ? undefined : { type: 'select', index: Math.max(0, Math.min(80, (model.selected ?? 0) + offset)) };
  };
  return mountRun(context, { model, timer: true, render: () => view.draw(), refresh: () => { updateHUD(); persist(); }, persist, keys });
}
