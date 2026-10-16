import type { HUD } from '../../core/hud';
import type { Match3Model } from './model';
export function createMatch3HUD(hud: HUD, model: Match3Model, utility: (input: unknown) => void, personal: () => boolean) {
  const hint = hud.button('hint', 'Hint', 'hint', () => utility('hint'));
  const restart = hud.button('restart', 'Restart', 'restart', () => utility('retry'));
  hud.intro('match3', 'Swipe a gem or tap two neighbors. Match three or more; cascades multiply points. One endless run: no levels, no move limit and no end, so the score is the record.');
  return () => {
    const busy = model.phase === 'clearing' || model.phase === 'falling', summary = model.summary();
    hud.stats({ Score: model.score, Best: model.best, Moves: model.moves, Pace: summary.pace });
    hint.disabled = !personal() || busy || model.mode !== 'playing';
    restart.disabled = !personal() || busy;
    hud.notice(model.shuffled ? 'No swap left · board reshuffled' : '');
    if (model.mode === 'paused')
      hud.panel('Paused', summary.score + ' points in ' + summary.moves + ' moves', personal() ? [{ label: 'Resume', press: () => utility('resume') }] : []);
    else
      hud.panel('');
  };
}
