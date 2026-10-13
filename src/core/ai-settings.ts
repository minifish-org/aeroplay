import { getAIModelState, prepareTamev, subscribeAIModel } from './ai-model';

export function createAISettingsButton() {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'player-settings-button';
  button.textContent = '⚙ AI player';
  const dialog = document.createElement('dialog');
  dialog.className = 'player-settings-dialog';
  dialog.innerHTML = '<div class="player-settings-head"><h2>AI player</h2><button type="button" class="player-close" aria-label="Close">×</button></div><p>TAMEV chooses plans calculated on this device from visible state. Plans use the same controls, rules and speed as you, completely offline.</p><p class="ai-model-status" role="status" aria-live="polite"></p><div class="player-settings-actions"><button type="button" class="touch-btn ai-load">Load TAMEV</button></div>';
  document.body.append(dialog);
  const load = dialog.querySelector<HTMLButtonElement>('.ai-load')!;
  function update() {
    const state = getAIModelState();
    button.dataset.connection = state.status;
    dialog.querySelector('.ai-model-status')!.textContent = state.message;
    load.disabled = state.status === 'loading' || state.status === 'ready';
    load.textContent = state.status === 'ready' ? 'Ready on this device' : state.status === 'loading' ? 'Loading…' : 'Load TAMEV';
  }
  button.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('.player-close')!.addEventListener('click', () => dialog.close());
  load.addEventListener('click', () => { void prepareTamev().catch(() => {}); });
  const off = subscribeAIModel(update); update();
  return { button, dispose() { off(); dialog.remove(); } };
}
