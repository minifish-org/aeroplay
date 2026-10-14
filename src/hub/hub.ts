import { games } from '../games/registry';
export function mountHub(root: HTMLElement) {
  root.innerHTML = '<main class="hub"><header><h1>AeroPlay</h1></header><div class="hub-grid"></div></main>';
  const grid = root.querySelector('.hub-grid')!;
  for(const game of games) {
    const card = document.createElement('button'); card.className = 'hub-card'; card.textContent = game.name;
    card.addEventListener('click', () => { location.hash = game.id; }); grid.append(card);
  }
}
