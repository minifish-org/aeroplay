import { Player } from './player';
import type { PlayProfile } from './storage';
import { createAISettingsButton } from './ai-settings';

export function mountPlayerControls(root: HTMLElement, player: Player, replaceRun: (profile: PlayProfile) => void) {
  const element = root.querySelector<HTMLElement>('.game-shell');
  if (!element) return { dispose() {} };
  const shell = element;
  const area = shell.querySelector<HTMLElement>('.game-area')!;
  const settings = createAISettingsButton();
  shell.querySelector('.game-bar')!.append(settings.button);
  const bar = document.createElement('div');
  bar.className = 'player-mode-bar';
  bar.innerHTML = '<div class="player-mode-picker" role="group" aria-label="Player"><button type="button" class="player-human">Play yourself</button><button type="button" class="player-watch">Watch TAMEV</button></div><span class="player-availability"></span>';
  const panel = document.createElement('div');
  panel.className = 'player-session';
  panel.innerHTML = '<div class="player-session-copy" role="status" aria-live="polite"><strong></strong><span></span></div><div class="player-session-actions"><button type="button" class="touch-btn player-pause">Pause</button><button type="button" class="touch-btn player-retry">Retry AI</button><button type="button" class="touch-btn player-takeover">Take over →</button><button type="button" class="touch-btn player-again">Watch again</button></div>';
  shell.insertBefore(bar, area); shell.append(panel);
  const human = bar.querySelector<HTMLButtonElement>('.player-human')!;
  const watch = bar.querySelector<HTMLButtonElement>('.player-watch')!;
  const availability = bar.querySelector<HTMLElement>('.player-availability')!;
  const pause = panel.querySelector<HTMLButtonElement>('.player-pause')!;
  const retry = panel.querySelector<HTMLButtonElement>('.player-retry')!;
  const takeover = panel.querySelector<HTMLButtonElement>('.player-takeover')!;
  const again = panel.querySelector<HTMLButtonElement>('.player-again')!;
  function update() {
    const ai = player.type === 'ai';
    shell.dataset.player = player.type;
    shell.dataset.playerStatus = player.status;
    shell.dataset.playerDecisions = String(player.decisions);
    shell.dataset.playerDiscarded = String(player.discarded);
    area.inert = ai;
    human.setAttribute('aria-pressed', String(!ai)); watch.setAttribute('aria-pressed', String(ai));
    availability.textContent = ai ? 'TAMEV + Planning · Offline · Same rules and speed' : 'Human player';
    panel.hidden = !ai && !player.hasUsedAI;
    pause.hidden = !ai || player.status === 'finished';
    pause.textContent = player.status === 'paused' ? 'Resume' : 'Pause';
    retry.hidden = !ai || !player.error || player.status === 'finished';
    takeover.hidden = !ai; again.hidden = !ai || player.status !== 'finished';
    panel.querySelector('strong')!.textContent = !ai ? 'You have the controls.' : player.status === 'finished' ? 'This round has finished.' : player.status === 'paused' ? 'Game paused.' : 'TAMEV has the controls.';
    panel.querySelector('.player-session-copy span')!.textContent = !ai ? 'This AI run stays separate from your personal records.' : player.error ? `${player.error} The game keeps running. You can take over.` : 'AI plans ahead from visible state and uses one normal control at a time. You can take over.';
  }
  human.addEventListener('click', () => { if (player.type !== 'human' || player.hasUsedAI) replaceRun('human'); });
  watch.addEventListener('click', () => { if (player.type !== 'ai') player.watchAI(); });
  pause.addEventListener('click', () => player.status === 'paused' ? player.resume() : player.pause());
  retry.addEventListener('click', () => player.retry());
  takeover.addEventListener('click', () => player.takeOver());
  again.addEventListener('click', () => replaceRun('ai'));
  const off = player.subscribe(update);
  const key = (event: KeyboardEvent) => {
    if (player.type !== 'ai' || (event.target instanceof HTMLElement && event.target.closest('dialog,input,textarea,select'))) return;
    if (event.target instanceof HTMLElement && event.target.closest('.game-bar button,.player-mode-bar button,.player-session button') && [' ', 'Enter'].includes(event.key)) { event.stopImmediatePropagation(); return; }
    if (event.key.startsWith('Arrow') || [' ', 'Enter', 'p', 'P', 'c', 'C', 'z', 'Z', 'n', 'N', 'a', 'd', 'w', 's'].includes(event.key) || /^[1-9]$/.test(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  window.addEventListener('keydown', key, true);
  update();
  return { dispose() { off(); settings.dispose(); window.removeEventListener('keydown', key, true); area.inert = false; bar.remove(); panel.remove(); settings.button.remove(); } };
}
