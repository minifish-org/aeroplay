import { GameModule } from './gameTypes';
import { createGameCanvas } from '../core/pixi/scene';
import { FlappyView } from './views/flappy';
import { createGameShell, createTouchButton, bindTap } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import { isLayaControlling, registerLayaGame } from '../core/laya-bridge';
import { Mode, exposeGame, message } from '../core/play';

type Pipe = { x: number; gapY: number; gap: number; scored: boolean };
const W = 360,
  H = 480,
  X = 82,
  R = 12,
  PIPE_W = 54;
const flappy: GameModule = {
  id: 'flappy',
  name: 'Flappy Bird',
  icon: '🐤',
  description: 'Find the perfect flight. Thread the gaps for bonus points.',
  mount(root, goBack) {
    const storage = namespace('flappy');
    const { area } = createGameShell(root, 'Flappy Bird', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const canvas = createGameCanvas(W, H);
    canvas.className = 'game-canvas flappy-canvas';
    area.append(info, canvas);
    const status = message(
      area,
      'Tap the sky or press Space. Fly through the center for +2.'
    );
    const view = new FlappyView(canvas);
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
    let flightTime = 0;
    let flightVersion = 0;
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
      flightVersion++;
      flightTime = 0;
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
      view.draw(y, velocity, pipes, distance, mode, score, perfect);
    }
    const loop = new GameLoop(
      (dt) => {
        if (mode !== 'playing') return;
        if (isLayaControlling()) dt *= 0.18;
        flightTime += dt;
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
      },
      0.05,
      (dt) => view.tick(mode === 'paused' ? 0 : dt)
    );
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
    const decisionKey = () =>
      `${flightVersion}:${Math.floor(flightTime / 0.12)}`;
    const layaOff = registerLayaGame({
      game: 'flappy',
      observe: () => {
        if (mode !== 'playing') return null;
        const pipe = pipes.find(
          (candidate) => candidate.x + PIPE_W + 4 >= X - R
        );
        const target = pipe ? pipe.gapY + pipe.gap / 2 : H / 2;
        const waitY = Math.round(y + velocity * 0.12 + 325 * 0.12 ** 2);
        const flapY = Math.round(y - 235 * 0.12 + 325 * 0.12 ** 2);
        return {
          key: decisionKey(),
          context: `Bird height y=${Math.round(y)}; velocity=${Math.round(velocity)} (positive falls). Ceiling y=12; ground y=440. Target center y=${Math.round(target)}. ${pipe ? `Next gap top=${Math.round(pipe.gapY + R)}, bottom=${Math.round(pipe.gapY + pipe.gap - R)}, horizontal distance=${Math.max(0, Math.round(pipe.x - X))}.` : ''} In 0.12 seconds, waiting gives y=${waitY}; flapping gives y=${flapY}. Smaller y is higher.`,
          question:
            'Should the bird flap or wait to stay near the gap center and avoid the ceiling and ground?',
          choices: { '0': 'Flap upward now', '1': 'Wait and keep flying' }
        };
      },
      act: (choice, key) => {
        if (mode !== 'playing' || key !== decisionKey()) return false;
        if (choice === '0') flap();
        else if (choice !== '1') return false;
        return true;
      },
      start: () => {
        if (mode === 'over') reset();
        if (mode === 'paused') mode = 'playing';
        else if (mode === 'ready') flap();
        draw();
      },
      pause: () => {
        if (mode === 'playing') mode = 'paused';
        draw();
      },
      resume: () => {
        if (mode === 'paused') mode = 'playing';
        draw();
      },
      isFinished: () => mode === 'over',
      isPaused: () => mode === 'paused',
      intervalMs: 40,
      assistance:
        'Watch mode runs at 18% speed. Short-term heights are calculated; Laya chooses flap or wait.'
    });
    return () => {
      loop.stop();
      view.dispose();
      layaOff();
      tapOff();
      off();
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
    };
  }
};
export default flappy;
