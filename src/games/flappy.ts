import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton, bindTap } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import { Mode, canvasOverlay, exposeGame, message } from '../core/play';

type Pipe = { x: number; gapY: number; gap: number; scored: boolean };
const W = 360,
  H = 480,
  X = 82,
  R = 12,
  PIPE_W = 54;
const storage = namespace('flappy');
const flappy: GameModule = {
  id: 'flappy',
  name: 'Flappy Bird',
  icon: '🐤',
  description: 'Find the perfect flight. Thread the gaps for bonus points.',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Flappy Bird', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.className = 'game-canvas flappy-canvas';
    area.append(info, canvas);
    const status = message(
      area,
      'Tap the sky or press Space. Fly through the center for +2.'
    );
    const ctx = canvas.getContext('2d')!;
    let y = H / 2,
      velocity = 0,
      score = 0,
      passed = 0,
      best = storage.load('best', 0);
    let pipes: Pipe[] = [],
      mode: Mode = 'ready';
    let distance = 0,
      flash = 0,
      perfect = false;
    const controls = document.createElement('div');
    controls.className = 'control-row';
    const flapButton = createTouchButton('Take flight', flap);
    const pause = createTouchButton('Pause', () => {
      if (mode === 'playing') mode = 'paused';
      else if (mode === 'paused') mode = 'playing';
      draw();
    });
    controls.append(flapButton, pause);
    area.append(controls);
    function reset() {
      y = H / 2;
      velocity = 0;
      score = 0;
      passed = 0;
      pipes = [];
      distance = 0;
      flash = 0;
      mode = 'ready';
    }
    function flap() {
      if (mode === 'paused') return;
      if (mode === 'over') {
        reset();
        draw();
        return;
      }
      if (mode === 'ready') {
        mode = 'playing';
        spawn();
      }
      velocity = -235;
    }
    function spawn() {
      const gap = Math.max(142, 200 - passed * 3);
      const previous = pipes.at(-1)?.gapY ?? (H - gap) / 2;
      const gapY = Math.max(
        48,
        Math.min(H - 32 - gap - 48, previous + (Math.random() - 0.5) * 130)
      );
      pipes.push({ x: W + 28, gapY, gap, scored: false });
    }
    function draw() {
      info.textContent = `Score ${score}   ·   Best ${best}   ·   Gates ${passed}`;
      flapButton.textContent =
        mode === 'ready'
          ? 'Take flight'
          : mode === 'over'
            ? 'Try again'
            : 'Flap';
      flapButton.disabled = mode === 'paused';
      pause.disabled = mode !== 'playing' && mode !== 'paused';
      pause.textContent = mode === 'paused' ? 'Resume' : 'Pause';
      status.textContent =
        flash > 0
          ? perfect
            ? 'Perfect flight! +2'
            : 'Through the gate! +1'
          : 'Tap or Space to flap · aim for the dotted center';
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#b4e5f3');
      sky.addColorStop(1, '#edf5d6');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff99';
      for (let i = 0; i < 5; i++) {
        const cx = ((((i * 110 - distance * 0.18) % 500) + 500) % 500) - 60;
        ctx.beginPath();
        ctx.ellipse(cx, 55 + (i % 3) * 55, 35, 13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of pipes) {
        ctx.fillStyle = '#2d9483';
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
        ctx.fillRect(p.x, p.gapY + p.gap, PIPE_W, H - p.gapY - p.gap);
        ctx.fillStyle = '#60cbb0';
        ctx.fillRect(p.x - 4, p.gapY - 18, PIPE_W + 8, 18);
        ctx.fillRect(p.x - 4, p.gapY + p.gap, PIPE_W + 8, 18);
        if (!p.scored) {
          ctx.strokeStyle = '#287b7977';
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(p.x, p.gapY + p.gap / 2);
          ctx.lineTo(p.x + PIPE_W, p.gapY + p.gap / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.fillStyle = '#d4bb87';
      ctx.fillRect(0, H - 24, W, 24);
      ctx.fillStyle = '#88b973';
      ctx.fillRect(0, H - 28, W, 5);
      ctx.save();
      ctx.translate(X, y);
      ctx.rotate(Math.max(-0.4, Math.min(0.8, velocity / 500)));
      ctx.fillStyle = '#ffc85c';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e9a346';
      ctx.beginPath();
      ctx.ellipse(-6, 3, 7, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(6, -4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#183642';
      ctx.beginPath();
      ctx.arc(8, -4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f47b52';
      ctx.fillRect(10, 1, 10, 4);
      ctx.restore();
      if (mode !== 'playing')
        canvasOverlay(
          ctx,
          mode === 'ready'
            ? 'Small wings. Big adventure.'
            : mode === 'paused'
              ? 'Flight paused'
              : `${passed >= 20 ? 'Gold' : passed >= 10 ? 'Silver' : passed >= 5 ? 'Bronze' : 'Keep flying'} · ${score} points`,
          mode === 'over'
            ? 'Tap to get ready for another flight'
            : mode === 'paused'
              ? 'Press Resume to continue'
              : 'Tap the sky to begin'
        );
    }
    const loop = new GameLoop((dt) => {
      if (mode !== 'playing') return;
      const speed = Math.min(170, 110 + passed * 2);
      distance += speed * dt;
      flash = Math.max(0, flash - dt);
      velocity += 650 * dt;
      y += velocity * dt;
      for (const p of pipes) p.x -= speed * dt;
      if (!pipes.length || pipes.at(-1)!.x < W - 190) spawn();
      for (const p of pipes) {
        if (
          X + R > p.x - 4 &&
          X - R < p.x + PIPE_W + 4 &&
          (y - R < p.gapY || y + R > p.gapY + p.gap)
        )
          mode = 'over';
        if (!p.scored && p.x + PIPE_W + 4 < X - R && mode === 'playing') {
          p.scored = true;
          passed++;
          perfect = Math.abs(y - (p.gapY + p.gap / 2)) < 24;
          score += perfect ? 2 : 1;
          flash = 1.2;
          best = Math.max(best, score);
          storage.save('best', best);
        }
      }
      pipes = pipes.filter((p) => p.x > -PIPE_W - 10);
      if (y - R < 0 || y + R > H - 28) mode = 'over';
      draw();
    });
    const tapOff = bindTap(canvas, flap);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) flap();
      }
      if (e.key === 'p' && !e.repeat) pause.click();
    };
    const hidden = () => {
      if (document.hidden && mode === 'playing') {
        mode = 'paused';
        draw();
      }
    };
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hidden);
    draw();
    loop.start();
    const off = exposeGame(
      () => ({
        game: 'flappy',
        mode,
        bird: { x: X, y, radius: R, velocity },
        pipes,
        score,
        passed
      }),
      (ms) => loop.advance(ms)
    );
    return () => {
      loop.stop();
      tapOff();
      off();
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
    };
  }
};
export default flappy;
