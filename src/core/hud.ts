import { load, save } from './storage';
const paths: Record<string, string> = {
  back: 'M15 5 8 12l7 7M8 12h12', restart: 'M19 7v5h-5M19 12a7 7 0 1 0-2 5',
  undo: 'M9 5 3 10l6 5M3 10h11a6 6 0 0 1 0 12', hint: 'M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0l-1 3H9z',
  play: 'm8 5 11 7-11 7z', pause: 'M8 5v14M16 5v14', human: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M5 21v-3a7 7 0 0 1 14 0v3',
  ai: 'M7 7h10v11H7zM12 3v4M9 11h.1M15 11h.1M9 15h6M3 10v5M21 10v5',
  sound: 'm3 9 4 0 5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8', notes: 'm5 16 10-10 3 3-10 10-4 1z',
  next: 'm8 5 7 7-7 7M15 12H4M20 5v14', erase: 'm4 14 8-10 8 7-7 10H9zM9 21h12',
  left: 'm15 5-7 7 7 7', right: 'm9 5 7 7-7 7', up: 'm5 15 7-7 7 7', down: 'm5 9 7 7 7-7', boost: 'm13 2-8 12h6l-1 8 9-13h-6z', close: 'm6 6 12 12M18 6 6 18', more: 'M5 12h.01M12 12h.01M19 12h.01'
};
export function icon(name: string) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="' + (paths[name] ?? paths.play) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}
export class HUD {
  readonly element: HTMLElement;
  readonly playArea: HTMLElement;
  readonly inputs: HTMLElement;
  readonly actions: HTMLElement;
  private statsArea: HTMLElement;
  private status: HTMLElement;
  private panelArea: HTMLElement;
  private selectionArea: HTMLElement;
  private more: HTMLDetailsElement;
  private menu: HTMLElement;
  private fields = new Map<string, HTMLElement>();
  private lastPanel = '';
  private gameNotice = '';
  private playerNotice = '';
  private graphicsLost = false;
  private introNotice = '';
  private introTimer = 0;
  private disabledBeforeLoss = new Map<HTMLButtonElement | HTMLSelectElement, boolean>();
  helpOpen = false;
  onChange = () => { };
  onMenuChange = (_open: boolean) => { };
  private keyDown = (event: KeyboardEvent) => { this.dismissIntro(); if (event.key === 'Escape') this.more.open = false; };
  constructor(root: HTMLElement, name: string, back: () => void) {
    root.innerHTML = '<section class="game-stage"><div class="hud"><div class="hud-top"><div class="hud-nav"></div><div class="hud-stats"></div><div class="hud-actions"><details class="hud-more"><summary aria-label="More options" title="More options"></summary><div class="hud-menu"></div></details></div></div><div class="play-area"><div class="hud-notice" role="status" aria-live="polite" hidden></div><div id="game-selection" class="hud-selection" role="status" aria-live="polite" aria-atomic="true"></div></div><div class="hud-inputs"></div><div class="hud-panel" hidden></div></div></section>';
    this.element = root.querySelector('.game-stage')!;
    this.playArea = root.querySelector('.play-area')!;
    this.inputs = root.querySelector('.hud-inputs')!;
    this.actions = root.querySelector('.hud-actions')!;
    this.statsArea = root.querySelector('.hud-stats')!;
    this.status = root.querySelector('.hud-notice')!;
    this.panelArea = root.querySelector('.hud-panel')!;
    this.selectionArea = root.querySelector('.hud-selection')!;
    this.more = root.querySelector('.hud-more')!;
    this.menu = root.querySelector('.hud-menu')!;
    this.more.querySelector('summary')!.append(icon('more'));
    this.more.addEventListener('toggle', () => { this.onMenuChange(this.more.open); this.onChange(); });
    this.element.addEventListener('pointerdown', event => {
      if (this.more.open && !(event.target instanceof Element && event.target.closest('.hud-more'))) {
        this.more.open = false;
        event.stopPropagation();
      }
      this.dismissIntro();
    }, true);
    window.addEventListener('keydown', this.keyDown);
    const nav = root.querySelector('.hud-nav')!;
    const button = this.button('back', 'Back', 'back', back);
    nav.append(button);
    const title = document.createElement('h1');
    title.textContent = name;
    nav.append(title);
    const wide = innerWidth > innerHeight && Math.min(innerWidth, innerHeight) <= 700;
    this.element.dataset.wide = String(wide);
    this.element.addEventListener('stage-lost', () => this.graphics(false));
    this.element.addEventListener('stage-restored', () => this.graphics(true));
  }
  button(id: string, label: string, symbol: string, press: () => void, parent: HTMLElement = this.actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-button';
    button.dataset.action = id;
    button.dataset.symbol = symbol;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.append(icon(symbol));
    const text = document.createElement('span');
    text.textContent = label;
    button.append(text);
    button.addEventListener('click', event => { event.preventDefault(); if (this.graphicsLost && id !== 'back')
      return; const fromMenu = !!button.closest('.hud-menu'); press(); if (fromMenu) this.more.open = false; this.onChange(); });
    if (parent === this.actions && ['sound', 'restart', 'new', 'next', 'reset', 'mode', 'personal'].includes(id))
      this.menu.append(button);
    else if (parent === this.actions)
      parent.insertBefore(button, this.more);
    else parent.append(button);
    return button;
  }
  label(button: HTMLButtonElement, text: string, accessible = text) {
    button.querySelector('span')!.textContent = text;
    button.setAttribute('aria-label', accessible);
    button.title = accessible;
    const symbol = ({ Resume: 'play', Pause: 'pause', 'Take over': 'human', Watch: 'ai' } as Record<string, string>)[text];
    if (symbol && button.dataset.symbol !== symbol) { button.querySelector('svg')?.replaceWith(icon(symbol)); button.dataset.symbol = symbol; }
  }
  primary(button: HTMLButtonElement, primary: boolean) {
    const parent = primary ? this.actions : this.menu;
    if (button.parentElement !== parent) {
      if (primary) parent.insertBefore(button, this.more);
      else parent.append(button);
    }
  }
  resultControls(buttons: HTMLButtonElement[]) {
    const group = this.panelArea.querySelector('.panel-actions');
    if (!this.panelArea.hidden && group) for (const button of buttons) group.append(button);
  }
  stats(values: Record<string, string | number>) {
    for (const [key, field] of this.fields) field.hidden = !(key in values);
    for (const [key, value] of Object.entries(values)) {
      let field = this.fields.get(key);
      if (!field) {
        field = document.createElement('span');
        field.className = 'hud-stat';
        field.innerHTML = '<small></small><strong></strong>';
        field.querySelector('small')!.textContent = key;
        this.statsArea.append(field);
        this.fields.set(key, field);
      }
      field.hidden = false;
      const text = String(value);
      if (field.querySelector('strong')!.textContent !== text)
        field.querySelector('strong')!.textContent = text;
    }
  }
  notice(text: string) { this.gameNotice = text; this.showNotice(); }
  controllerNotice(text: string) { this.playerNotice = text; this.showNotice(); }
  private showNotice() { const text = this.graphicsLost ? 'Graphics interrupted · Waiting for recovery.' : this.playerNotice || this.gameNotice || this.introNotice; if (this.status.textContent !== text)
    this.status.textContent = text; this.status.hidden = !text; }
  selection(text: string) { if (this.selectionArea.textContent !== text)
    this.selectionArea.textContent = text; }
  private graphics(available: boolean) {
    this.graphicsLost = !available;
    if (available) {
      this.disabledBeforeLoss.forEach((disabled, control) => { control.disabled = disabled; });
      this.disabledBeforeLoss.clear();
    }
    this.enforceGraphics();
    this.showNotice();
    this.onChange();
  }
  enforceGraphics() {
    if (!this.graphicsLost)
      return;
    this.element.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select').forEach(control => {
      if (control.dataset.action === 'back')
        return;
      if (!this.disabledBeforeLoss.has(control))
        this.disabledBeforeLoss.set(control, control.disabled);
      control.disabled = true;
    });
  }
  bank(kind: string, width = 190) {
    const bank = document.createElement('div');
    bank.className = 'input-bank';
    bank.dataset.bank = kind;
    this.inputs.append(bank);
    this.element.classList.add('has-inputs');
    this.element.style.setProperty('--input-width', width + 'px');
    return bank;
  }
  panel(title: string, detail = '', actions: {
    label: string;
    symbol?: string;
    press: () => void;
  }[] = []) {
    if (this.helpOpen)
      return;
    if (this.more.open) { this.lastPanel = ''; this.panelArea.hidden = true; return; }
    const key = JSON.stringify([title, detail, actions.map(action => action.label)]);
    if (key === this.lastPanel)
      return;
    this.lastPanel = key;
    this.panelArea.replaceChildren();
    this.panelArea.hidden = !title;
    if (!title)
      return;
    const heading = document.createElement('h2');
    heading.textContent = title;
    this.panelArea.append(heading);
    if (detail) {
      const copy = document.createElement('p');
      copy.textContent = detail;
      this.panelArea.append(copy);
    }
    const group = document.createElement('div');
    group.className = 'panel-actions';
    this.panelArea.append(group);
    actions.forEach((action, index) => this.button('panel-' + index, action.label, action.symbol ?? 'play', action.press, group));
  }
  intro(id: string, copy: string) {
    if (load('help-seen', false, id))
      return;
    save('help-seen', true, id);
    this.introNotice = copy;
    this.showNotice();
    window.clearTimeout(this.introTimer);
    this.introTimer = window.setTimeout(() => this.dismissIntro(), 5000);
  }
  private dismissIntro() { if (!this.introNotice) return; this.introNotice = ''; window.clearTimeout(this.introTimer); this.showNotice(); }
  dispose() { window.clearTimeout(this.introTimer); window.removeEventListener('keydown', this.keyDown); this.onMenuChange = () => { }; }
}
