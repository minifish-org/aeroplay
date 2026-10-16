import type { GameContext } from '../../core/loop';
import type { LightsModel } from './model';
export function createHUD({ hud, player }: GameContext, model: LightsModel) {
  const submit = (input: string) => { player.submitHumanInput(input); };
  const undo = hud.button('undo', 'Undo', 'undo', () => submit('undo')), hint = hud.button('hint', 'Hint', 'hint', () => submit('hint'));
  const retry = hud.button('restart', 'Retry', 'restart', () => submit('retry'));
  hud.intro('lightsout', 'Turn every lamp off. Each tap flips that lamp and its four neighbors. Every puzzle adds boards and minimum taps.');
  return () => {
    const s = model.summary();
    hud.stats({ Puzzle: s.level + ' · ' + s.size + '×' + s.size, Moves: s.moves + ' / ' + s.par });
    undo.disabled = !s.undoCount || player.type === 'ai';
    hint.disabled = model.mode !== 'playing' || player.type === 'ai';
    retry.disabled = player.type === 'ai';
    hint.hidden = retry.hidden = model.mode === 'won';
    if (model.mode === 'won')
      hud.panel('Lights out', s.stars + ' stars · ' + s.moves + ' moves' + (s.hintsUsed ? ' · Hint used' : ''), player.type === 'ai' ? [] : [
        { label: 'Next puzzle', symbol: 'next', press: () => submit('next') },
        { label: 'Retry', symbol: 'restart', press: () => submit('retry') }
      ]);
    else if (model.mode === 'paused')
      hud.panel('Paused', '', player.type === 'ai' ? [] : [{ label: 'Resume', press: () => player.resume() }]);
    else
      hud.panel('');
  };
}
