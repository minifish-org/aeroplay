import { GameModule } from './gameTypes';
import { createGameShell, bindSwipe } from '../core/ui';

type Cell = {
  visited: boolean;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
};

const COLS = 12;
const ROWS = 12;
const CELL_SIZE = 22;

const maze: GameModule = {
  id: 'maze',
  name: 'Maze Escape',
  description: 'Swipe to exit a random maze as fast as you can.',
  icon: '🧭',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Maze Escape', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const timeEl = document.createElement('div');
    const statusEl = document.createElement('div');
    info.append(timeEl, statusEl);
    area.appendChild(info);

    const canvas = document.createElement('canvas');
    canvas.width = COLS * CELL_SIZE + 2;
    canvas.height = ROWS * CELL_SIZE + 2;
    canvas.className = 'game-canvas';
    area.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas missing');

    let grid = generateMaze();
    let player = { x: 0, y: 0 };
    let startedAt = performance.now();
    let finished = false;

    const draw = () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const cell = grid[y][x];
          const px = x * CELL_SIZE + 1;
          const py = y * CELL_SIZE + 1;
          if (cell.walls.top) drawLine(ctx, px, py, px + CELL_SIZE, py);
          if (cell.walls.right) drawLine(ctx, px + CELL_SIZE, py, px + CELL_SIZE, py + CELL_SIZE);
          if (cell.walls.bottom) drawLine(ctx, px, py + CELL_SIZE, px + CELL_SIZE, py + CELL_SIZE);
          if (cell.walls.left) drawLine(ctx, px, py, px, py + CELL_SIZE);
        }
      }
      ctx.fillStyle = '#34d399';
      ctx.fillRect(
        COLS * CELL_SIZE - CELL_SIZE + 5,
        ROWS * CELL_SIZE - CELL_SIZE + 5,
        CELL_SIZE - 8,
        CELL_SIZE - 8
      );

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(
        player.x * CELL_SIZE + CELL_SIZE / 2 + 1,
        player.y * CELL_SIZE + CELL_SIZE / 2 + 1,
        CELL_SIZE / 3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    };

    const move = (dir: 'up' | 'down' | 'left' | 'right') => {
      if (finished) return;
      const cell = grid[player.y][player.x];
      if (dir === 'up' && !cell.walls.top) player.y -= 1;
      if (dir === 'down' && !cell.walls.bottom) player.y += 1;
      if (dir === 'left' && !cell.walls.left) player.x -= 1;
      if (dir === 'right' && !cell.walls.right) player.x += 1;
      draw();
      checkWin();
    };

    const checkWin = () => {
      if (player.x === COLS - 1 && player.y === ROWS - 1) {
        finished = true;
        const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
        statusEl.textContent = `Finished in ${seconds}s`;
      }
    };

    const reset = () => {
      grid = generateMaze();
      player = { x: 0, y: 0 };
      startedAt = performance.now();
      finished = false;
      statusEl.textContent = '';
      draw();
      updateTime();
    };

    const swipeOff = bindSwipe(area, (dir) => move(dir));
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') move('up');
      if (e.key === 'ArrowDown') move('down');
      if (e.key === 'ArrowLeft') move('left');
      if (e.key === 'ArrowRight') move('right');
      if (e.key === 'r') reset();
    };
    window.addEventListener('keydown', keyHandler);

    const updateTime = () => {
      if (!finished) {
        const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
        timeEl.textContent = `Time: ${seconds}s`;
        requestAnimationFrame(updateTime);
      }
    };

    reset();
    draw();
    updateTime();

    return () => {
      swipeOff();
      window.removeEventListener('keydown', keyHandler);
    };
  }
};

function generateMaze(): Cell[][] {
  const grid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({
      visited: false,
      walls: { top: true, right: true, bottom: true, left: true }
    }))
  );

  const stack: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  grid[0][0].visited = true;

  const neighbors = (x: number, y: number) => {
    const dirs = [
      { x: 0, y: -1, wall: 'top', opp: 'bottom' },
      { x: 1, y: 0, wall: 'right', opp: 'left' },
      { x: 0, y: 1, wall: 'bottom', opp: 'top' },
      { x: -1, y: 0, wall: 'left', opp: 'right' }
    ] as const;
    return dirs
      .map((d) => ({ ...d, nx: x + d.x, ny: y + d.y }))
      .filter((d) => d.nx >= 0 && d.nx < COLS && d.ny >= 0 && d.ny < ROWS);
  };

  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = neighbors(current.x, current.y).filter(
      (n) => !grid[n.ny][n.nx].visited
    );
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const pick = choices[Math.floor(Math.random() * choices.length)];
    const cell = grid[current.y][current.x];
    cell.walls[pick.wall] = false;
    grid[pick.ny][pick.nx].walls[pick.opp] = false;
    grid[pick.ny][pick.nx].visited = true;
    stack.push({ x: pick.nx, y: pick.ny });
  }

  return grid;
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}

export default maze;
