import type { HUD } from '../../core/hud';
import type { FlappyModel } from './model';
export function createFlappyHUD(hud: HUD, model: FlappyModel, human: (input: unknown) => void, utility: (input: unknown) => void, personal: () => boolean) {
  const flap = hud.button('flap', 'Take flight', 'play', () => human('flap'));
  const pause = hud.button('pause', 'Pause', 'pause', () => utility('pause'));
  const restart = hud.button('restart', 'Restart', 'restart', () => utility('retry'));
  hud.intro('flappy', 'Tap the sky or Flap. Pass a gate for one point; its center earns two.');
  return () => {
    hud.stats({ Score: model.score, Best: model.best, Gates: model.passed });
    hud.label(flap, model.mode === 'ready' ? 'Take flight' : model.mode === 'over' ? 'Try again' : 'Flap');
    flap.disabled = !personal() || model.mode === 'paused';
    restart.disabled = !personal();
    restart.hidden = model.mode === 'over';
    pause.hidden = !personal();
    pause.disabled = !['playing', 'paused'].includes(model.mode);
    hud.label(pause, model.mode === 'paused' ? 'Resume' : 'Pause');
    if (model.mode === 'over')
      hud.panel('Flight complete', `${model.score} points · ${model.passed} gates · Best ${model.best}`);
    else if (model.mode === 'paused')
      hud.panel('Paused', 'Your flight is waiting.');
    else
      hud.panel('');
  };
}
