import { GameModule } from './games/gameTypes';
import snake from './games/snake';
import tetris from './games/tetris';
import game2048 from './games/game2048';
import flappy from './games/flappy';
import maze from './games/maze';
import match3 from './games/match3';
import sudoku from './games/sudoku';
import lightsOut from './games/lightsout';

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

if ('serviceWorker' in navigator) {
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

  const hero = document.createElement('div');
  hero.className = 'hub-hero';
  hero.innerHTML = `
    <div class="hub-heading">FlightMode Games</div>
    <div class="hub-subtitle">Offline-friendly mini games for iPhone flight mode.</div>
  `;

  const grid = document.createElement('div');
  grid.className = 'hub-grid';

  games.forEach((game) => {
    const card = document.createElement('button');
    card.className = 'hub-card';
    card.innerHTML = `
      <div class="hub-card-icon">${game.icon}</div>
      <div class="hub-card-title">${game.name}</div>
      <div class="hub-card-desc">${game.description}</div>
    `;
    card.addEventListener('click', () => startGame(game.id));
    card.addEventListener('touchend', (e) => {
      e.preventDefault();
      startGame(game.id);
    });
    grid.appendChild(card);
  });

  app.appendChild(hero);
  app.appendChild(grid);
}

function startGame(id: string) {
  const game = games.find((g) => g.id === id);
  if (!game) return;
  document.title = `${game.name} | AeroPlay`;
  history.replaceState(null, '', `#${id}`);
  teardown?.();
  teardown = game.mount(app, renderHub);
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
