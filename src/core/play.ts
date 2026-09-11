import { createTouchButton } from './ui';

export type Mode = 'ready' | 'playing' | 'paused' | 'over' | 'won';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export function exposeGame(read: () => object, advance?: (ms: number) => void) {
  window.render_game_to_text = () =>
    JSON.stringify({
      coordinates: 'Origin top-left; x right, y down',
      ...read()
    });
  window.advanceTime = advance ?? (() => {});
  return () => {
    delete window.render_game_to_text;
    delete window.advanceTime;
  };
}

export function message(area: HTMLElement, text: string) {
  const el = document.createElement('div');
  el.className = 'game-message';
  el.setAttribute('role', 'status');
  el.textContent = text;
  area.appendChild(el);
  return el;
}

export function directionPad(
  area: HTMLElement,
  move: (x: number, y: number) => void
) {
  const pad = document.createElement('div');
  pad.className = 'control-grid';
  const directions: [string, number, number, string][] = [
    ['↑', 0, -1, 'Up'],
    ['←', -1, 0, 'Left'],
    ['→', 1, 0, 'Right'],
    ['↓', 0, 1, 'Down']
  ];
  directions.forEach(([label, x, y, name], i) => {
    const button = createTouchButton(label, () => move(x, y));
    button.style.gridArea = ['1 / 2', '2 / 1', '2 / 3', '3 / 2'][i];
    button.setAttribute('aria-label', name);
    pad.appendChild(button);
  });
  area.appendChild(pad);
}

export function canvasOverlay(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string
) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = 'rgba(9, 19, 35, .82)';
  ctx.fillRect(0, height / 2 - 53, width, 106);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f8ff';
  ctx.font = `700 ${Math.min(24, width / 12)}px system-ui`;
  ctx.fillText(title, width / 2, height / 2 - 7);
  ctx.font = `${Math.min(13, width / 20)}px system-ui`;
  ctx.fillStyle = '#b6c9dd';
  ctx.fillText(subtitle, width / 2, height / 2 + 22);
}
