import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton, bindSwipe } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import {
  Mode,
  canvasOverlay,
  directionPad,
  exposeGame,
  message
} from '../core/play';

type Point = { x: number; y: number };
const SIZE = 20;
const CELL = 18;
const storage = namespace('snake');

const snake: GameModule = {
  id: 'snake',
  name: 'Snake',
  icon: '🐍',
  description: 'Chase golden fruit. Find your rhythm as the pace rises.',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Snake', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE * CELL;
    canvas.className = 'game-canvas';
    area.append(info, canvas);
    const ctx = canvas.getContext('2d')!;
    const status = message(
      area,
      'Swipe the board or use arrows. Golden fruit is worth 30 points.'
    );
    let segments: Point[] = [];
    let dir = { x: 1, y: 0 };
    let queue: Point[] = [];
    let food: Point | null = null;
    let bonus: Point | null = null;
    let bonusTime = 0;
    let eaten = 0;
    let score = 0;
    let best = storage.load('best', 0);
    let mode: Mode = 'ready';
    let acc = 0;
    let relaxed = false;
    const row = document.createElement('div');
    row.className = 'control-row';
    const start = createTouchButton('Start', () => {
      if (mode === 'over' || mode === 'won') reset();
      mode = mode === 'playing' ? 'paused' : 'playing';
      draw();
    });
    const difficulty = createTouchButton('Mode: Classic', () => {
      relaxed = !relaxed;
      difficulty.textContent = relaxed ? 'Mode: Relaxed' : 'Mode: Classic';
      best = storage.load(relaxed ? 'best-relaxed' : 'best', 0);
      reset();
      draw();
    });
    row.append(start, difficulty);
    area.append(row);
    function turn(x: number, y: number) {
      if (mode === 'over' || mode === 'won' || mode === 'paused') return;
      if (mode === 'ready') mode = 'playing';
      const last = queue.at(-1) ?? dir;
      if (
        (last.x === x && last.y === y) ||
        (last.x === -x && last.y === -y) ||
        queue.length >= 2
      )
        return;
      queue.push({ x, y });
    }
    directionPad(area, turn);
    function emptyCell(): Point | null {
      const cells: Point[] = [];
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          if (
            !segments.some((p) => p.x === x && p.y === y) &&
            !(food?.x === x && food?.y === y)
          )
            cells.push({ x, y });
        }
      return cells.length
        ? cells[Math.floor(Math.random() * cells.length)]
        : null;
    }
    function reset() {
      segments = [
        { x: 8, y: 10 },
        { x: 9, y: 10 },
        { x: 10, y: 10 }
      ];
      dir = { x: 1, y: 0 };
      queue = [];
      score = 0;
      eaten = 0;
      acc = 0;
      food = null;
      bonus = null;
      bonusTime = 0;
      food = emptyCell();
      mode = 'ready';
    }
    function step() {
      dir = queue.shift() ?? dir;
      const head = segments[segments.length - 1];
      const next = { x: head.x + dir.x, y: head.y + dir.y };
      if (relaxed) {
        next.x = (next.x + SIZE) % SIZE;
        next.y = (next.y + SIZE) % SIZE;
      }
      const eating = next.x === food?.x && next.y === food?.y;
      const golden = next.x === bonus?.x && next.y === bonus?.y;
      const body = eating || golden ? segments : segments.slice(1);
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= SIZE ||
        next.y >= SIZE ||
        body.some((p) => p.x === next.x && p.y === next.y)
      ) {
        mode = 'over';
        return;
      }
      segments.push(next);
      if (eating || golden) {
        score += golden ? 30 : 10;
        if (golden) {
          bonus = null;
          bonusTime = 0;
        }
        if (eating) {
          eaten++;
          food = null;
          food = emptyCell();
          if (food && bonus?.x === food.x && bonus?.y === food.y) bonus = null;
          if (eaten % 4 === 0) {
            bonus = emptyCell();
            bonusTime = 8;
          }
        }
        best = Math.max(best, score);
        storage.save(relaxed ? 'best-relaxed' : 'best', best);
        if (segments.length === SIZE * SIZE) mode = 'won';
      } else segments.shift();
    }
    function draw() {
      info.textContent = `Score ${score}   ·   Best ${best}   ·   Level ${1 + Math.floor(eaten / 5)}`;
      start.textContent =
        mode === 'playing'
          ? 'Pause'
          : mode === 'paused'
            ? 'Resume'
            : mode === 'over' || mode === 'won'
              ? 'Play again'
              : 'Start';
      if (bonus)
        status.textContent = `Golden fruit! ${Math.ceil(bonusTime)}s left · +30 points`;
      else
        status.textContent = relaxed
          ? 'Relaxed: cross the edges. Avoid your own tail.'
          : 'Swipe or use arrows. Every 5 fruits, the pace rises.';
      ctx.fillStyle = '#102b30';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#18383d';
      ctx.lineWidth = 1;
      for (let i = 0; i <= SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, SIZE * CELL);
        ctx.moveTo(0, i * CELL);
        ctx.lineTo(SIZE * CELL, i * CELL);
        ctx.stroke();
      }
      segments.forEach((p, i) => {
        ctx.fillStyle = i === segments.length - 1 ? '#c7ffb2' : '#59d9a2';
        ctx.beginPath();
        ctx.roundRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2, 5);
        ctx.fill();
      });
      const head = segments.at(-1)!;
      ctx.fillStyle = '#163c36';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(
          head.x * CELL + 9 + dir.x * 4 + dir.y * side * 4,
          head.y * CELL + 9 + dir.y * 4 + dir.x * side * 4,
          2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      for (const [p, color] of [
        [food, '#ff8592'],
        [bonus, '#ffe08a']
      ] as const)
        if (p) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x * CELL + 9, p.y * CELL + 9, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      if (mode !== 'playing')
        canvasOverlay(
          ctx,
          {
            ready: 'A little longer. A little faster.',
            paused: 'Take a breath',
            over: `Nice run · ${score} points`,
            won: 'Garden complete!'
          }[mode],
          mode === 'ready'
            ? 'Press Start or choose a direction'
            : mode === 'paused'
              ? 'Press Resume when you are ready'
              : 'Your record is saved. Play again?'
        );
    }
    const loop = new GameLoop((dt) => {
      if (mode !== 'playing') return;
      if (bonus) {
        bonusTime -= dt;
        if (bonusTime <= 0) bonus = null;
      }
      acc += dt;
      const speed = relaxed
        ? 0.22
        : Math.max(0.09, 0.21 - Math.floor(eaten / 5) * 0.02);
      while (acc >= speed && mode === 'playing') {
        acc -= speed;
        step();
      }
      draw();
    });
    const swipeOff = bindSwipe(canvas, (d) => {
      const p = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
      turn(p[0], p[1]);
    });
    const key = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      const p = (
        {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0]
        } as Record<string, number[]>
      )[e.key];
      if (p) turn(p[0], p[1]);
      if ((e.code === 'Space' || e.key === 'p') && !e.repeat) start.click();
    };
    const hidden = () => {
      if (document.hidden && mode === 'playing') {
        mode = 'paused';
        draw();
      }
    };
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hidden);
    reset();
    draw();
    loop.start();
    const off = exposeGame(
      () => ({
        game: 'snake',
        mode,
        segments,
        food,
        bonus,
        bonusTime,
        score,
        relaxed,
        direction: dir
      }),
      (ms) => loop.advance(ms)
    );
    return () => {
      loop.stop();
      off();
      swipeOff();
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
    };
  }
};
export default snake;
