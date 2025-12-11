import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';

interface Point {
  x: number;
  y: number;
}

const GRID_SIZE = 20;
const CELL = 16;
const storage = namespace('snake');

const snake: GameModule = {
  id: 'snake',
  name: 'Snake',
  description: 'Guide the snake with arrows, eat food, avoid walls.',
  icon: '🐍',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Snake', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';

    const scoreEl = document.createElement('div');
    const bestEl = document.createElement('div');
    info.append(scoreEl, bestEl);

    const canvas = document.createElement('canvas');
    canvas.width = GRID_SIZE * CELL;
    canvas.height = GRID_SIZE * CELL;
    canvas.className = 'game-canvas';
    area.append(info, canvas);

    const queueDir = (dx: number, dy: number) => {
      const next = { x: dx, y: dy };
      if (dir.x + next.x === 0 && dir.y + next.y === 0) return;
      pendingDir = next;
    };

    const controls = document.createElement('div');
    controls.className = 'control-grid';
    const up = createTouchButton('▲', () => queueDir(0, -1));
    const down = createTouchButton('▼', () => queueDir(0, 1));
    const left = createTouchButton('◀', () => queueDir(-1, 0));
    const right = createTouchButton('▶', () => queueDir(1, 0));
    controls.append(
      document.createElement('span'),
      up,
      document.createElement('span'),
      left,
      document.createElement('span'),
      right,
      document.createElement('span'),
      down,
      document.createElement('span')
    );
    area.appendChild(controls);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    let segments: Point[] = [
      { x: 8, y: 10 },
      { x: 9, y: 10 },
      { x: 10, y: 10 }
    ];
    let dir: Point = { x: 1, y: 0 };
    let pendingDir: Point | null = null;
    let food = spawnFood(segments);
    let score = 0;
    let best = storage.load('best', 0);
    let acc = 0;

    const updateUI = () => {
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;
    };

    const loop = new GameLoop((dt) => {
      acc += dt;
      const step = 0.45;
      if (acc >= step) {
        acc -= step;
        advance();
        draw();
      }
    });

    const keyHandler = (e: KeyboardEvent) => {
      const mapping: Record<string, Point> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 }
      };
      const next = mapping[e.key];
      if (!next) return;
      queueDir(next.x, next.y);
    };
    window.addEventListener('keydown', keyHandler);

    const advance = () => {
      if (pendingDir) {
        dir = pendingDir;
        pendingDir = null;
      }
      const head = segments[segments.length - 1];
      const next: Point = { x: head.x + dir.x, y: head.y + dir.y };

      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= GRID_SIZE ||
        next.y >= GRID_SIZE ||
        segments.some((s) => s.x === next.x && s.y === next.y)
      ) {
        best = Math.max(best, score);
        storage.save('best', best);
        reset();
        return;
      }

      segments.push(next);
      if (next.x === food.x && next.y === food.y) {
        score += 10;
        best = Math.max(best, score);
        storage.save('best', best);
        food = spawnFood(segments);
      } else {
        segments.shift();
      }
      updateUI();
    };

    const reset = () => {
      segments.splice(0, segments.length, { x: 8, y: 10 }, { x: 9, y: 10 }, { x: 10, y: 10 });
      dir = { x: 1, y: 0 };
      pendingDir = null;
      food = spawnFood(segments);
      score = 0;
      updateUI();
    };

    const draw = () => {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#39d353';
      segments.forEach((s) => {
        ctx.fillRect(s.x * CELL, s.y * CELL, CELL - 1, CELL - 1);
      });

      ctx.fillStyle = '#fbbc04';
      ctx.fillRect(food.x * CELL, food.y * CELL, CELL - 1, CELL - 1);
    };

    updateUI();
    draw();
    loop.start();

    return () => {
      loop.stop();
      window.removeEventListener('keydown', keyHandler);
    };
  }
};

function spawnFood(segments: Point[]): Point {
  while (true) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);
    if (!segments.some((s) => s.x === x && s.y === y)) return { x, y };
  }
}

export default snake;
