import { GameModule } from './gameTypes';
import { createGameShell, bindTap } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';

interface Pipe {
  x: number;
  gapY: number;
}

const WIDTH = 360;
const HEIGHT = 520;
const GAP = 260;
const PIPE_SPACING = 420;
const BIRD_X = 70;
const storage = namespace('flappy');

const flappy: GameModule = {
  id: 'flappy',
  name: 'Flappy Bird',
  description: 'Tap to flap, dodge pipes, chase a high score.',
  icon: '🐤',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Flappy Bird', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const scoreEl = document.createElement('div');
    const bestEl = document.createElement('div');
    info.append(scoreEl, bestEl);
    area.appendChild(info);

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.className = 'game-canvas';
    area.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas missing');

    let birdY = HEIGHT / 2;
    let vel = 0;
    let pipes: Pipe[] = [];
    let score = 0;
    let best = storage.load('best', 0);
    let alive = true;
    let timeSincePipe = 0;

    const updateUI = () => {
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;
    };

    const spawnPipe = () => {
      const margin = 80;
      const gapY = margin + Math.random() * (HEIGHT - margin * 2 - GAP);
      pipes.push({ x: WIDTH + 40, gapY });
    };

    const reset = () => {
      birdY = HEIGHT / 2;
      vel = 0;
      score = 0;
      alive = true;
      pipes = [];
      timeSincePipe = PIPE_SPACING;
      updateUI();
    };

    const loop = new GameLoop((dt) => {
      if (!alive) return;
      timeSincePipe += dt * 1000;
      if (timeSincePipe >= PIPE_SPACING) {
        spawnPipe();
        timeSincePipe = 0;
      }
      vel += 380 * dt;
      birdY += vel * dt;
      pipes.forEach((p) => (p.x -= 70 * dt));
      pipes = pipes.filter((p) => p.x > -60);

      pipes.forEach((p) => {
        if (p.x + 50 < BIRD_X && !('scored' in p)) {
          score += 1;
          (p as any).scored = true;
          best = Math.max(best, score);
          storage.save('best', best);
          updateUI();
        }
        const hitX = BIRD_X > p.x && BIRD_X < p.x + 60;
        const hitY = birdY < p.gapY || birdY > p.gapY + GAP;
        if (hitX && hitY) {
          alive = false;
        }
      });

      if (birdY > HEIGHT - 20 || birdY < 0) alive = false;
      draw(ctx, birdY, pipes, alive);
      if (!alive) {
        drawGameOver(ctx);
      }
    });

    const flap = () => {
      if (!alive) {
        reset();
        return;
      }
      vel = -160;
    };

    const detach = bindTap(canvas, flap);
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === ' ') flap();
    };
    window.addEventListener('keydown', keyHandler);

    reset();
    loop.start();

    return () => {
      loop.stop();
      detach();
      window.removeEventListener('keydown', keyHandler);
    };
  }
};

function draw(
  ctx: CanvasRenderingContext2D,
  birdY: number,
  pipes: Pipe[],
  alive: boolean
) {
  ctx.fillStyle = '#0d172a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(BIRD_X, birdY, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#10b981';
  pipes.forEach((p) => {
    ctx.fillRect(p.x, 0, 60, p.gapY);
    ctx.fillRect(p.x, p.gapY + GAP, 60, ctx.canvas.height - (p.gapY + GAP));
  });

  if (!alive) drawGameOver(ctx);
}

function drawGameOver(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '24px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Tap to restart', ctx.canvas.width / 2, ctx.canvas.height / 2);
}

export default flappy;
