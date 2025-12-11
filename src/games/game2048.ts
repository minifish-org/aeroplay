import { GameModule } from './gameTypes';
import { createGameShell, bindSwipe, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';

const SIZE = 4;
const storage = namespace('game2048');

type Grid = number[][];

const game2048: GameModule = {
  id: '2048',
  name: '2048',
  description: 'Swipe tiles to merge to 2048.',
  icon: '🧮',
  mount(root, goBack) {
    const { area } = createGameShell(root, '2048', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const scoreEl = document.createElement('div');
    const bestEl = document.createElement('div');
    const restart = document.createElement('button');
    restart.className = 'touch-btn';
    restart.textContent = 'Restart';
    info.append(scoreEl, bestEl, restart);

    const gridEl = document.createElement('div');
    gridEl.className = 'grid-2048';
    area.append(info, gridEl);

    const controls = document.createElement('div');
    controls.className = 'control-grid';
    const upBtn = createTouchButton('▲', () => move('up'));
    const downBtn = createTouchButton('▼', () => move('down'));
    const leftBtn = createTouchButton('◀', () => move('left'));
    const rightBtn = createTouchButton('▶', () => move('right'));
    controls.append(
      document.createElement('span'),
      upBtn,
      document.createElement('span'),
      leftBtn,
      document.createElement('span'),
      rightBtn,
      document.createElement('span'),
      downBtn,
      document.createElement('span')
    );
    area.appendChild(controls);

    let grid = createGrid();
    let score = 0;
    let best = storage.load('best', 0);

    const render = () => {
      gridEl.innerHTML = '';
      grid.forEach((row) => {
        row.forEach((val) => {
          const cell = document.createElement('div');
          cell.className = `tile tile-${val || 'empty'}`;
          cell.textContent = val ? String(val) : '';
          gridEl.appendChild(cell);
        });
      });
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;
    };

    const spawn = () => {
      const empties: { x: number; y: number }[] = [];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (!grid[y][x]) empties.push({ x, y });
        }
      }
      if (!empties.length) return false;
      const { x, y } = empties[Math.floor(Math.random() * empties.length)];
      grid[y][x] = Math.random() < 0.9 ? 2 : 4;
      return true;
    };

    const restartGame = () => {
      grid = createGrid();
      score = 0;
      spawn();
      spawn();
      render();
    };

    const move = (dir: 'left' | 'right' | 'up' | 'down') => {
      const before = gridToString(grid);
      if (dir === 'left' || dir === 'right') {
        for (let y = 0; y < SIZE; y++) {
          const row = grid[y];
          const merged = compressAndMerge(row, dir === 'left');
          grid[y] = merged.newRow;
          score += merged.gained;
        }
      } else {
        for (let x = 0; x < SIZE; x++) {
          const col = grid.map((row) => row[x]);
          const merged = compressAndMerge(col, dir === 'up');
          for (let y = 0; y < SIZE; y++) grid[y][x] = merged.newRow[y];
          score += merged.gained;
        }
      }
      const after = gridToString(grid);
      if (before !== after) {
        best = Math.max(best, score);
        storage.save('best', best);
        spawn();
        render();
      }
    };

    const swipeOff = bindSwipe(area, (dir) => move(dir));
    restart.addEventListener('click', restartGame);
    restart.addEventListener('touchend', (e) => {
      e.preventDefault();
      restartGame();
    });
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move('left');
      if (e.key === 'ArrowRight') move('right');
      if (e.key === 'ArrowUp') move('up');
      if (e.key === 'ArrowDown') move('down');
    };
    window.addEventListener('keydown', keyHandler);

    restartGame();

    return () => {
      swipeOff();
      window.removeEventListener('keydown', keyHandler);
    };
  }
};

function createGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function compressAndMerge(
  arr: number[],
  forward: boolean
): { newRow: number[]; gained: number } {
  const filtered = arr.filter((n) => n !== 0);
  if (!forward) filtered.reverse();
  const merged: number[] = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i] === filtered[i + 1]) {
      const val = filtered[i] * 2;
      merged.push(val);
      gained += val;
      i++;
    } else {
      merged.push(filtered[i]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  if (!forward) merged.reverse();
  return { newRow: merged, gained };
}

function gridToString(grid: Grid) {
  return grid.flat().join(',');
}

export default game2048;
