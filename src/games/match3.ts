import { GameModule } from './gameTypes';
import { createGameShell } from '../core/ui';
import { namespace } from '../core/storage';

type Cell = number;

const SIZE = 8;
const COLORS = ['#f97316', '#38bdf8', '#a855f7', '#22c55e', '#f59e0b'];
const storage = namespace('match3');

const match3: GameModule = {
  id: 'match3',
  name: 'Match-3',
  description: 'Swap tiles to clear matches and rack up points.',
  icon: '💎',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Match-3', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const scoreEl = document.createElement('div');
    const bestEl = document.createElement('div');
    const tipEl = document.createElement('div');
    tipEl.textContent = 'Tap two neighbors to swap.';
    info.append(scoreEl, bestEl, tipEl);
    area.appendChild(info);

    const boardEl = document.createElement('div');
    boardEl.className = 'match3-board';
    area.appendChild(boardEl);

    let grid = createBoard();
    let score = 0;
    let best = storage.load('best', 0);
    let selected: { x: number; y: number } | null = null;

    const updateUI = () => {
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;
    };

    const render = () => {
      boardEl.innerHTML = '';
      grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          const tile = document.createElement('button');
          tile.className = 'match3-cell';
          tile.style.backgroundColor = COLORS[cell];
          tile.dataset.x = String(x);
          tile.dataset.y = String(y);
          tile.classList.toggle('selected', selected?.x === x && selected?.y === y);
          tile.addEventListener('click', onSelect);
          tile.addEventListener('touchend', onSelect);
          boardEl.appendChild(tile);
        });
      });
      updateUI();
    };

    const onSelect = (e: Event) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      const x = Number(target.dataset.x);
      const y = Number(target.dataset.y);
      if (!selected) {
        selected = { x, y };
      } else {
        if (isNeighbor(selected, { x, y })) {
          attemptSwap(selected, { x, y });
          selected = null;
        } else {
          selected = { x, y };
        }
      }
      render();
    };

    const attemptSwap = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      swap(grid, a, b);
      const cleared = resolveBoard(grid);
      if (!cleared) {
        swap(grid, a, b);
      } else {
        score += cleared;
        best = Math.max(best, score);
        storage.save('best', best);
      }
    };

    // ensure starting board has a move
    ensureResolvable(grid);
    resolveBoard(grid);
    render();

    return () => {};
  }
};

function createBoard(): Cell[][] {
  return Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => Math.floor(Math.random() * COLORS.length))
  );
}

function isNeighbor(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy === 1;
}

function swap(grid: Cell[][], a: { x: number; y: number }, b: { x: number; y: number }) {
  const tmp = grid[a.y][a.x];
  grid[a.y][a.x] = grid[b.y][b.x];
  grid[b.y][b.x] = tmp;
}

function resolveBoard(grid: Cell[][]): number {
  let totalCleared = 0;
  while (true) {
    const matches = findMatches(grid);
    if (!matches.length) break;
    matches.forEach(({ x, y }) => {
      grid[y][x] = -1;
    });
    totalCleared += matches.length * 10;
    applyGravity(grid);
  }
  return totalCleared;
}

function findMatches(grid: Cell[][]): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  // rows
  for (let y = 0; y < SIZE; y++) {
    let run = 1;
    for (let x = 1; x <= SIZE; x++) {
      if (x < SIZE && grid[y][x] === grid[y][x - 1]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) found.push({ x: x - 1 - k, y });
        }
        run = 1;
      }
    }
  }
  // cols
  for (let x = 0; x < SIZE; x++) {
    let run = 1;
    for (let y = 1; y <= SIZE; y++) {
      if (y < SIZE && grid[y][x] === grid[y - 1][x]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) found.push({ x, y: y - 1 - k });
        }
        run = 1;
      }
    }
  }
  return found;
}

function applyGravity(grid: Cell[][]) {
  for (let x = 0; x < SIZE; x++) {
    let write = SIZE - 1;
    for (let y = SIZE - 1; y >= 0; y--) {
      if (grid[y][x] !== -1) {
        grid[write][x] = grid[y][x];
        write--;
      }
    }
    for (let y = write; y >= 0; y--) {
      grid[y][x] = Math.floor(Math.random() * COLORS.length);
    }
  }
}

function ensureResolvable(grid: Cell[][]) {
  // keep regenerating until there is at least one match potential
  let attempts = 0;
  while (!hasMove(grid) && attempts < 50) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        grid[y][x] = Math.floor(Math.random() * COLORS.length);
      }
    }
    attempts++;
  }
}

function hasMove(grid: Cell[][]): boolean {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const current = { x, y };
      const neighbors = [
        { x: x + 1, y },
        { x, y: y + 1 }
      ];
      for (const n of neighbors) {
        if (n.x >= SIZE || n.y >= SIZE) continue;
        swap(grid, current, n);
        const matches = findMatches(grid);
        swap(grid, current, n);
        if (matches.length) return true;
      }
    }
  }
  return false;
}

export default match3;
