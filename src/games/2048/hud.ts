import type { GameContext } from '../../core/loop';
import type { MergeModel } from './model';
export function createHUD({ hud, player }: GameContext, model: MergeModel) {
  const submit = (input: string) => { player.submitHumanInput(input); };
  const restart = hud.button('restart', 'Restart', 'restart', () => submit('restart'));
  const undo = hud.button('undo', 'Undo', 'undo', () => submit('undo'));
  let highest = model.summary().highest, lastMoves = model.moves, feedbackUntil = 0;
  hud.intro('2048', 'Swipe matching numbers together. Reach 2048 and keep going. Arrow keys work on Mac.');
  const refresh = () => {
    const s = model.summary();
    hud.stats({ Score: s.score, Best: s.best });
    if (s.moves === 0 && lastMoves > 0) {
      highest = s.highest;
      feedbackUntil = 0;
    }
    if (s.moves > lastMoves && s.highest > highest) {
      highest = s.highest;
      if (highest >= 128) {
        hud.notice(highest >= 2048 ? highest + '! Keep going.' : highest + ' tile!');
        feedbackUntil = model.clock + 1.6;
      }
    }
    if (!feedbackUntil || model.clock >= feedbackUntil || model.mode === 'over') {
      hud.notice('');
      feedbackUntil = 0;
    }
    lastMoves = s.moves;
    undo.disabled = !s.undoCount || player.type === 'ai';
    restart.disabled = player.type === 'ai';
    undo.hidden = restart.hidden = model.mode === 'over';
    if (model.mode === 'over')
      hud.panel('No moves left', model.score + ' points · ' + s.highest + ' best tile', player.type === 'ai' ? [] : [
        ...(s.undoCount ? [{ label: 'Undo', symbol: 'undo', press: () => submit('undo') }] : []),
        { label: 'New game', symbol: 'restart', press: () => submit('restart') }
      ]);
    else if (model.mode === 'paused')
      hud.panel('Paused', '', player.type === 'ai' ? [] : [{ label: 'Resume', press: () => player.resume() }]);
    else
      hud.panel('');
  };
  return Object.assign(refresh, { active: () => feedbackUntil > model.clock && model.mode === 'playing' });
}
