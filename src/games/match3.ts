import { GameModule } from './gameTypes';
import { createGameShell } from '../core/ui';
import { namespace } from '../core/storage';

type Cell = number;

const SIZE = 8;
const COLORS = ['#f97316', '#38bdf8', '#a855f7', '#22c55e', '#f59e0b'];
const storage = namespace('match3');

const CELL_PX = 44; // tile size + gap for drop animation

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
    let isResolving = false;

    const key = (x: number, y: number) => `${x}-${y}`;

    const updateUI = () => {
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;
    };

    const render = (animations?: RenderAnimations) => {
      boardEl.innerHTML = '';
      grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          const tile = document.createElement('button');
          tile.className = 'match3-cell';
          tile.style.backgroundColor = COLORS[cell];
          tile.dataset.x = String(x);
          tile.dataset.y = String(y);
          tile.classList.toggle('selected', selected?.x === x && selected?.y === y);
          const drop = animations?.drops?.[key(x, y)];
          if (drop) {
            tile.style.setProperty('--fall-distance', `${drop}px`);
            tile.classList.add('match3-fall');
          }
          if (animations?.newTiles?.has(key(x, y))) {
            tile.classList.add('match3-new');
          }
          if (animations?.clearing?.has(key(x, y))) {
            tile.classList.add('match3-clearing');
          }
          tile.addEventListener('click', onSelect);
          tile.addEventListener('touchend', onSelect);
          boardEl.appendChild(tile);
        });
      });
      updateUI();
    };

    const onSelect = async (e: Event) => {
      if (isResolving) return;
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      const x = Number(target.dataset.x);
      const y = Number(target.dataset.y);
      if (!selected) {
        selected = { x, y };
      } else {
        if (isNeighbor(selected, { x, y })) {
          await attemptSwap(selected, { x, y });
          selected = null;
        } else {
          selected = { x, y };
        }
      }
      render();
    };

    const attemptSwap = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
      swap(grid, a, b);
      render();
      const cleared = await resolveBoardAnimated();
      if (!cleared) {
        swap(grid, a, b);
        render();
      } else {
        score += cleared;
        best = Math.max(best, score);
        storage.save('best', best);
        render();
      }
    };

    const resolveBoardAnimated = async () => {
      if (isResolving) return 0;
      isResolving = true;
      let totalCleared = 0;

      while (true) {
        const matches = findMatches(grid);
        if (!matches.length) break;

        const clearing = new Set(matches.map((m) => key(m.x, m.y)));
        render({ clearing });
        await sleep(120);

        matches.forEach(({ x, y }) => {
          grid[y][x] = -1;
        });

        const moves = applyGravityWithMoves(grid);
        const drops: Record<string, number> = {};
        const newTiles = new Set<string>();
        moves.forEach((m) => {
          const distance = m.to - m.from;
          drops[key(m.x, m.to)] = distance * CELL_PX;
          if (m.isNew) newTiles.add(key(m.x, m.to));
        });

        render({ drops, newTiles });
        await sleep(220);

        totalCleared += matches.length * 10;
      }

      isResolving = false;
      render();
      return totalCleared;
    };

    // ensure starting board has a move then resolve initial matches with animations
    ensureResolvable(grid);
    render();
    void resolveBoardAnimated();

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

function applyGravityWithMoves(
  grid: Cell[][]
): { x: number; from: number; to: number; isNew: boolean }[] {
  const moves: { x: number; from: number; to: number; isNew: boolean }[] = [];

  for (let x = 0; x < SIZE; x++) {
    const column: Cell[] = Array(SIZE).fill(-1);
    let write = SIZE - 1;

    for (let y = SIZE - 1; y >= 0; y--) {
      if (grid[y][x] !== -1) {
        column[write] = grid[y][x];
        if (write !== y) {
          moves.push({ x, from: y, to: write, isNew: false });
        }
        write--;
      }
    }

    for (let y = write; y >= 0; y--) {
      column[y] = Math.floor(Math.random() * COLORS.length);
      moves.push({ x, from: -1, to: y, isNew: true });
    }

    for (let y = 0; y < SIZE; y++) {
      grid[y][x] = column[y];
    }
  }

  return moves;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RenderAnimations = {
  drops?: Record<string, number>;
  newTiles?: Set<string>;
  clearing?: Set<string>;
};

export default match3;
