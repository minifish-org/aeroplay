import { games } from './games/registry';
import { load, save, namespace } from './core/storage';

const app = document.querySelector<HTMLDivElement>('#app')!;

let teardown: (() => void) | null = null;
let navigationVersion = 0;

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.warn('SW register failed', err);
    });
  });
}

function renderHub() {
  navigationVersion++;
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
    <div class="hub-eyebrow">AEROPLAY ORIGINALS · NOW IN 3D</div>
    <h1 class="hub-heading">A bigger world.<br>In your pocket.</h1>
    <div class="hub-subtitle">Fly above the clouds. Deliver a little joy. Discover two new 3D adventures, alongside eight pocket classics.</div>
  `;
  const last = games.find((g) => g.id === load('last-game', 'sky')) ?? games[0];
  const artwork = document.createElement('img');
  artwork.src = '/assets/sky-rush.svg';
  artwork.alt = '';
  artwork.className = 'hero-art';
  hero.append(artwork);
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
  function record(id: string) {
    const store = namespace(id === '2048' ? 'game2048' : id);
    if (id === 'maze') return `Expedition ${store.load('level', 1)}`;
    if (id === 'lightsout')
      return `Puzzle ${store.load<{ level: number }>('state-v2', { level: 1 }).level}`;
    if (id === 'sudoku') return 'Take your time';
    if (id === 'cargo') {
      const stars = store.load<Record<string, number>>('stars', {});
      return `${Object.keys(stars).length}/12 islands delivered`;
    }
    const best = store.load<number>('best', 0);
    return best
      ? `Best ${best.toLocaleString()}`
      : games.find((g) => g.id === id)?.category === 'Arcade'
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
        (category !== 'All games' &&
          category !== '3D' &&
          category !== game.category) ||
        (category === '3D' && !game.dimension)
      )
        return;
      const card = document.createElement('button');
      card.className = 'hub-card';
      card.style.setProperty('--accent', game.accent);
      if (game.dimension) card.classList.add('featured-card');
      card.innerHTML = `
        ${game.dimension ? `<img class="card-art" src="/assets/${game.id === 'sky' ? 'sky-rush' : 'pocket-cargo'}.svg" alt="" />` : ''}
        <div class="hub-card-top"><div class="hub-card-icon">${game.icon}</div><span class="hub-card-index">${game.dimension ? 'NEW · 3D' : String(index + 1).padStart(2, '0')}</span></div>
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
  ['All games', '3D', 'Arcade', 'Puzzles'].forEach((category) => {
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

async function startGame(id: string) {
  const game = games.find((game) => game.id === id);
  if (!game) return;
  const version = ++navigationVersion;
  teardown?.();
  teardown = null;
  document.title = `${game.name} | AeroPlay`;
  history.replaceState(null, '', `#${id}`);
  app.innerHTML =
    '<div class="game-loading" role="status">Getting your game ready…</div>';
  try {
    const module = await game.load();
    if (version !== navigationVersion) return;
    save('last-game', id);
    teardown = module.default.mount(app, () => {
      location.hash = 'hub';
    });
  } catch (error) {
    if (version !== navigationVersion) return;
    app.innerHTML =
      '<div class="game-loading"><p>This game could not open. Please try again.</p><button class="touch-btn">Back to games</button></div>';
    app.querySelector('button')!.addEventListener('click', () => {
      location.hash = 'hub';
    });
    console.error('Game loading failed', error);
  }
}

function handleHash() {
  const hash = location.hash.replace('#', '');
  if (!hash || hash === 'hub') {
    renderHub();
    return;
  }
  const game = games.find((g) => g.id === hash);
  if (game) {
    void startGame(game.id);
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
