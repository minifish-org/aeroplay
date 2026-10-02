import { getLayaGame, isLayaControlling, setLayaControlling } from './laya-bridge';
import { checkLayaConnection, getLayaConnection, requestLayaMove, subscribeLaya } from './laya';
import { createLayaSettingsButton, openLayaSettings } from './laya-settings';
import type { PlayProfile } from './storage';

export function mountLayaControls(root: HTMLElement, profile: PlayProfile, replaceRun: (profile: PlayProfile) => void) {
  const element = root.querySelector<HTMLElement>('.game-shell');
  const bridge = getLayaGame();
  if (!element || !bridge) return { dispose: () => {}, startWatching: () => {} };
  const shell = element;
  const game = bridge;
  const area = shell.querySelector<HTMLElement>('.game-area')!;
  const settings = createLayaSettingsButton();
  shell.querySelector('.game-bar')!.append(settings.button);
  const bar = document.createElement('div');
  bar.className = 'laya-mode-bar';
  bar.innerHTML = '<div class="laya-mode-picker" role="group" aria-label="Player"><button type="button" class="laya-human" aria-pressed="true">Play yourself</button><button type="button" class="laya-watch" aria-pressed="false">Watch Laya</button></div><span class="laya-availability"></span>';
  const panel = document.createElement('div');
  panel.className = 'laya-session';
  panel.innerHTML = '<div class="laya-session-copy" role="status" aria-live="polite"><strong></strong><span></span></div><div class="laya-session-actions"><button type="button" class="touch-btn laya-pause">Pause</button><button type="button" class="touch-btn laya-retry">Retry Laya</button><button type="button" class="touch-btn laya-takeover">Take over →</button><button type="button" class="touch-btn laya-again">Watch again</button></div>';
  shell.insertBefore(bar, area);
  shell.append(panel);
  const human = bar.querySelector<HTMLButtonElement>('.laya-human')!;
  const watch = bar.querySelector<HTMLButtonElement>('.laya-watch')!;
  const availability = bar.querySelector<HTMLSpanElement>('.laya-availability')!;
  const title = panel.querySelector('strong')!;
  const copy = panel.querySelector('.laya-session-copy span')!;
  const pause = panel.querySelector<HTMLButtonElement>('.laya-pause')!;
  const retry = panel.querySelector<HTMLButtonElement>('.laya-retry')!;
  const takeover = panel.querySelector<HTMLButtonElement>('.laya-takeover')!;
  const again = panel.querySelector<HTMLButtonElement>('.laya-again')!;
  let player: 'human' | 'laya' = 'human';
  let status: 'idle' | 'playing' | 'paused' | 'disconnected' | 'finished' = 'idle';
  let reason = '';
  let disposed = false;
  let lastKey = '';
  let pending: AbortController | null = null;
  let generation = 0;
  let decisions = 0;
  let nextDecision = 0;

  const available = () => {
    const state = getLayaConnection();
    return state.state === 'ready' && state.games.includes(game.game);
  };
  function abort() { ++generation; pending?.abort(); pending = null; }
  function update() {
    const connection = getLayaConnection();
    human.setAttribute('aria-pressed', String(player === 'human'));
    watch.setAttribute('aria-pressed', String(player === 'laya'));
    watch.disabled = !available();
    availability.textContent = connection.state === 'ready' && !available() ? 'Laya does not support this game yet.' : connection.message;
    area.inert = player === 'laya';
    shell.dataset.player = player;
    shell.dataset.layaStatus = status;
    shell.dataset.layaDecisions = String(decisions);
    panel.hidden = player === 'human' && profile === 'human';
    pause.hidden = player !== 'laya' || status === 'disconnected' || status === 'finished';
    pause.textContent = status === 'paused' ? 'Resume' : 'Pause';
    retry.hidden = player !== 'laya' || status !== 'disconnected';
    takeover.hidden = player !== 'laya';
    again.hidden = player !== 'laya' || status !== 'finished';
    title.textContent = player === 'human' ? 'You have the controls.' : status === 'disconnected' ? 'Laya is paused.' : status === 'finished' ? 'This round has finished.' : status === 'paused' ? 'Laya is taking a break.' : 'Laya has the controls.';
    copy.textContent = player === 'human' ? 'This assisted run stays separate from your personal records.' : status === 'disconnected' ? `${reason} Take over to keep playing.` : status === 'finished' ? 'Watch another round or play yourself.' : status === 'paused' ? 'Resume when you’re ready, or take over.' : game.assistance ? `${game.assistance} · You can take over at any time.` : 'Sit back. You can take over at any time.';
  }
  function disconnect(message: string) {
    if (disposed || player !== 'laya' || status === 'finished') return;
    abort();
    game.pause();
    status = 'disconnected'; reason = message;
    update();
  }
  function startWatching() {
    if (disposed || !available()) return;
    abort();
    player = 'laya'; status = 'playing'; reason = ''; lastKey = ''; nextDecision = 0;
    setLayaControlling(true);
    game.start();
    update();
    void tick();
  }
  async function tick() {
    if (disposed || player !== 'laya' || status !== 'playing' || pending || document.hidden) return;
    if (game.isFinished()) { abort(); status = 'finished'; update(); return; }
    if (game.isPaused()) { abort(); status = 'paused'; update(); return; }
    if (!available()) { disconnect('Laya lost its connection.'); return; }
    if (performance.now() < nextDecision) return;
    const observation = game.observe();
    if (!observation || observation.key === lastKey) return;
    const controller = new AbortController();
    const version = generation;
    pending = controller;
    try {
      const choice = await requestLayaMove(game.game, observation, controller.signal);
      if (disposed || controller.signal.aborted || version !== generation || status !== 'playing') return;
      if (game.act(choice, observation.key)) {
        lastKey = observation.key;
        ++decisions;
        shell.dataset.layaDecisions = String(decisions);
      }
      nextDecision = performance.now() + (game.intervalMs ?? 400);
    } catch (error) {
      if (disposed || controller.signal.aborted || version !== generation) return;
      disconnect(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Laya lost its connection.');
    } finally {
      if (pending === controller) pending = null;
    }
  }
  human.addEventListener('click', () => { if (player !== 'human' || profile === 'laya') replaceRun('human'); });
  watch.addEventListener('click', () => { if (player !== 'laya') replaceRun('laya'); });
  pause.addEventListener('click', () => {
    abort();
    if (status === 'paused') { lastKey = ''; nextDecision = 0; game.resume(); status = 'playing'; }
    else { game.pause(); status = 'paused'; }
    update();
  });
  takeover.addEventListener('click', () => {
    abort(); player = 'human'; status = 'idle'; setLayaControlling(false);
    game.resume(); update();
  });
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    const connected = await checkLayaConnection();
    retry.disabled = false;
    if (disposed || player !== 'laya' || !connected || !available()) return;
    game.resume(); status = 'playing'; reason = ''; lastKey = ''; nextDecision = 0;
    update();
  });
  again.addEventListener('click', () => replaceRun('laya'));
  const connectionOff = subscribeLaya(() => {
    const state = getLayaConnection().state;
    if (player === 'laya' && (state === 'offline' || state === 'unavailable' || state === 'unconfigured')) disconnect('Laya lost its connection.');
    else update();
  });
  const key = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && event.target.closest('dialog,input,textarea,select')) return;
    if (isLayaControlling() && [' ', 'Enter'].includes(event.key) && event.target instanceof HTMLElement && event.target.closest('.game-bar button,.laya-mode-bar button,.laya-session button')) {
      event.stopImmediatePropagation();
      return;
    }
    if (isLayaControlling() && (event.key.startsWith('Arrow') || [' ', 'Enter', 'p', 'P', 'c', 'C', 'z', 'Z', 'n', 'N', 'a', 'd', 'w', 's'].includes(event.key) || /^[1-9]$/.test(event.key))) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  };
  const visibility = () => {
    if (document.hidden && player === 'laya' && status === 'playing') { abort(); game.pause(); status = 'paused'; update(); }
  };
  window.addEventListener('keydown', key, true);
  document.addEventListener('visibilitychange', visibility);
  const timer = window.setInterval(() => { void tick(); }, 80);
  update();
  // An unconfigured service has no network activity until the player sets it up.
  availability.addEventListener('click', () => { if (getLayaConnection().state === 'unconfigured') openLayaSettings(); });
  return {
    startWatching,
    dispose() {
      disposed = true; abort(); window.clearInterval(timer);
      setLayaControlling(false); area.inert = false;
      connectionOff(); settings.dispose();
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('visibilitychange', visibility);
      bar.remove(); panel.remove(); settings.button.remove();
    }
  };
}
