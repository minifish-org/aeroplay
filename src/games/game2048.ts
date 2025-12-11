import { GameModule } from './gameTypes';
import { createGameShell, bindSwipe, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';

const SIZE = 4;
const storage = namespace('game2048');

type Grid = number[][];

type MoveDirection = 'left' | 'right' | 'up' | 'down';

type AnimationMeta = {
  dir?: MoveDirection;
  shift?: number;
  merged?: boolean;
  spawned?: boolean;
};

type MoveRecord = {
  sources: number[];
  target: number;
  value: number;
  merged: boolean;
};

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
    let animations: Record<string, AnimationMeta> = {};

    const render = () => {
      gridEl.innerHTML = '';
      grid.forEach((row, y) => {
        row.forEach((val, x) => {
          const cell = document.createElement('div');
          cell.className = `tile tile-${val || 'empty'}`;
          cell.textContent = val ? String(val) : '';

          const anim = animations[`${x}-${y}`];
          if (anim) {
            if (anim.shift && anim.dir) {
              cell.style.setProperty('--shift', String(anim.shift));
              cell.classList.add(`slide-${anim.dir}`);
            }
            if (anim.merged) cell.classList.add('tile-merged');
            if (anim.spawned) cell.classList.add('tile-new');
          }

          gridEl.appendChild(cell);
        });
      });
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;

      animations = {};
    };

    const spawn = (markNew = false) => {
      const empties: { x: number; y: number }[] = [];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (!grid[y][x]) empties.push({ x, y });
        }
      }
      if (!empties.length) return false;
      const { x, y } = empties[Math.floor(Math.random() * empties.length)];
      grid[y][x] = Math.random() < 0.9 ? 2 : 4;
      if (markNew) {
        animations[`${x}-${y}`] = { ...(animations[`${x}-${y}`] || {}), spawned: true };
      }
      return true;
    };

    const restartGame = () => {
      animations = {};
      grid = createGrid();
      score = 0;
      spawn(true);
      spawn(true);
      render();
    };

    const move = (dir: MoveDirection) => {
      const before = gridToString(grid);
      animations = {};
      if (dir === 'left' || dir === 'right') {
        for (let y = 0; y < SIZE; y++) {
          const row = grid[y];
          const merged = compressAndMerge(row, dir === 'left');
          grid[y] = merged.newRow;
          score += merged.gained;
          merged.moves.forEach((record) => {
            const shift = Math.max(...record.sources.map((s) => Math.abs(s - record.target)));
            animations[`${record.target}-${y}`] = {
              dir,
              shift,
              merged: record.merged || undefined
            };
          });
        }
      } else {
        for (let x = 0; x < SIZE; x++) {
          const col = grid.map((row) => row[x]);
          const merged = compressAndMerge(col, dir === 'up');
          for (let y = 0; y < SIZE; y++) grid[y][x] = merged.newRow[y];
          score += merged.gained;
          merged.moves.forEach((record) => {
            const shift = Math.max(...record.sources.map((s) => Math.abs(s - record.target)));
            animations[`${x}-${record.target}`] = {
              dir,
              shift,
              merged: record.merged || undefined
            };
          });
        }
      }
      const after = gridToString(grid);
      if (before !== after) {
        best = Math.max(best, score);
        storage.save('best', best);
        spawn(true);
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
): { newRow: number[]; gained: number; moves: MoveRecord[] } {
  const tiles = arr
    .map((val, idx) => ({ val, idx }))
    .filter(({ val }) => val !== 0);
  if (!forward) tiles.reverse();

  const mergedValues: number[] = [];
  const moves: MoveRecord[] = [];
  let gained = 0;
  let targetIndex = 0;

  for (let i = 0; i < tiles.length; i++) {
    const current = tiles[i];
    const next = tiles[i + 1];
    const target = forward ? targetIndex : SIZE - 1 - targetIndex;

    if (next && current.val === next.val) {
      const val = current.val * 2;
      mergedValues.push(val);
      moves.push({
        sources: [current.idx, next.idx],
        target,
        value: val,
        merged: true
      });
      gained += val;
      i++;
    } else {
      mergedValues.push(current.val);
      moves.push({
        sources: [current.idx],
        target,
        value: current.val,
        merged: false
      });
    }
    targetIndex++;
  }

  while (mergedValues.length < SIZE) mergedValues.push(0);
  const newRow = forward ? mergedValues : [...mergedValues].reverse();

  return { newRow, gained, moves };
}

function gridToString(grid: Grid) {
  return grid.flat().join(',');
}

export default game2048;
