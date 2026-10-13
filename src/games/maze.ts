import { GameModule } from './gameTypes';
import { createGameCanvas } from '../core/pixi/scene';
import { MazeView } from './views/maze';
import { createGameShell, createTouchButton, bindSwipe, wrapSurface, surfaceActions } from '../core/ui';
import { GameLoop } from '../core/engine';
import { namespace } from '../core/storage';
import { exposeGame, message } from '../core/play';

type Cell = {
  visited: boolean;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
};
type Point = { x: number; y: number };
const maze: GameModule = {
  id: 'maze',
  name: 'Maze Escape',
  icon: '🧭',
  description: 'Explore, collect three stars, and find your way home.',
  mount(root, goBack, controller) {
    const storage = namespace('maze');
    const { area } = createGameShell(root, 'Maze Escape', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const canvas = createGameCanvas(360);
    canvas.className = 'game-canvas';
    const surface = wrapSurface(canvas, 'surface-board');
    area.append(info, surface);
    const status = message(
      area,
      'Find the green exit. Take a detour for the three stars.'
    );
    const view = new MazeView(canvas);
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
    let paused = false,
      revision = 0;
    let trail = new Set<string>(),
      path: Point[] = [],
      showTrail = true;
    const controls = surfaceActions(surface);
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
      revision++;
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
      view.draw(grid, player, stars, trail, path, showTrail, finished);
    }
    function move(dx: number, dy: number) {
      if (paused || finished) return;
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
      input.human({ x, y });
    });
    const key = (e: KeyboardEvent) => {
      if (paused) return;
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
        input.human({ x: p[0], y: p[1] });
      }
    };
    window.addEventListener('keydown', key);
    const loop = new GameLoop(
      (dt) => {
        if (paused || document.hidden) return;
        if (steps && !finished) {
          elapsed += dt;
          info.textContent = `Expedition ${level} · ${elapsed.toFixed(1)}s · ${steps} steps · Stars ${collected}/3`;
        }
      },
      0.05,
      (dt) => view.tick(paused ? 0 : dt)
    );
    reset();
    loop.start();
    const stateKey = () =>
      `${revision}:${steps}:${player.x},${player.y}:${stars.map((p) => `${p.x},${p.y}`).join(';')}`;
    const directions = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
    function options() {
      return Object.entries(directions).flatMap(([name, direction]) => {
        const next = neighbors(player).find(cell => cell.x === player.x + direction.x && cell.y === player.y + direction.y);
        if (!next) return [];
        const targets = stars.length ? stars : [{ x: size - 1, y: size - 1 }];
        const distance = Math.min(...targets.map(target => Math.abs(target.x - next.x) + Math.abs(target.y - next.y)));
        return [{ name, direction, description: `${name}: row ${next.y + 1}, column ${next.x + 1}; straight distance to ${stars.length ? 'star' : 'exit'} ${distance}; ${trail.has(`${next.x},${next.y}`) ? 'visited' : 'unvisited'}` }];
      });
    }
    const input = controller.connect<Point>({
      game: 'maze',
      planning: () => !paused && !finished ? { game: 'maze', epoch: String(revision), size, walls: grid.map(row => row.map(cell => cell.walls)), position: player, stars } : null,
      observe: () => {
        if (paused || finished) return null;
        const moves = options();
        if (!moves.length) return null;
        return {
          key: stateKey(),
          context: `Maze ${size} by ${size}. Player row ${player.y + 1}, column ${player.x + 1}. Remaining stars ${stars.map(s => `r${s.y + 1}c${s.x + 1}`).join(',') || 'none'}. Exit r${size}c${size}. Walls block movement. Each input moves one cell.`,
          question: 'Which step approaches an uncollected star or the exit and avoids revisiting cells?',
          choices: Object.fromEntries(moves.map(move => [move.name, move.description])),
          inputs: Object.fromEntries(moves.map(move => [move.name, move.direction])),
        };
      },
      isCurrent: key => key === stateKey(),
      apply: direction => { const before = steps; move(direction.x, direction.y); return before !== steps; },
      start: () => { paused = false; if (finished) reset(); },
      pause: () => { paused = true; }, resume: () => { paused = false; },
      isFinished: () => finished, isPaused: () => paused,
    });
    const off = exposeGame(
      () => ({
        game: 'maze',
        visual: view.snapshot(),
        mode: finished ? 'won' : paused ? 'paused' : 'playing',
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
      input.dispose();
      loop.stop();
      view.dispose();
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

export default maze;
