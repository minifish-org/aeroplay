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
export const flightSpeed = (passed: number) => Math.min(170, 110 + passed * 2);
export function flightCollision(y: number, pipes: FlightPipe[], margin = 0) {
  const radius = FLIGHT.radius + margin;
  if (y - radius < 0 || y + radius > FLIGHT.ground) return true;
  return pipes.some(
    (pipe) =>
      FLIGHT.birdX + FLIGHT.radius > pipe.x - 4 &&
      FLIGHT.birdX - FLIGHT.radius < pipe.x + FLIGHT.pipeWidth + 4 &&
      (y - radius < pipe.gapY || y + radius > pipe.gapY + pipe.gap)
  );
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
    if (
      !pipe.scored &&
      pipe.x + FLIGHT.pipeWidth + 4 < FLIGHT.birdX - FLIGHT.radius &&
      alive
    ) {
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
    if (!result.alive) return null;
    remaining -= dt;
  }
  return future;
}

export function planFlight(
  y: number,
  velocity: number,
  pipes: FlightPipe[],
  passed: number
) {
  const pipe = pipes.find(
    (candidate) =>
      candidate.x + FLIGHT.pipeWidth + 4 >= FLIGHT.birdX - FLIGHT.radius
  );
  const target = pipe ? pipe.gapY + pipe.gap / 2 : FLIGHT.height / 2;
  const speed = flightSpeed(passed);
  const outcomes = ['0', '1'].map((choice) => {
    const initialVelocity = choice === '0' ? FLIGHT.flapVelocity : velocity;
    const height =
      y +
      initialVelocity * FLIGHT_STEP +
      (FLIGHT.gravity / 2) * FLIGHT_STEP ** 2;
    // A flap cannot be undone before its apex; check that entire upward arc.
    const horizon = Math.max(FLIGHT_STEP, -initialVelocity / FLIGHT.gravity);
    let safe = true;
    for (let t = 0; t <= horizon + 1 / 120; t += 1 / 120) {
      const elapsed = Math.min(t, horizon);
      const projected =
        y + initialVelocity * elapsed + (FLIGHT.gravity / 2) * elapsed ** 2;
      if (
        flightCollision(
          projected,
          pipes.map((p) => ({ ...p, x: p.x - speed * elapsed })),
          4
        )
      ) {
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
      .map(
        (outcome) =>
          `${outcome.choice === '0' ? 'Flap' : 'Wait'}: ${outcome.safe ? 'safe' : 'unsafe'}, ${outcome.distance === closest ? 'closest to the gap center' : 'farther from the gap center'}.`
      )
      .join(' '),
    choices: Object.fromEntries(
      outcomes.map((outcome) => [
        outcome.choice,
        outcome.choice === '0' ? 'Flap' : 'Wait'
      ])
    )
  };
}
