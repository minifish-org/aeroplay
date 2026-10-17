import { Player, planningSignature, getAIModelState, subscribeAIModel, getLocalDecisionDiagnostics, type PlanningState } from '../ai/player';
import { bindInput } from './input';
import { HUD } from './hud';
import { Stage, type Preset } from './stage';
import type { Store } from './storage';
import type { GameEntry } from '../games/registry';
/** Each game names its own way to open the next round for a watched run. */
const NEXT_ROUND: Record<string, { label: string; input: string }> = {
  lightsout: { label: 'Next puzzle', input: 'next' },
  sudoku: { label: 'Next puzzle', input: 'next' },
  cargo: { label: 'Next island', input: 'next' },
  match3: { label: 'Next run', input: 'next' },
  '2048': { label: 'Next run', input: 'restart' },
  flappy: { label: 'Next run', input: 'restart' },
  sky: { label: 'Next run', input: 'restart' }
};
export interface GameContext {
  entry: GameEntry;
  stage: Stage;
  hud: HUD;
  store: Store;
  player: Player;
  returnPersonal: () => void;
}
export interface Model {
  mode: string;
  act: (input: unknown) => boolean;
  step: (dt: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  snapshot: () => object;
  planning: () => PlanningState | null;
}
export interface RunOptions {
  model: Model;
  render: (dt: number) => void;
  refresh: () => void;
  persist?: () => void;
  keys?: (key: string, repeat: boolean) => unknown;
  swipe?: boolean;
  pick?: (x: number, y: number) => unknown;
  continuous?: boolean;
  active?: () => boolean;
  timer?: boolean;
  start?: () => void;
  clearInput?: () => void;
  dispose?: () => void;
  inspect?: () => object;
  rejected?: (input: unknown) => void;
  preset?: Preset;
}
declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}
export class GameLoop {
  private frame = 0;
  private last = 0;
  constructor(private update: (dt: number) => void, private render: (dt: number) => void, private active = () => true) { }
  private tick = (now: number) => { this.frame = 0; const dt = Math.min(.05, this.last ? (now - this.last) / 1000 : 1 / 60); this.last = now; this.update(dt); this.render(dt); if (this.active())
    this.frame = requestAnimationFrame(this.tick);
  else
    this.last = 0; };
  start() { if (!this.frame)
    this.frame = requestAnimationFrame(this.tick); }
  stop() { cancelAnimationFrame(this.frame); this.frame = 0; this.last = 0; }
  advance(ms: number) { this.stop(); for (let left = Math.max(0, ms) / 1000; left > 0;) {
    const dt = Math.min(1 / 120, left);
    this.update(dt);
    left -= dt;
  } this.render(ms / 1000); }
}
export function mountRun(context: GameContext, options: RunOptions) {
  const { stage, hud, player, entry } = context, { model } = options;
  let frame = 0, last = 0, disposed = false, runtimeTime = 0;
  let resultControls = () => { }, renderedMode = model.mode;
  const finished = () => ['won', 'over'].includes(model.mode);
  const waitingForModel = () => player.type === 'ai' && ['loading', 'error'].includes(getAIModelState().status);
  const persist = () => options.persist?.();
  const visualTime = (dt: number) => model.mode === 'paused' || hud.helpOpen || waitingForModel() ? 0 : dt;
  const draw = (dt = 0) => { const elapsed = visualTime(dt); options.render(elapsed); options.refresh();
    if (model.mode === 'paused' && player.type === 'human' && !options.continuous)
      hud.panel('Paused', '', [{ label: 'Resume', press: () => player.resume() }]);
    resultControls(); hud.enforceGraphics(); stage.advance(elapsed); stage.render(); };
  const active = () => !document.hidden && !hud.helpOpen && model.mode !== 'paused' && ((!waitingForModel() && ((options.continuous && model.mode === 'playing') || options.active?.())) || !waitingForModel() && stage.animating);
  const tick = (dt: number) => { if (!waitingForModel()) runtimeTime += dt; if (!waitingForModel() && !options.timer && !hud.helpOpen && model.mode !== 'paused')
    model.step(dt); draw(dt); };
  const animate = (now: number) => { frame = 0; if (disposed)
    return; const dt = Math.min(.05, last ? (now - last) / 1000 : 1 / 60); last = now; tick(dt); if (active())
    frame = requestAnimationFrame(animate);
  else
    last = 0; };
  const wake = () => { if (disposed)
    return; draw(); if (active() && !frame)
    frame = requestAnimationFrame(animate); };
  const apply = (input: unknown) => { if (hud.helpOpen || !stage.available)
    return false; const accepted = model.act(input); if (accepted) {
    persist();
    wake();
  } else if (player.type === 'human' && model.mode === 'playing' && options.rejected) {
    options.rejected(input);
    wake();
  } return accepted; };
  const key = () => { const state = model.planning(); return state ? planningSignature(state) + (options.continuous ? ':' + Math.floor(runtimeTime * 7) : '') : ''; };
  const port = player.connect<unknown>({ game: entry.id, planning: () => model.planning(), observe: () => model.planning() ? { key: key(), context: entry.name + '. Use the visible state and normal controls.', question: 'Which normal input advances the game?', choices: { wait: 'Wait' }, inputs: { wait: 'wait' } } : null,
    isCurrent: (value) => value === key(), apply, clearInput: options.clearInput,
    start: () => { if (!stage.available)
      return; if (finished())
      model.reset(); model.resume(); options.start?.(); wake(); },
    pause: () => { model.pause(); options.clearInput?.(); persist(); wake(); }, resume: () => { if (!stage.available)
      return; model.resume(); wake(); }, isFinished: finished, isPaused: () => model.mode === 'paused' });
  let menuPaused = false;
  hud.onMenuChange = open => {
    if (disposed) return;
    if (open && model.mode === 'playing' && (options.continuous || player.type === 'ai')) {
      menuPaused = true;
      player.pause();
    } else if (!open && menuPaused) {
      menuPaused = false;
      if (model.mode === 'paused') player.resume();
    }
  };
  const unbind = bindInput(hud.element, (key, repeat) => stage.available ? options.keys?.(key, repeat) : undefined, input => { port.human(input); }, options.pick ?? ((x, y) => stage.pick(x, y)), options.swipe);
  const mode = entry.id === 'pushball' ? null : hud.button('mode', 'Watch TAMEV', 'ai', () => { if (hud.helpOpen)
    return; if (player.type === 'ai')
    player.takeOver();
  else {
    persist();
    player.watchAI();
  } });
  const personal = entry.id === 'pushball' ? null : hud.button('personal', 'Your run', 'human', context.returnPersonal);
  const pause = entry.id === 'pushball' ? null : hud.button('ai-pause', 'Pause', 'pause', () => { if (player.status === 'paused' || model.mode === 'paused')
    player.resume();
  else
    player.pause(); });
  const retry = entry.id === 'pushball' ? null : hud.button('ai-retry', 'Retry AI', 'restart', () => player.retry());
  // A watched run keeps going: the AI bar offers the next round under the same controller.
  const nextRound = NEXT_ROUND[entry.id] ?? { label: 'Next run', input: 'restart' };
  let nextButton: HTMLButtonElement | null = null;
  const nextFor = () => nextButton ??= hud.button('ai-next', nextRound.label, 'next', () => {
    if (hud.helpOpen || player.type !== 'ai')
      return;
    model.act(nextRound.input);
    persist();
    player.start();
  });
  const syncAiBar = () => {
    hud.aiBar(player.type === 'ai');
    if (player.type !== 'ai')
      return;
    const controls = finished()
      ? [nextFor(), personal].filter((button): button is HTMLButtonElement => !!button && !button.hidden)
      : pause && !pause.hidden ? [pause] : [];
    hud.aiActions(controls);
  };
  resultControls = () => {
    if (renderedMode !== model.mode) { renderedMode = model.mode; syncControls(); }
    syncAiBar();
  };
  function syncControls() {
    if (mode) {
      hud.primary(mode, true);
      hud.label(mode, player.type === 'ai' ? 'Take over' : 'Watch', player.type === 'ai' ? 'Take over' : 'Watch TAMEV');
      mode.setAttribute('aria-pressed', String(player.type === 'ai'));
    }
    if (personal) {
      personal.hidden = !player.hasUsedAI || player.type === 'ai' && !finished();
      if (!finished() || player.type !== 'ai') hud.primary(personal, false);
    }
    if (pause) {
      pause.hidden = finished() || player.type !== 'ai' && !!options.continuous;
      hud.primary(pause, false);
      hud.label(pause, player.status === 'paused' ? 'Resume' : 'Pause');
    }
    if (retry)
      retry.hidden = player.type !== 'ai' || !player.error || finished();
    if (nextButton)
      nextButton.hidden = !finished();
    hud.element.dataset.player = player.type;
    hud.element.dataset.playerStatus = player.status;
    const state = getAIModelState();
    hud.controllerNotice(player.type === 'ai' ? (player.error || (state.status === 'loading' ? 'Loading TAMEV…' : '')) : '');
    syncAiBar();
  }
  function syncPlayer() { syncControls(); wake(); }
  const off = player.subscribe(syncPlayer), offModel = subscribeAIModel(syncPlayer);
  const pauseHidden = () => { if (document.hidden && model.mode === 'playing') {
    player.pause();
    options.clearInput?.();
  } };
  const lost = () => { if (model.mode === 'playing')
    player.pause(); };
  document.addEventListener('visibilitychange', pauseHidden);
  window.addEventListener('pagehide', persist);
  hud.element.addEventListener('stage-lost', lost);
  hud.onChange = wake;
  window.render_game_to_text = () => JSON.stringify({ ...model.snapshot(), coordinates: 'Board origin top-left; x right, y down. Scene picks use screen CSS pixels.', ...stage.inspect(), player: player.diagnostics(), ai: getLocalDecisionDiagnostics(), ...options.inspect?.() });
  window.advanceTime = (ms: number) => { if (frame)
    cancelAnimationFrame(frame); frame = 0; for (let remaining = Math.max(0, ms) / 1000; remaining > 0;) {
    const dt = Math.min(1 / 120, remaining);
    if (!waitingForModel()) runtimeTime += dt;
    if (!waitingForModel() && !hud.helpOpen && model.mode !== 'paused')
      model.step(dt);
    const elapsed = visualTime(dt);
    options.render(elapsed);
    options.refresh();
    stage.advance(elapsed);
    remaining -= dt;
  } draw(); last = 0; };
  const timer = options.timer ? window.setInterval(() => { if (!waitingForModel() && !document.hidden && !hud.helpOpen && model.mode === 'playing') {
    model.step(1);
    options.refresh();
  } }, 1000) : 0;
  syncPlayer();
  persist();
  wake();
  return () => { disposed = true; if (frame)
    cancelAnimationFrame(frame); window.clearInterval(timer); persist(); unbind(); off(); offModel(); port.dispose(); options.dispose?.(); document.removeEventListener('visibilitychange', pauseHidden); window.removeEventListener('pagehide', persist); hud.element.removeEventListener('stage-lost', lost); delete window.render_game_to_text; delete window.advanceTime; };
}
