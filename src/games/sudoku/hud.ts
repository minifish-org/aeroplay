import type { HUD } from '../../core/hud';
import type { SudokuModel } from './model';
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`;
export function createSudokuHUD(hud: HUD, model: SudokuModel, human: (input: unknown) => void, utility: (input: unknown) => void, personal: () => boolean) {
  const notes = hud.button('notes', 'Notes', 'notes', () => human({ type: 'notes' }));
  const undo = hud.button('undo', 'Undo', 'undo', () => utility('undo'));
  const hint = hud.button('hint', 'Hint · 3', 'hint', () => utility('hint'));
  const next = hud.button('next', 'New', 'next', () => utility('next'));
  const bank = hud.bank('digits', 190);
  const digits = Array.from({ length: 9 }, (_, index) => hud.button('digit-' + (index + 1), String(index + 1), 'notes', () => human({ type: 'value', value: index + 1 }), bank));
  digits.push(hud.button('erase', 'Erase', 'erase', () => human({ type: 'value', value: 0 }), bank));
  hud.intro('sudoku', 'Choose a cell, then a digit. Notes pencil in possibilities; Hint reveals one cell.');
  return () => {
    const stats = model.summary();
    hud.stats({ Puzzle: `${stats.puzzle}/${stats.total}`, Time: time(stats.elapsedSeconds) });
    notes.setAttribute('aria-pressed', String(model.noteMode));
    notes.disabled = !personal() || model.mode !== 'playing';
    undo.disabled = !personal() || !stats.undoCount || model.mode === 'won';
    hint.disabled = !personal() || !model.hints || model.mode !== 'playing';
    next.disabled = !personal();
    hud.label(hint, 'Hint · ' + model.hints);
    digits.forEach(button => { button.disabled = !personal() || model.mode !== 'playing' || model.selected === null || model.givens.includes(model.selected); });
    if (model.mode === 'won')
      hud.panel('Puzzle solved', `${time(stats.elapsedSeconds)} · ${model.mistakes} mistakes${model.bestSeconds !== null ? ' · Best ' + time(model.bestSeconds) : ''}`, personal() ? [{ label: stats.puzzle === stats.total ? 'Play again' : 'Next puzzle', symbol: 'next', press: () => utility('next') }] : []);
    else if (model.mode === 'paused')
      hud.panel('Paused', '', personal() ? [{ label: 'Resume', press: () => utility('resume') }] : []);
    else
      hud.panel('');
  };
}
