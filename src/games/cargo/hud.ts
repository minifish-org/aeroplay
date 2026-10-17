import type { GameContext } from '../../core/loop';
import { cargoCorner, type CargoRun } from './model';
export function cargoHUD(context: GameContext, model: CargoRun, hint: () => void) {
  const { hud, player } = context, send = (input: unknown) => player.submitHumanInput(input);
  const undo = hud.button('undo', 'Undo', 'undo', () => send('undo'));
  const help = hud.button('hint', 'Hint', 'hint', hint);
  hud.button('restart', 'Restart', 'restart', () => send('restart'));
  let tipLevel = -1;
  const bank = hud.bank('cargo', 156);
  hud.button('up', 'Up', 'up', () => send('up'), bank).style.gridColumn = '2';
  hud.button('left', 'Left', 'left', () => send('left'), bank).style.gridColumn = '1';
  hud.button('down', 'Down', 'down', () => send('down'), bank);
  hud.button('right', 'Right', 'right', () => send('right'), bank);
  return (thinking = false, message = '') => {
    if (tipLevel !== model.level) {
      tipLevel = model.level;
      if (model.level < 3)
        hud.intro('cargo-level-' + model.level, model.data.tip);
    }
    undo.disabled = !model.history.length || player.type === 'ai';
    help.disabled = thinking || model.mode !== 'playing' || player.type === 'ai';
    hud.stats({ Delivered: model.state.crates.filter(c => model.board.goals.includes(c)).length + '/' + model.board.goals.length,
      Pushes: model.pushes + '/' + model.data.par });
    hud.notice(message || (thinking ? 'Finding a route…' : model.hintDirection ? 'Next step: ' + model.hintDirection : model.state.crates.some(c => cargoCorner(model.board, c)) ? 'Crate in a corner · Undo can help' : ''));
    hud.panel(model.mode === 'won' ? 'Delivered!' : '', 'Island ' + (model.level + 1) + ' · ' + model.data.name + ' · ' + model.data.difficulty + ' · ' + model.moves + ' moves · ' + model.pushes + ' pushes · ' + (model.stars[model.level] ?? 0) + ' stars' + (model.usedHint ? ' · Hint used' : ''), player.type === 'ai' ? [] : [{ label: 'Next island', symbol: 'next', press: () => send('next') }]);
  };
}
