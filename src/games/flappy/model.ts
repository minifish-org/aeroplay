export type FlightPipe = {
  x: number;
  gapY: number;
  gap: number;
  scored: boolean;
};
export const FLIGHT = {
  width: 360,
  height: 480,
  birdX: 82,
  radius: 12,
  pipeWidth: 54,
  gravity: 650,
  flapVelocity: -235,
  ground: 452
};
export const FLIGHT_STEP = 0.16;
export const FLIGHT_TICK = 1 / 120;
export type FlightMotion = {
  y: number;
  velocity: number;
  pipes: FlightPipe[];
  passed: number;
};
type SavedFlight = FlightMotion & {
  version: 1;
  mode: 'playing' | 'paused' | 'over';
  score: number;
  distance: number;
  time: number;
  perfect: boolean;
};
export const flightSpeed = (passed: number) => Math.min(170, 110 + passed * 2);
export function flightCollision(y: number, pipes: FlightPipe[], margin = 0) {
  const radius = FLIGHT.radius + margin;
  if (y - radius < 0 || y + radius > FLIGHT.ground)
    return true;
  return pipes.some((pipe) => FLIGHT.birdX + FLIGHT.radius > pipe.x - 4 &&
    FLIGHT.birdX - FLIGHT.radius < pipe.x + FLIGHT.pipeWidth + 4 &&
    (y - radius < pipe.gapY || y + radius > pipe.gapY + pipe.gap));
}
/** The same physics step is used by live flight and its future observation. */
export function advanceFlight(state: FlightMotion, dt: number) {
  const distance = flightSpeed(state.passed) * dt;
  const velocity = state.velocity + FLIGHT.gravity * dt;
  const y = state.y + velocity * dt;
  const pipes = state.pipes.map((pipe) => ({ ...pipe, x: pipe.x - distance }));
  const alive = !flightCollision(y, pipes);
  const gates: boolean[] = [];
  for (const pipe of pipes) {
    if (!pipe.scored &&
      pipe.x + FLIGHT.pipeWidth + 4 < FLIGHT.birdX - FLIGHT.radius &&
      alive) {
      pipe.scored = true;
      gates.push(Math.abs(y - (pipe.gapY + pipe.gap / 2)) < 24);
    }
  }
  return {
    state: {
      y,
      velocity,
      pipes: pipes.filter((pipe) => pipe.x > -FLIGHT.pipeWidth - 10),
      passed: state.passed + gates.length
    },
    distance,
    alive,
    gates
  };
}
export function predictFlight(state: FlightMotion, remaining: number) {
  let future = state;
  while (remaining > 1e-9) {
    const dt = Math.min(FLIGHT_TICK, remaining);
    const result = advanceFlight(future, dt);
    future = result.state;
    if (!result.alive)
      return null;
    remaining -= dt;
  }
  return future;
}
export function planFlight(y: number, velocity: number, pipes: FlightPipe[], passed: number) {
  const pipe = pipes.find((candidate) => candidate.x + FLIGHT.pipeWidth + 4 >= FLIGHT.birdX - FLIGHT.radius);
  const target = pipe ? pipe.gapY + pipe.gap / 2 : FLIGHT.height / 2;
  const speed = flightSpeed(passed);
  const outcomes = ['0', '1'].map((choice) => {
    const initialVelocity = choice === '0' ? FLIGHT.flapVelocity : velocity;
    const height = y +
      initialVelocity * FLIGHT_STEP +
      (FLIGHT.gravity / 2) * FLIGHT_STEP ** 2;
    // A flap cannot be undone before its apex; check that entire upward arc.
    const horizon = Math.max(FLIGHT_STEP, -initialVelocity / FLIGHT.gravity);
    let safe = true;
    for (let t = 0; t <= horizon + 1 / 120; t += 1 / 120) {
      const elapsed = Math.min(t, horizon);
      const projected = y + initialVelocity * elapsed + (FLIGHT.gravity / 2) * elapsed ** 2;
      if (flightCollision(projected, pipes.map((p) => ({ ...p, x: p.x - speed * elapsed })), 4)) {
        safe = false;
        break;
      }
    }
    return { choice, height, distance: Math.abs(height - target), safe };
  });
  const safe = outcomes.filter((outcome) => outcome.safe);
  const closest = Math.min(...(safe.length ? safe : outcomes).map((outcome) => outcome.distance));
  return {
    target,
    outcomes,
    context: outcomes
      .map((outcome) => `${outcome.choice === '0' ? 'Flap' : 'Wait'}: ${outcome.safe ? 'safe' : 'unsafe'}, ${outcome.distance === closest ? 'closest to the gap center' : 'farther from the gap center'}.`)
      .join(' '),
    choices: Object.fromEntries(outcomes.map((outcome) => [
      outcome.choice,
      outcome.choice === '0' ? 'Flap' : 'Wait'
    ]))
  };
}
export function createFlappyModel(best = 0, random = Math.random) {
  let visibleWidth = FLIGHT.width;
  const model = {
    mode: 'ready' as 'ready' | 'playing' | 'paused' | 'over',
    y: FLIGHT.height / 2, velocity: 0, pipes: [] as FlightPipe[], passed: 0,
    score: 0, best: Math.max(0, best), distance: 0, time: 0, epoch: 0,
    perfect: false, flash: 0, serial: 0, event: '' as '' | 'flap' | 'score' | 'hit',
    setVisibleWidth(width: number) { if (Number.isFinite(width))
      visibleWidth = Math.max(FLIGHT.width, Math.min(1800, width)); },
    spawn(x = FLIGHT.width + 28, passed?: number) {
      const gap = Math.max(142, 200 - (passed ?? model.passed) * 3);
      const previous = model.pipes.at(-1)?.gapY ?? (FLIGHT.height - gap) / 2;
      const gapY = Math.max(48, Math.min(FLIGHT.height - 32 - gap - 48, previous + (random() - 0.5) * 130));
      model.pipes.push({ x, gapY, gap, scored: false });
    },
    reset() {
      model.epoch++;
      model.time = 0;
      model.mode = 'ready';
      model.y = FLIGHT.height / 2;
      model.velocity = 0;
      model.score = 0;
      model.passed = 0;
      model.pipes = [];
      model.distance = 0;
      model.flash = 0;
      model.perfect = false;
      model.event = '';
      model.serial++;
    },
    act(input: unknown) {
      if (input === 'retry' || input === 'restart') {
        model.reset();
        return true;
      }
      if (model.mode === 'paused')
        return false;
      if (input === 'wait')
        return model.mode === 'playing';
      if (input !== 'flap')
        return false;
      if (model.mode === 'over') {
        model.reset();
      }
      if (model.mode === 'ready') {
        model.mode = 'playing';
        model.spawn();
      }
      model.velocity = FLIGHT.flapVelocity;
      model.event = 'flap';
      model.serial++;
      return true;
    },
    step(dt: number) {
      if (model.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0)
        return;
      let remaining = dt;
      while (remaining > 1e-9 && model.mode === 'playing') {
        const tick = Math.min(FLIGHT_TICK, remaining);
        remaining -= tick;
        model.time += tick;
        const result = advanceFlight(model, tick);
        Object.assign(model, result.state);
        model.distance += result.distance;
        model.flash = Math.max(0, model.flash - tick);
        if (!result.alive) {
          model.mode = 'over';
          model.event = 'hit';
          model.serial++;
        }
        for (const perfect of result.gates) {
          model.perfect = perfect;
          model.score += perfect ? 2 : 1;
          model.flash = 0.4;
          model.best = Math.max(model.best, model.score);
          model.event = 'score';
          model.serial++;
        }
        if (!model.pipes.length || model.pipes.at(-1)!.x < FLIGHT.width - 190)
          model.spawn();
        while (model.pipes.at(-1)!.x < visibleWidth - 190) {
          const upcoming = model.pipes.filter(pipe => !pipe.scored).length;
          model.spawn(model.pipes.at(-1)!.x + 218, model.passed + Math.max(0, upcoming - 1));
        }
      }
    },
    pause() { if (model.mode === 'playing') {
      model.mode = 'paused';
      model.epoch++;
    } },
    resume() { if (model.mode === 'paused')
      model.mode = 'playing'; },
    savedRun(): SavedFlight | null {
      if (model.mode === 'ready')
        return null;
      return { version: 1, mode: model.mode, y: model.y, velocity: model.velocity, pipes: model.pipes.map(pipe => ({ ...pipe })), passed: model.passed, score: model.score, distance: model.distance, time: model.time, perfect: model.perfect };
    },
    restore(raw: unknown) {
      if (!raw || typeof raw !== 'object')
        return false;
      const run = raw as SavedFlight;
      const finite = (value: number, low: number, high: number) => Number.isFinite(value) && value >= low && value <= high;
      if (run.version !== 1 || !['playing', 'paused', 'over'].includes(run.mode) ||
        !finite(run.y, -50, FLIGHT.height + 50) || !finite(run.velocity, -1000, 2000) ||
        !Number.isInteger(run.passed) || !finite(run.passed, 0, 1e7) ||
        !Number.isInteger(run.score) || !finite(run.score, run.passed, run.passed * 2) ||
        !finite(run.distance, 0, 1e10) || !finite(run.time, 0, 1e8) || typeof run.perfect !== 'boolean' ||
        !Array.isArray(run.pipes) || run.pipes.length < 1 || run.pipes.length > 12 ||
        !run.pipes.every(pipe => pipe && typeof pipe === 'object' && finite(pipe.x, -80, 2300) && finite(pipe.gap, 142, 200) && finite(pipe.gapY, 0, FLIGHT.ground - pipe.gap) && typeof pipe.scored === 'boolean'))
        return false;
      Object.assign(model, { y: run.y, velocity: run.velocity, pipes: run.pipes.map(pipe => ({ ...pipe })), passed: run.passed, score: run.score, distance: run.distance, time: run.time, perfect: run.perfect, mode: run.mode === 'over' ? 'over' : 'paused', event: '', flash: 0 });
      model.best = Math.max(model.best, model.score);
      model.epoch++;
      model.serial++;
      return true;
    },
    saved() { return { best: model.best }; },
    snapshot() {
      return { game: 'flappy', mode: model.mode, bird: { x: FLIGHT.birdX, y: model.y, radius: FLIGHT.radius, velocity: model.velocity },
        pipes: model.pipes.map(pipe => ({ ...pipe })), distance: model.distance, score: model.score,
        passed: model.passed, best: model.best, time: model.time, epoch: model.epoch };
    },
    planning() {
      return model.mode === 'playing' ? { game: 'flappy' as const, epoch: String(model.epoch), time: model.time,
        y: model.y, velocity: model.velocity, pipes: model.pipes.map(pipe => ({ ...pipe })), passed: model.passed } : null;
    },
    summary() { return { score: model.score, best: model.best, gates: model.passed, perfect: model.perfect }; }
  };
  model.reset();
  return model;
}
export type FlappyModel = ReturnType<typeof createFlappyModel>;
