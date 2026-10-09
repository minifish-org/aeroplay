import { GameModule } from './gameTypes';
import { createGameCanvas } from '../core/pixi/scene';
import { FlappyView } from './views/flappy';
import { createGameShell, createTouchButton, bindTap } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import { isLayaControlling, registerLayaGame } from '../core/laya-bridge';
import { Mode, exposeGame, message } from '../core/play';
import {
  FLIGHT,
  FLIGHT_STEP,
  WATCH_SPEED,
  flightCollision,
  flightSpeed,
  planFlight,
  type FlightPipe
} from './flappyFlight';

const { width: W, height: H, birdX: X, radius: R, pipeWidth: PIPE_W } = FLIGHT;
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
    let pipes: FlightPipe[] = [],
      mode: Mode = 'ready';
    let distance = 0,
      flash = 0,
      perfect = false;
    let flightRemaining = 0;
    let flightTurn = 0;
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
      flightRemaining = 0;
      flightTurn = 0;
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
      velocity = FLIGHT.flapVelocity;
      view.flap();
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
        if (isLayaControlling()) {
          if (flightRemaining <= 0) return;
          dt = Math.min(dt * WATCH_SPEED, flightRemaining);
          flightRemaining = Math.max(0, flightRemaining - dt);
          if (flightRemaining < 1e-9) {
            flightRemaining = 0;
            flightTurn++;
          }
        }
        const speed = flightSpeed(passed);
        distance += speed * dt;
        flash = Math.max(0, flash - dt);
        velocity += FLIGHT.gravity * dt;
        y += velocity * dt;
        for (const p of pipes) p.x -= speed * dt;
        if (!pipes.length || pipes.at(-1)!.x < W - 190) spawn();
        if (flightCollision(y, pipes)) mode = 'over';
        for (const p of pipes) {
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
        visual: view.snapshot(),
        mode,
        bird: { x: X, y, radius: R, velocity },
        pipes,
        score,
        passed,
        laya: isLayaControlling()
          ? {
              turn: flightTurn,
              thinking: mode === 'playing' && flightRemaining === 0
            }
          : undefined
      }),
      (ms) => loop.advance(ms)
    );
    const decisionKey = () => `${flightVersion}:${flightTurn}`;
    const layaOff = registerLayaGame({
      game: 'flappy',
      observe: () => {
        if (mode !== 'playing' || flightRemaining > 0) return null;
        const plan = planFlight(y, velocity, pipes, passed);
        return {
          key: decisionKey(),
          context: plan.context,
          question: 'Which flight action ends closest to the gap center?',
          choices: plan.choices
        };
      },
      act: (choice, key) => {
        if (mode !== 'playing' || key !== decisionKey() || flightRemaining > 0)
          return false;
        if (
          !Object.hasOwn(planFlight(y, velocity, pipes, passed).choices, choice)
        )
          return false;
        if (choice === '0') flap();
        else if (choice !== '1') return false;
        flightRemaining = FLIGHT_STEP;
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
        'Flight predictions help Laya choose each move. Flight pauses while it thinks.'
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
