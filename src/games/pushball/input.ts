import { DASH_COOLDOWN, normalizeAction, type Action } from './model';

export function bindPushballInput(host: HTMLElement, togglePause: () => void) {
  const stick = document.createElement('div');
  stick.className = 'pushball-stick'; stick.tabIndex = 0;
  stick.setAttribute('role', 'group');
  stick.setAttribute('aria-label', 'Movement joystick. Use arrow keys or W A S D.');
  stick.innerHTML = '<span class="pushball-stick-cross" aria-hidden="true">✣</span><span class="pushball-stick-knob" aria-hidden="true"></span>';
  const knob = stick.querySelector<HTMLElement>('.pushball-stick-knob')!;
  const dash = document.createElement('button');
  dash.type = 'button'; dash.className = 'pushball-dash';
  dash.setAttribute('aria-label', 'Dash. Keyboard: Space.');
  dash.innerHTML = '<strong>DASH ↗</strong><span>Ready</span>';
  const left = document.createElement('div'); left.className = 'pushball-movement';
  left.append(stick);
  const caption = document.createElement('span'); caption.textContent = 'MOVE'; left.append(caption);
  host.append(left, dash);
  const keys = new Set<string>();
  let pointer: number | null = null, x = 0, y = 0, dashQueued = false;
  let lastDirection = { x: 0, y: -1 };
  function updateStick(event: PointerEvent) {
    const bounds = stick.getBoundingClientRect(), radius = bounds.width * 0.32;
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const magnitude = Math.max(radius, Math.hypot(dx, dy));
    x = dx / magnitude; y = dy / magnitude;
    if (Math.hypot(x, y) < 0.12) x = y = 0;
    knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
  }
  const down = (event: PointerEvent) => {
    if (pointer !== null || event.button !== 0) return;
    event.preventDefault(); pointer = event.pointerId;
    stick.setPointerCapture(pointer); updateStick(event);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    event.preventDefault(); updateStick(event);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = null; x = y = 0; knob.style.transform = '';
  };
  const pressDash = () => { if (!dash.disabled) dashQueued = true; };
  const dashDown = (event: PointerEvent) => { if (event.button === 0) { event.preventDefault(); pressDash(); } };
  const dashClick = (event: MouseEvent) => { if (event.detail === 0) pressDash(); };
  const blockedTarget = (event: KeyboardEvent) => event.target instanceof HTMLElement
    && !!event.target.closest('dialog,input,textarea,select');
  const movementKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  const keydown = (event: KeyboardEvent) => {
    if (blockedTarget(event) || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (movementKeys.includes(key)) { event.preventDefault(); keys.add(key); }
    if (key === ' ') { event.preventDefault(); if (!event.repeat) pressDash(); }
    if ((key === 'p' || key === 'escape') && !event.repeat) { event.preventDefault(); togglePause(); }
  };
  const keyup = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); };
  function reset() {
    const captured = pointer; pointer = null;
    if (captured !== null && stick.hasPointerCapture(captured)) stick.releasePointerCapture(captured);
    keys.clear(); x = y = 0; dashQueued = false; knob.style.transform = '';
  }
  stick.addEventListener('pointerdown', down); stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
  stick.addEventListener('lostpointercapture', up);
  dash.addEventListener('pointerdown', dashDown); dash.addEventListener('click', dashClick);
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  window.addEventListener('blur', reset);
  return {
    dash,
    read(): Action {
      const keyboardX = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a'));
      const keyboardY = Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w'));
      const action = normalizeAction({ x: keys.size ? keyboardX : x, y: keys.size ? keyboardY : y, dash: dashQueued });
      if (Math.hypot(action.x, action.y) > 0.05) lastDirection = { x: action.x, y: action.y };
      else if (dashQueued) { action.x = lastDirection.x; action.y = lastDirection.y; }
      dashQueued = false;
      return action;
    },
    reset,
    updateCooldown(cooldown: number, enabled: boolean) {
      dash.disabled = !enabled || cooldown > 0;
      dash.querySelector('span')!.textContent = cooldown > 0 ? `${cooldown.toFixed(1)}s` : 'Ready';
      dash.style.setProperty('--charge', `${Math.max(0, 1 - cooldown / DASH_COOLDOWN) * 100}%`);
    },
    dispose() {
      reset();
      stick.removeEventListener('pointerdown', down); stick.removeEventListener('pointermove', move);
      stick.removeEventListener('pointerup', up); stick.removeEventListener('pointercancel', up);
      stick.removeEventListener('lostpointercapture', up);
      dash.removeEventListener('pointerdown', dashDown); dash.removeEventListener('click', dashClick);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', reset);
    }
  };
}
