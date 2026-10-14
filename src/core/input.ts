export type Direction = 'left' | 'right' | 'up' | 'down';
export function bindInput(host: HTMLElement, keyInput: (key: string, repeat: boolean) => unknown, submit: (input: unknown) => void, pick: (x: number, y: number) => unknown, swipe = false) {
  let start: {
    x: number;
    y: number;
    id: number;
  } | null = null;
  const down = (event: PointerEvent) => {
    if (event.target instanceof Element && event.target.closest('button,select,input,.hud-panel,.hud-inputs'))
      return;
    host.querySelector('canvas')?.focus({ preventScroll: true });
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    host.setPointerCapture(event.pointerId);
  };
  const up = (event: PointerEvent) => {
    if (!start || start.id !== event.pointerId)
      return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    start = null;
    if (swipe && Math.max(Math.abs(dx), Math.abs(dy)) >= 20)
      submit(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    else if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) {
      const value = pick(event.clientX, event.clientY);
      if (value !== undefined)
        submit(value);
    }
  };
  const cancel = () => { start = null; };
  const key = (event: KeyboardEvent) => {
    if (event.target instanceof Element && event.target.closest('select,input,textarea'))
      return;
    if (event.target instanceof Element && event.target.closest('button') && [' ', 'Enter'].includes(event.key))
      return;
    const value = keyInput(event.key, event.repeat);
    if (value === undefined)
      return;
    event.preventDefault();
    submit(value);
  };
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key);
  return () => { host.removeEventListener('pointerdown', down); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key); };
}
export function joystick(host: HTMLElement, update: (x: number, y: number) => void) {
  let pointer: number | null = null;
  host.classList.add('joystick');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Movement joystick');
  const knob = document.createElement('span');
  host.append(knob);
  const move = (event: PointerEvent) => {
    if (pointer !== event.pointerId)
      return;
    const r = host.getBoundingClientRect(), radius = r.width * .32;
    let x = (event.clientX - r.x - r.width / 2) / radius, y = (event.clientY - r.y - r.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    knob.style.transform = 'translate(' + x * radius + 'px,' + y * radius + 'px)';
    update(Math.hypot(x, y) < .15 ? 0 : x, Math.hypot(x, y) < .15 ? 0 : y);
  };
  const down = (event: PointerEvent) => { pointer = event.pointerId; host.setPointerCapture(pointer); move(event); };
  const reset = () => { pointer = null; knob.style.transform = ''; update(0, 0); };
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', reset);
  host.addEventListener('pointercancel', reset);
  return { reset, dispose() { reset(); host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', reset); host.removeEventListener('pointercancel', reset); } };
}
