import { GameModule } from './gameTypes';
import { createGameCanvas } from '../core/pixi/scene';
import { FlappyView } from './views/flappy';
import { createGameShell, createTouchButton, bindTap } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import { Mode, exposeGame, message } from '../core/play';
import {
  FLIGHT,
  FLIGHT_STEP,
  advanceFlight,
  planFlight,
  type FlightPipe
} from './flappyFlight';

const { width: W, height: H, birdX: X, radius: R } = FLIGHT;
const flappy: GameModule = {
  id: 'flappy',
  name: 'Flappy Bird',
  icon: '🐤',
  description: 'Find the perfect flight. Thread the gaps for bonus points.',
  mount(root, goBack, player) {
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
    let flightVersion = 0;
    let flightClock = 0;
    const controls = document.createElement('div');
    controls.className = 'control-row';
    const flapButton = createTouchButton('Take flight', () => input.human('flap'));
    const pause = createTouchButton('Pause', () => {
      if (mode === 'playing') pauseFlight();
      else if (mode === 'paused') resumeFlight();
      draw();
    });
    controls.append(flapButton, pause);
    area.append(controls);
    function reset() {
      flightVersion++;
      flightClock = 0;
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
    function pauseFlight() {
      if (mode === 'playing') mode = 'paused';
      // Pausing invalidates the controller's old trajectory.
      flightVersion++;
      draw();
    }
    function resumeFlight() {
      if (mode === 'paused') mode = 'playing';
      draw();
    }
    function stepFlight(dt: number) {
      const result = advanceFlight({ y, velocity, pipes, passed }, dt);
      ({ y, velocity, pipes, passed } = result.state);
      distance += result.distance;
      flash = Math.max(0, flash - dt);
      if (!result.alive) mode = 'over';
      for (perfect of result.gates) {
        score += perfect ? 2 : 1;
        flash = 1.2;
        best = Math.max(best, score);
        storage.save('best', best);
      }
      if (!pipes.length || pipes.at(-1)!.x < W - 190) spawn();
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
        flightClock += dt;
        stepFlight(dt);
        draw();
      },
      0.05,
      (dt) => view.tick(mode === 'paused' ? 0 : dt)
    );
    const tapOff = bindTap(canvas, () => input.human('flap'));
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) input.human('flap');
      }
      if (e.key === 'p' && !e.repeat) pause.click();
    };
    const hidden = () => {
      if (document.hidden && mode === 'playing') {
        pauseFlight();
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
        distance,
        score,
        passed,

      }),
      (ms) => loop.advance(ms)
    );
    const decisionKey = () => `${flightVersion}:${Math.floor(flightClock / FLIGHT_STEP)}`;
    const input = player.connect<'flap' | 'wait'>({
      game: 'flappy',
      planning: () => mode === 'playing' ? { game: 'flappy', epoch: String(flightVersion), time: flightClock, y, velocity, pipes, passed } : null,
      observe: () => {
        if (mode !== 'playing') return null;
        const plan = planFlight(y, velocity, pipes, passed);
        return {
          key: decisionKey(), context: plan.context,
          question: 'Which safe flight action ends closest to the gap center?',
          choices: plan.choices, inputs: { '0': 'flap', '1': 'wait' },
        };
      },
      isCurrent: key => key === decisionKey(),
      apply: action => {
        if (mode === 'paused') return false;
        if (action === 'flap') { flap(); return true; }
        return mode === 'playing';
      },
      start: () => {
        if (mode === 'over') reset();
        if (mode === 'paused') resumeFlight();
        else if (mode === 'ready') flap();
        draw();
      },
      pause: pauseFlight, resume: resumeFlight,
      isFinished: () => mode === 'over', isPaused: () => mode === 'paused',
    });
    return () => {
      loop.stop();
      view.dispose();
      input.dispose();
      tapOff();
      off();
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
    };
  }
};
export default flappy;
