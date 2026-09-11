import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton, bindSwipe } from '../core/ui';
import { GameLoop } from '../core/engine';
import { namespace } from '../core/storage';
import { directionPad, exposeGame, message } from '../core/play';

type Cell = {
  visited: boolean;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
};
type Point = { x: number; y: number };
const storage = namespace('maze');
const maze: GameModule = {
  id: 'maze',
  name: 'Maze Escape',
  icon: '🧭',
  description: 'Explore, collect three stars, and find your way home.',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Maze Escape', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 360;
    canvas.className = 'game-canvas';
    area.append(info, canvas);
    const status = message(
      area,
      'Find the green exit. Take a detour for the three stars.'
    );
    const ctx = canvas.getContext('2d')!;
    let level = Math.max(1, storage.load('level', 1));
    let size = 8,
      grid: Cell[][] = [],
      player = { x: 0, y: 0 };
    let stars: Point[] = [],
      collected = 0,
      steps = 0,
      elapsed = 0,
      finished = false,
      hints = 3;
    let trail = new Set<string>(),
      path: Point[] = [],
      showTrail = true;
    const controls = document.createElement('div');
    controls.className = 'control-row';
    const hint = createTouchButton('Hint · 3', () => {
      if (!hints || finished) return;
      hints--;
      path = route(player, { x: size - 1, y: size - 1 }).slice(1, 6);
      status.textContent = 'Follow the blue dots toward the exit.';
      draw();
    });
    const trailButton = createTouchButton('Trail: On', () => {
      showTrail = !showTrail;
      trailButton.textContent = `Trail: ${showTrail ? 'On' : 'Off'}`;
      draw();
    });
    const next = createTouchButton('New maze', () => {
      if (finished) {
        level++;
        storage.save('level', level);
      }
      reset();
    });
    controls.append(hint, trailButton, next);
    area.append(controls);
    directionPad(area, move);
    function neighbors(p: Point) {
      const w = grid[p.y][p.x].walls;
      return [
        { x: p.x, y: p.y - 1, wall: w.top },
        { x: p.x + 1, y: p.y, wall: w.right },
        { x: p.x, y: p.y + 1, wall: w.bottom },
        { x: p.x - 1, y: p.y, wall: w.left }
      ].filter((n) => !n.wall);
    }
    function route(from: Point, to: Point): Point[] {
      const queue: Point[][] = [[from]],
        seen = new Set([`${from.x},${from.y}`]);
      for (let i = 0; i < queue.length; i++) {
        const way = queue[i],
          p = way.at(-1)!;
        if (p.x === to.x && p.y === to.y) return way;
        for (const n of neighbors(p)) {
          const key = `${n.x},${n.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            queue.push([...way, { x: n.x, y: n.y }]);
          }
        }
      }
      return [];
    }
    function reset() {
      size = Math.min(16, 8 + Math.floor((level - 1) / 2) * 2);
      grid = generateMaze(size);
      player = { x: 0, y: 0 };
      collected = 0;
      steps = 0;
      elapsed = 0;
      finished = false;
      hints = 3;
      path = [];
      trail = new Set(['0,0']);
      const candidates: Point[] = [];
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          if (x + y > 2 && (x !== size - 1 || y !== size - 1))
            candidates.push({ x, y });
      stars = [];
      for (let i = 0; i < 3; i++)
        stars.push(
          candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]
        );
      status.textContent =
        'Find the green exit. Take a detour for the three stars.';
      draw();
    }
    function draw() {
      info.textContent = `Expedition ${level} · ${elapsed.toFixed(1)}s · ${steps} steps · Stars ${collected}/3`;
      hint.textContent = `Hint · ${hints}`;
      hint.disabled = !hints || finished;
      next.textContent = finished ? 'Next expedition →' : 'New maze';
      const c = 356 / size;
      ctx.fillStyle = '#132638';
      ctx.fillRect(0, 0, 360, 360);
      if (showTrail) {
        ctx.fillStyle = '#24465a';
        for (const pos of trail) {
          const [x, y] = pos.split(',').map(Number);
          ctx.beginPath();
          ctx.arc(2 + (x + 0.5) * c, 2 + (y + 0.5) * c, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#7795ac';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const w = grid[y][x].walls,
            px = x * c + 2,
            py = y * c + 2;
          if (w.top) drawLine(ctx, px, py, px + c, py);
          if (w.right) drawLine(ctx, px + c, py, px + c, py + c);
          if (w.bottom) drawLine(ctx, px, py + c, px + c, py + c);
          if (w.left) drawLine(ctx, px, py, px, py + c);
        }
      ctx.stroke();
      ctx.fillStyle = '#79dab0';
      ctx.fillRect(
        2 + (size - 1) * c + 5,
        2 + (size - 1) * c + 5,
        c - 10,
        c - 10
      );
      ctx.fillStyle = '#ffdb82';
      ctx.font = `${c * 0.65}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      stars.forEach((p) =>
        ctx.fillText('★', 2 + (p.x + 0.5) * c, 2 + (p.y + 0.5) * c)
      );
      ctx.fillStyle = '#8bd9ff';
      path.forEach((p) => {
        ctx.beginPath();
        ctx.arc(2 + (p.x + 0.5) * c, 2 + (p.y + 0.5) * c, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#edf8ff';
      ctx.beginPath();
      ctx.arc(
        2 + (player.x + 0.5) * c,
        2 + (player.y + 0.5) * c,
        c * 0.27,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    function move(dx: number, dy: number) {
      if (finished) return;
      const n = neighbors(player).find(
        (p) => p.x === player.x + dx && p.y === player.y + dy
      );
      if (!n) return;
      player = { x: n.x, y: n.y };
      steps++;
      trail.add(`${player.x},${player.y}`);
      const i = stars.findIndex((p) => p.x === player.x && p.y === player.y);
      if (i >= 0) {
        stars.splice(i, 1);
        collected++;
        status.textContent = `Star found! ${collected}/3 collected.`;
      }
      if (player.x === size - 1 && player.y === size - 1) {
        finished = true;
        status.textContent = `Escaped! ${'★'.repeat(collected)}${'☆'.repeat(3 - collected)} · ${elapsed.toFixed(1)}s · Ready for a bigger adventure?`;
        storage.save(
          'completed',
          Math.max(level, storage.load('completed', 0))
        );
      }
      draw();
    }
    const swipeOff = bindSwipe(canvas, (d) => {
      const [x, y] = {
        up: [0, -1],
        down: [0, 1],
        left: [-1, 0],
        right: [1, 0]
      }[d];
      move(x, y);
    });
    const key = (e: KeyboardEvent) => {
      const p = (
        {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0]
        } as Record<string, number[]>
      )[e.key];
      if (p) {
        e.preventDefault();
        move(p[0], p[1]);
      }
    };
    window.addEventListener('keydown', key);
    const loop = new GameLoop((dt) => {
      if (steps && !finished && !document.hidden) {
        elapsed += dt;
        info.textContent = `Expedition ${level} · ${elapsed.toFixed(1)}s · ${steps} steps · Stars ${collected}/3`;
      }
    });
    reset();
    loop.start();
    const off = exposeGame(
      () => ({
        game: 'maze',
        mode: finished ? 'won' : 'playing',
        size,
        player,
        stars,
        collected,
        grid: grid.map((row) => row.map((c) => c.walls)),
        hints,
        path,
        steps,
        elapsed,
        level
      }),
      (ms) => loop.advance(ms)
    );
    return () => {
      loop.stop();
      swipeOff();
      off();
      window.removeEventListener('keydown', key);
    };
  }
};

function generateMaze(size: number): Cell[][] {
  const COLS = size,
    ROWS = size;
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
