import type { HUD } from '../../core/hud';
import type { Match3Model } from './model';
export function createMatch3HUD(hud: HUD, model: Match3Model, utility: (input: unknown) => void, personal: () => boolean) {
  const hint = hud.button('hint', 'Hint', 'hint', () => utility('hint'));
  const restart = hud.button('restart', 'Restart', 'restart', () => utility('retry'));
  const meter = document.createElement('progress');
  meter.setAttribute('aria-label', 'Level score target');
  meter.style.cssText = 'width:100%;height:3px;accent-color:var(--accent)';
  hud.intro('match3', 'Tap two neighboring gems to swap. Match three or more; cascades multiply points. Reach the target in 30 moves.');
  return () => {
    const busy = model.phase === 'clearing' || model.phase === 'falling';
    hud.stats({ Score: `${model.score}/${model.target()}`, Moves: model.moves, Level: model.level, Best: model.best });
    if (!meter.isConnected)
      hud.element.querySelector('.hud-stat')!.append(meter);
    meter.max = model.target();
    meter.value = Math.min(model.target(), model.score);
    hint.disabled = !personal() || busy || model.mode !== 'playing';
    restart.disabled = !personal() || busy;
    hud.label(restart, model.mode === 'won' ? 'Next' : 'Restart');
    if (model.mode === 'won')
      hud.panel('Level cleared', `${'★'.repeat(model.summary().stars)} · ${model.score} points · ${model.moves} moves left`);
    else if (model.mode === 'over')
      hud.panel('Out of moves', `${model.target() - model.score} points from the target.`);
    else if (model.mode === 'paused')
      hud.panel('Paused', '', [{ label: 'Resume', press: () => utility('resume') }]);
    else
      hud.panel('');
  };
}
