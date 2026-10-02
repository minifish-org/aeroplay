import { configureLaya, getLayaAddress, getLayaConnection, probeLaya, subscribeLaya } from './laya';

let dialog: HTMLDialogElement | null = null;

export function openLayaSettings() {
  if (dialog?.open) return;
  const modal = document.createElement('dialog');
  dialog = modal;
  modal.className = 'laya-settings';
  modal.setAttribute('aria-label', 'Laya settings');
  modal.innerHTML = `
    <form method="dialog">
      <div class="laya-settings-heading"><div><h2>Laya settings</h2><p>One connection for all 10 games.</p></div><button class="laya-close" type="button" aria-label="Close Laya settings">×</button></div>
      <label class="laya-service-field">Service address<input type="url" placeholder="https://your-laya-service.example" autocomplete="off" spellcheck="false"></label>
      <p class="laya-settings-help">Set it once. All games share this connection. Leave it empty for offline play.</p>
      <div class="laya-settings-feedback" role="status" aria-live="polite"></div>
      <div class="laya-settings-actions"><button class="touch-btn laya-test" type="button">Test connection</button><button class="touch-btn laya-save" type="button">Save settings</button></div>
    </form>`;
  const input = modal.querySelector('input')!;
  const test = modal.querySelector<HTMLButtonElement>('.laya-test')!;
  const save = modal.querySelector<HTMLButtonElement>('.laya-save')!;
  const feedback = modal.querySelector<HTMLDivElement>('.laya-settings-feedback')!;
  input.value = getLayaAddress();
  feedback.textContent = getLayaConnection().message;
  let request: AbortController | null = null;
  const report = (text: string, error = false) => {
    feedback.textContent = text;
    feedback.classList.toggle('has-error', error);
    feedback.setAttribute('role', error ? 'alert' : 'status');
  };
  async function submit(testOnly: boolean) {
    request?.abort();
    const controller = new AbortController(); request = controller;
    test.disabled = save.disabled = true;
    report(testOnly ? 'Checking this connection…' : 'Saving settings…');
    try {
      if (testOnly) {
        const health = await probeLaya(input.value, controller.signal);
        if (request === controller && modal.open) report(`Connected · ${health.model}`);
      } else {
        await configureLaya(input.value);
        if (request === controller && modal.open) {
          input.value = getLayaAddress();
          const state = getLayaConnection();
          report(!input.value ? 'Saved. Play yourself anywhere, including offline.' : state.state === 'ready' ? 'Saved. Laya is ready for all supported games.' : `Saved. ${state.message}`, state.state === 'unavailable');
        }
      }
    } catch (error) {
      if (request === controller && modal.open) report(error instanceof Error ? error.message : 'Could not save the connection.', true);
    } finally {
      if (request === controller) { request = null; test.disabled = save.disabled = false; }
    }
  }
  test.addEventListener('click', () => { void submit(true); });
  save.addEventListener('click', () => { void submit(false); });
  modal.querySelector('.laya-close')!.addEventListener('click', () => modal.close());
  // Editing settings must not send keystrokes to the game underneath.
  modal.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Enter' && event.target === input) { event.preventDefault(); void submit(false); } });
  modal.addEventListener('close', () => { request?.abort(); modal.remove(); if (dialog === modal) dialog = null; }, { once: true });
  document.body.append(modal);
  modal.showModal();
}

export function createLayaSettingsButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'laya-settings-button';
  button.textContent = '⚙ Laya settings';
  button.addEventListener('click', openLayaSettings);
  const update = () => {
    const state = getLayaConnection();
    button.dataset.connection = state.state;
    button.setAttribute('aria-label', `Laya settings · ${state.message}`);
  };
  const unsubscribe = subscribeLaya(update);
  update();
  return { button, dispose: unsubscribe };
}
