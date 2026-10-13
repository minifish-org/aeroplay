export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export function bindSwipe(
  el: HTMLElement,
  handler: (dir: SwipeDirection) => void,
  threshold = 20
): () => void {
  let startX = 0;
  let startY = 0;
  const start = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    startX = touch.clientX;
    startY = touch.clientY;
  };
  const end = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      handler(dx > 0 ? 'right' : 'left');
    } else {
      handler(dy > 0 ? 'down' : 'up');
    }
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', end, { passive: true });
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchend', end);
  };
}

export function bindTap(el: HTMLElement, handler: () => void): () => void {
  const onClick = (e: Event) => {
    e.preventDefault();
    handler();
  };
  el.addEventListener('click', onClick);
  return () => {
    el.removeEventListener('click', onClick);
  };
}

/** Hosts a canvas or board so controls can live inside the play area. */
export function wrapSurface(element: HTMLElement, className: string) {
  const surface = document.createElement('div');
  surface.className = `game-surface ${className}`.trim();
  element.parentNode?.insertBefore(surface, element);
  surface.append(element);
  return surface;
}

/** Occasional actions: under the board on phones, beside it when width allows. */
export function surfaceActions(surface: HTMLElement) {
  const bar = document.createElement('div');
  bar.className = 'surface-actions control-row';
  if (surface.parentNode) surface.after(bar);
  else surface.append(bar);
  return bar;
}

/** A control group pinned to an edge of the play surface. */
export function surfaceCorner(
  surface: HTMLElement,
  corner: 'tl' | 'tr' | 'left' | 'right'
) {
  const bar = document.createElement('div');
  bar.className = `surface-corner surface-${corner}`;
  surface.append(bar);
  return bar;
}

export function createGameShell(
  root: HTMLElement,
  title: string,
  onBack: () => void
): { area: HTMLElement; backButton: HTMLButtonElement } {
  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'game-shell';

  const bar = document.createElement('div');
  bar.className = 'game-bar';

  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = 'Back';
  back.addEventListener('click', onBack);

  const heading = document.createElement('div');
  heading.className = 'game-title';
  heading.textContent = title;

  bar.appendChild(back);
  bar.appendChild(heading);

  const area = document.createElement('div');
  area.className = 'game-area';

  shell.appendChild(bar);
  shell.appendChild(area);
  root.appendChild(shell);

  return { area, backButton: back };
}

export function createTouchButton(
  label: string,
  onPress: () => void,
  className = ''
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `touch-btn ${className}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    onPress();
  });
  const names: Record<string, string> = {
    '▲': 'Up',
    '▼': 'Down',
    '◀': 'Left',
    '▶': 'Right',
    '⟳': 'Rotate'
  };
  if (names[label]) btn.setAttribute('aria-label', names[label]);
  return btn;
}
