import type { HUD } from '../../core/hud';
import { FLIGHT, type FlappyModel } from './model';
export function createFlappyHUD(hud: HUD, model: FlappyModel, human: (input: unknown) => void, utility: (input: unknown) => void, personal: () => boolean) {
  const pause = hud.button('pause', 'Pause', 'pause', () => utility('pause'));
  const restart = hud.button('restart', 'Restart', 'restart', () => utility('retry'));
  hud.intro('flappy', 'Tap to flap. Fly between the pipes; the gold center earns two points.');
  return () => {
    hud.stats({ Score: model.score, Best: model.best });
    restart.disabled = !personal();
    restart.hidden = model.mode !== 'paused';
    pause.hidden = !personal() || model.mode !== 'playing';
    if (model.mode === 'over')
      hud.panel(model.y - FLIGHT.radius < 0 ? 'Too high' : model.y + FLIGHT.radius > FLIGHT.ground ? 'Grounded' : 'Pipe hit', `${model.score} points · ${model.passed} gates · Best ${model.best}`, personal() ? [{ label: 'Try again', symbol: 'play', press: () => human('flap') }] : []);
    else if (model.mode === 'paused')
      hud.panel('Paused', '', personal() ? [{ label: 'Resume', symbol: 'play', press: () => utility('resume') }] : []);
    else
      hud.panel('');
  };
}
