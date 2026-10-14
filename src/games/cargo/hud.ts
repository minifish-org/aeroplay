import type { GameAudio } from '../../core/audio';
import type { GameContext } from '../../core/loop';
import { CARGO_LEVELS, cargoCorner, type CargoRun } from './model';
export function cargoHUD(context: GameContext, model: CargoRun, hint: () => void, audio: GameAudio) {
  const { hud, player } = context, send = (input: unknown) => player.submitHumanInput(input);
  const selector = document.createElement('select');
  selector.className = 'level-select';
  selector.setAttribute('aria-label', 'Choose cargo puzzle');
  CARGO_LEVELS.forEach((level, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = String(index + 1).padStart(2, '0') + ' · ' + level.name; selector.append(option); });
  selector.addEventListener('change', () => send({ level: Number(selector.value) }));
  hud.actions.append(selector);
  const undo = hud.button('undo', 'Undo', 'undo', () => send('undo'));
  const help = hud.button('hint', 'Hint', 'hint', hint);
  hud.button('restart', 'Restart', 'restart', () => send('restart'));
  const sound = hud.button('sound', 'Sound', 'sound', () => audio.toggle());
  let tipLevel = -1;
  const bank = hud.bank('cargo', 156);
  hud.button('up', 'Up', 'up', () => send('up'), bank).style.gridColumn = '2';
  hud.button('left', 'Left', 'left', () => send('left'), bank).style.gridColumn = '1';
  hud.button('down', 'Down', 'down', () => send('down'), bank);
  hud.button('right', 'Right', 'right', () => send('right'), bank);
  return (thinking = false, message = '') => {
    if (tipLevel !== model.level) {
      tipLevel = model.level;
      hud.intro('cargo-level-' + model.level, CARGO_LEVELS[model.level].tip + ' Arrows, WASD or swipe move one cell.');
    }
    hud.label(sound, audio.enabled ? 'Sound on' : 'Sound off');
    sound.setAttribute('aria-pressed', String(audio.enabled));
    selector.value = String(model.level);
    selector.disabled = player.type === 'ai';
    undo.disabled = !model.history.length || player.type === 'ai';
    help.disabled = thinking || model.mode !== 'playing' || player.type === 'ai';
    hud.stats({ Delivered: model.state.crates.filter(c => model.board.goals.includes(c)).length + '/' + model.board.goals.length, Pushes: model.pushes, Par: CARGO_LEVELS[model.level].par });
    hud.notice(message || (thinking ? 'Finding a route…' : model.hintDirection ? 'Next step: ' + model.hintDirection : model.state.crates.some(c => cargoCorner(model.board, c)) ? 'Crate in a corner · Undo can help' : ''));
    hud.panel(model.mode === 'won' ? 'Delivered!' : '', model.moves + ' moves · ' + model.pushes + ' pushes · ' + (model.stars[model.level] ?? 0) + ' stars', [{ label: model.level === 11 ? 'First island' : 'Next island', symbol: 'next', press: () => send('next') }]);
  };
}
