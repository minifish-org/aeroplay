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
  FLIGHT_TICK,
  WATCH_SPEED,
  advanceFlight,
  predictFlight,
  planFlight,
  type FlightPipe
} from './flappyFlight';

const { width: W, height: H, birdX: X, radius: R } = FLIGHT;
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
    let flightClock = 0;
    let queuedFlight: { turn: number; choice: string } | null = null;
    let appliedFlights = 0;
    let missedFlights = 0;
    const controls = document.createElement('div');
    controls.className = 'control-row';
    const flapButton = createTouchButton('Take flight', flap);
    const pause = createTouchButton('Pause', () => {
      if (mode === 'playing') pauseFlight();
      else if (mode === 'paused') resumeFlight();
      draw();
    });
    controls.append(flapButton, pause);
    area.append(controls);
    function reset() {
      flightVersion++;
      flightRemaining = 0;
      flightTurn = 0;
      flightClock = 0;
      queuedFlight = null;
      appliedFlights = 0;
      missedFlights = 0;
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
      // Keep an already accepted plan, but invalidate any outstanding reply.
      flightVersion++;
      draw();
    }
    function resumeFlight() {
      if (!isLayaControlling()) {
        queuedFlight = null;
        flightClock = 0;
        flightVersion++;
      }
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
    function nextFlight() {
      flightTurn++;
      const action = queuedFlight;
      queuedFlight = null;
      // Missing or late answers never hold the animation or invent an action.
      if (
        action?.turn === flightTurn &&
        Object.hasOwn(planFlight(y, velocity, pipes, passed).choices, action.choice)
      ) {
        if (action.choice === '0') flap();
        appliedFlights++;
      } else {
        missedFlights++;
      }
      flightRemaining = FLIGHT_STEP;
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
          flightClock += dt * WATCH_SPEED;
          while (mode === 'playing') {
            const slice = Math.min(FLIGHT_TICK, flightRemaining);
            if (flightClock + 1e-9 < slice) break;
            flightClock = Math.max(0, flightClock - slice);
            flightRemaining = Math.max(0, flightRemaining - slice);
            stepFlight(slice);
            if (flightRemaining < 1e-9 && mode === 'playing') nextFlight();
          }
        } else {
          stepFlight(dt);
        }
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
        laya: isLayaControlling()
          ? {
              turn: flightTurn,
              thinking: mode === 'playing' && queuedFlight === null,
              queued: queuedFlight?.choice ?? null,
              applied: appliedFlights,
              missed: missedFlights
            }
          : undefined
      }),
      (ms) => loop.advance(ms)
    );
    const decisionKey = () => `${flightVersion}:${flightTurn + 1}`;
    const futurePlan = () => {
      const future = predictFlight({ y, velocity, pipes, passed }, flightRemaining);
      return (
        future &&
        planFlight(future.y, future.velocity, future.pipes, future.passed)
      );
    };
    const layaOff = registerLayaGame({
      game: 'flappy',
      observe: () => {
        if (mode !== 'playing' || queuedFlight) return null;
        const plan = futurePlan();
        if (!plan) return null;
        return {
          key: decisionKey(),
          context: plan.context,
          question: 'Which flight action ends closest to the gap center?',
          choices: plan.choices
        };
      },
      act: (choice, key) => {
        if (
          mode !== 'playing' ||
          !isLayaControlling() ||
          key !== decisionKey() ||
          queuedFlight
        )
          return false;
        const plan = futurePlan();
        if (!plan || !Object.hasOwn(plan.choices, choice)) return false;
        queuedFlight = { turn: flightTurn + 1, choice };
        return true;
      },
      start: () => {
        if (mode === 'over') reset();
        if (flightRemaining <= 0) flightRemaining = FLIGHT_STEP;
        if (mode === 'paused') mode = 'playing';
        else if (mode === 'ready') {
          flap();
        }
        draw();
      },
      pause: pauseFlight,
      resume: resumeFlight,
      isFinished: () => mode === 'over',
      isPaused: () => mode === 'paused',
      intervalMs: 0,
      assistance:
        'Flight predictions help Laya plan ahead while the bird keeps flying.'
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
