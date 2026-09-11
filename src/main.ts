import { GameModule } from './games/gameTypes';
import snake from './games/snake';
import tetris from './games/tetris';
import game2048 from './games/game2048';
import flappy from './games/flappy';
import maze from './games/maze';
import match3 from './games/match3';
import sudoku from './games/sudoku';
import lightsOut from './games/lightsout';
import { load, save, namespace } from './core/storage';

const games: GameModule[] = [
  snake,
  tetris,
  game2048,
  flappy,
  maze,
  match3,
  sudoku,
  lightsOut
];

const app = document.querySelector<HTMLDivElement>('#app')!;

let teardown: (() => void) | null = null;

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.warn('SW register failed', err);
    });
  });
}

function renderHub() {
  teardown?.();
  teardown = null;
  document.title = 'AeroPlay Hub';
  history.replaceState(null, '', '#hub');
  app.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'hub-topline';
  top.innerHTML =
    '<div class="hub-brand">aero<span>play</span> ↗</div><div class="offline-badge">Your pocket arcade</div>';
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.ready.then(() => {
      const badge = top.querySelector('.offline-badge');
      if (badge) badge.textContent = '● Offline ready';
    });
  }
  const hero = document.createElement('div');
  hero.className = 'hub-hero';
  hero.innerHTML = `
    <div class="hub-eyebrow">A little escape, wherever you are</div>
    <h1 class="hub-heading">Less scrolling.<br>More playing.</h1>
    <div class="hub-subtitle">Eight little worlds to get lost in. Chase a record, solve a puzzle, or just enjoy the journey.</div>
  `;
  const last = games.find((g) => g.id === load('last-game', 'snake')) ?? snake;
  const resume = document.createElement('button');
  resume.className = 'hub-play';
  resume.textContent = `Play ${last.name} ↗`;
  resume.addEventListener('click', () => {
    location.hash = last.id;
  });
  hero.append(resume);
  const section = document.createElement('div');
  section.className = 'hub-section';
  section.innerHTML = '<h2>Find your next favorite</h2>';
  const filters = document.createElement('div');
  filters.className = 'hub-filters';
  filters.setAttribute('aria-label', 'Game categories');
  section.append(filters);
  const grid = document.createElement('div');
  grid.className = 'hub-grid';
  const arcade = ['snake', 'tetris', 'flappy'];
  const accents = [
    '#a9dfba',
    '#c2b1ef',
    '#a4d6e5',
    '#f2d495',
    '#a4d8bf',
    '#d4b4ed',
    '#adcaeb',
    '#ecd196'
  ];
  function record(id: string) {
    const store = namespace(id === '2048' ? 'game2048' : id);
    if (id === 'maze') return `Expedition ${store.load('level', 1)}`;
    if (id === 'lightsout')
      return `Puzzle ${store.load<{ level: number }>('state-v2', { level: 1 }).level}`;
    if (id === 'sudoku') return 'Take your time';
    const best = store.load<number>('best', 0);
    return best
      ? `Best ${best.toLocaleString()}`
      : arcade.includes(id)
        ? 'Chase a high score'
        : 'Make your first move';
  }
  function show(category: string) {
    filters
      .querySelectorAll('button')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.textContent === category))
      );
    grid.innerHTML = '';
    games.forEach((game, index) => {
      if (
        (category === 'Arcade' && !arcade.includes(game.id)) ||
        (category === 'Puzzles' && arcade.includes(game.id))
      )
        return;
      const card = document.createElement('button');
      card.className = 'hub-card';
      card.style.setProperty('--accent', accents[index]);
      card.innerHTML = `
        <div class="hub-card-top"><div class="hub-card-icon">${game.icon}</div><span class="hub-card-index">0${index + 1}</span></div>
        <div class="hub-card-title">${game.name}</div>
        <div class="hub-card-desc">${game.description}</div>
        <div class="hub-card-foot"><span>${record(game.id)}</span><span aria-hidden="true">↗</span></div>
      `;
      card.addEventListener('click', () => {
        location.hash = game.id;
      });
      grid.appendChild(card);
    });
  }
  ['All games', 'Arcade', 'Puzzles'].forEach((category) => {
    const button = document.createElement('button');
    button.className = 'hub-filter';
    button.textContent = category;
    button.addEventListener('click', () => show(category));
    filters.append(button);
  });
  const footer = document.createElement('div');
  footer.className = 'hub-footer';
  footer.textContent =
    'No ads. No accounts. Just one more round. · Progress stays on this device.';
  app.append(top, hero, section, grid, footer);
  show('All games');
}

function startGame(id: string) {
  const game = games.find((g) => g.id === id);
  if (!game) return;
  document.title = `${game.name} | AeroPlay`;
  history.replaceState(null, '', `#${id}`);
  teardown?.();
  save('last-game', id);
  teardown = game.mount(app, () => {
    location.hash = 'hub';
  });
}

function handleHash() {
  const hash = location.hash.replace('#', '');
  if (!hash || hash === 'hub') {
    renderHub();
    return;
  }
  const game = games.find((g) => g.id === hash);
  if (game) {
    startGame(game.id);
  } else {
    renderHub();
  }
}

window.addEventListener('hashchange', handleHash);
handleHash();

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() !== 'f' || event.repeat) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else if (document.documentElement.requestFullscreen)
    void document.documentElement.requestFullscreen().catch(() => {});
});
