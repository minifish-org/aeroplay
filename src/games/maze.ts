import { GameModule } from './gameTypes';
import { createGameCanvas } from '../core/pixi/scene';
import { MazeView } from './views/maze';
import { createGameShell, createTouchButton, bindSwipe } from '../core/ui';
import { GameLoop } from '../core/engine';
import { namespace } from '../core/storage';
import { directionPad, exposeGame, message } from '../core/play';
import { isLayaControlling, registerLayaGame } from '../core/laya-bridge';

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
  mount(root, goBack) {
    const storage = namespace('maze');
    const { area } = createGameShell(root, 'Maze Escape', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const canvas = createGameCanvas(360);
    canvas.className = 'game-canvas';
    area.append(info, canvas);
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
      revision = 0,
      routeTimer = 0;
    let planned: Point[] = [];
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
      revision++;
      planned = [];
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
      view.draw(
        grid,
        player,
        stars,
        trail,
        path,
        showTrail,
        collected,
        finished
      );
    }
    function move(dx: number, dy: number, fromLaya = false) {
      if (paused || (isLayaControlling() && !fromLaya) || finished) return;
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
      if (paused || isLayaControlling()) return;
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
    const loop = new GameLoop(
      (dt) => {
        if (paused || document.hidden) return;
        if (planned.length && !isLayaControlling()) planned = [];
        if (planned.length && !finished) {
          routeTimer -= dt;
          if (routeTimer <= 0) {
            const next = planned.shift()!;
            const before = steps;
            move(next.x - player.x, next.y - player.y, true);
            if (before === steps) planned = [];
            routeTimer = 0.15;
          }
        }
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
    const targets = () =>
      mazeLayaTargets(stars, { x: size - 1, y: size - 1 }, (target) =>
        route(player, target).slice(1)
      );
    const offLaya = registerLayaGame({
      game: 'maze',
      observe: () => {
        if (paused || finished || planned.length) return null;
        const candidates = targets();
        if (!candidates.length) return null;
        return {
          key: stateKey(),
          context: `Maze ${size} by ${size}. Player row ${player.y + 1}, column ${player.x + 1}. Stars collected ${collected}/3. Routes use the visible maze walls. The exit ends the round, so stars beyond it are unavailable.\n${candidates.map((c, i) => `Option ${i}: ${c.kind} at row ${c.target.y + 1}, column ${c.target.x + 1}, route length ${c.way.length}.`).join('\n')}`,
          question:
            candidates[0].kind === 'star'
              ? 'Which remaining star has the shortest route?'
              : 'Which route reaches the exit?',
          choices: Object.fromEntries(
            candidates.map((c, i) => [
              String(i),
              `${c.kind === 'star' ? 'Star' : 'Exit'} at row ${c.target.y + 1}, column ${c.target.x + 1}`
            ])
          )
        };
      },
      act: (choice, key) => {
        if (paused || finished || planned.length || key !== stateKey())
          return false;
        const candidate = targets()[Number(choice)];
        if (!candidate || String(Number(choice)) !== choice) return false;
        planned = candidate.way;
        routeTimer = 0;
        return true;
      },
      start: () => {
        paused = false;
        if (finished) reset();
      },
      pause: () => {
        paused = true;
        planned = [];
      },
      resume: () => {
        paused = false;
      },
      isFinished: () => finished,
      isPaused: () => paused,
      intervalMs: 300,
      assistance: 'Move planning'
    });
    const off = exposeGame(
      () => ({
        game: 'maze',
        mode: finished ? 'won' : paused ? 'paused' : 'playing',
        size,
        player,
        stars,
        collected,
        grid: grid.map((row) => row.map((c) => c.walls)),
        hints,
        path,
        planned,
        steps,
        elapsed,
        level
      }),
      (ms) => loop.advance(ms)
    );
    return () => {
      offLaya();
      loop.stop();
      view.dispose();
      swipeOff();
      off();
      window.removeEventListener('keydown', key);
    };
  }
};

/** Route steps exclude the player cell; entering the exit ends the round. */
export function mazeLayaTargets(
  stars: Point[],
  exit: Point,
  routeTo: (target: Point) => Point[]
) {
  const candidates = stars
    .map((target) => ({ target, way: routeTo(target), kind: 'star' as const }))
    .filter(
      (candidate) =>
        candidate.way.length > 0 &&
        !candidate.way.some((point) => point.x === exit.x && point.y === exit.y)
    );
  if (candidates.length) return candidates;
  const way = routeTo(exit);
  return way.length ? [{ target: exit, way, kind: 'exit' as const }] : [];
}

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
