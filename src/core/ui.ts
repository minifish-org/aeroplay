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
  el.addEventListener('touchend', onClick);
  return () => {
    el.removeEventListener('click', onClick);
    el.removeEventListener('touchend', onClick);
  };
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
  back.addEventListener('touchend', (e) => {
    e.preventDefault();
    onBack();
  });

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
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    onPress();
  });
  return btn;
}
