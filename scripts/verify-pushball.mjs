import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: "export * from './src/games/pushball/model'; export * from './src/games/pushball/policy'; export * from './src/core/ai-planning-state';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const idle = api.idleAction;
function playing() { const state = api.createMatch(); state.mode = 'playing'; state.kickoff = 0; return state; }
function advance(state, actions, duration) {
  for (let time = 0; time < duration - 0.000001; time += 1 / 120) {
    const dt = Math.min(1 / 120, duration - time);
    api.stepMatch(state, actions.map(action => ({ ...action, dash: time === 0 && action.dash })), dt);
  }
}
let checks = 0;
function check(name, fn) { fn(); ++checks; console.log(`PASS ${name}`); }
check('Ready, paused and finished states freeze physics', () => {
  for (const mode of ['ready', 'paused', 'over']) {
    const state = playing(); state.mode = mode; const before = structuredClone(state);
    api.stepMatch(state, [{ x: 1, y: 1, dash: true }, idle()], 0.05);
    assert.deepEqual(state, before);
  }
});
check('Both sides have identical movement speed and diagonal limits', () => {
  const state = playing(); const before = structuredClone(state.robots);
  advance(state, [{ x: 1, y: 0, dash: false }, { x: 1, y: 1, dash: false }], 0.5);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert(Math.abs(distance(state.robots[0], before[0]) - api.MOVE_SPEED * 0.5) < 1e-8);
  assert(Math.abs(distance(state.robots[1], before[1]) - api.MOVE_SPEED * 0.5) < 1e-8);
  assert.deepEqual(api.normalizeAction({ x: NaN, y: Infinity, dash: false }), idle());
});
check('Dash starts in the chosen direction and cannot bypass cooldown', () => {
  const state = playing();
  advance(state, [{ x: 1, y: 0, dash: true }, idle()], 0.1);
  assert(state.robots[0].x > 0.8); assert.equal(state.robots[0].y, 5.5);
  assert(state.robots[0].cooldown > 2.6);
  advance(state, [{ x: 1, y: 0, dash: true }, idle()], 0.25);
  assert.equal(state.robots[0].dashLeft, 0);
  assert(state.robots[0].cooldown < 2.5);
});
check('Robots remain inside walls and separate without NaN', () => {
  const state = playing();
  state.robots[0].x = state.robots[1].x = 0; state.robots[0].y = state.robots[1].y = 3;
  advance(state, [idle(), idle()], 0.05);
  assert(Math.hypot(state.robots[0].x - state.robots[1].x, state.robots[0].y - state.robots[1].y) >= 1.43);
  for (let i = 0; i < 300; i++) api.stepMatch(state, [{ x: 1, y: 1, dash: false }, idle()], 1 / 60);
  assert(state.robots[0].x <= api.FIELD.width / 2 - api.ROBOT_RADIUS);
  assert(state.robots[0].y <= api.FIELD.length / 2 - api.ROBOT_RADIUS);
});
check('Four corners have continuous curved walls, including old square-corner positions', () => {
  const radius = api.FIELD.cornerRadius ?? 2.4;
  const cx = api.FIELD.width / 2 - radius, cy = api.FIELD.length / 2 - radius;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const state = playing();
    state.ball = { x: sx * (api.FIELD.width / 2 - api.BALL_RADIUS),
      y: sy * (api.FIELD.length / 2 - api.BALL_RADIUS), vx: 0, vy: 0 };
    advance(state, [idle(), idle()], 1 / 120);
    assert(Math.hypot(Math.abs(state.ball.x) - cx, Math.abs(state.ball.y) - cy) <= radius - api.BALL_RADIUS + 1e-8,
      `${sx},${sy}: ball cannot occupy an unreachable square pocket`);
    state.robots[0].x = sx * 5.28; state.robots[0].y = sy * 8.28;
    advance(state, [idle(), idle()], 1 / 120);
    assert(Math.hypot(Math.abs(state.robots[0].x) - cx, Math.abs(state.robots[0].y) - cy) <= radius - api.ROBOT_RADIUS + 1e-8);
  }
});
check('Either robot can release a stationary ball along every curved corner', () => {
  const radius = api.FIELD.cornerRadius ?? 2.4;
  const cx = api.FIELD.width / 2 - radius, cy = api.FIELD.length / 2 - radius;
  const ballOrbit = radius - api.BALL_RADIUS, robotOrbit = radius - api.ROBOT_RADIUS;
  const contact = api.BALL_RADIUS + api.ROBOT_RADIUS;
  const angle = Math.PI / 4;
  const offset = Math.acos((ballOrbit ** 2 + robotOrbit ** 2 - contact ** 2) / (2 * ballOrbit * robotOrbit));
  for (const side of [0, 1]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const direction of [-1, 1]) {
    const state = playing();
    const start = { x: sx * (cx + ballOrbit * Math.cos(angle)), y: sy * (cy + ballOrbit * Math.sin(angle)) };
    state.ball = { ...start, vx: 0, vy: 0 };
    const from = angle - direction * offset;
    state.robots[side].x = sx * (cx + robotOrbit * Math.cos(from));
    state.robots[side].y = sy * (cy + robotOrbit * Math.sin(from));
    const action = { x: -sx * Math.sin(from) * direction, y: sy * Math.cos(from) * direction, dash: false };
    advance(state, side === 0 ? [action, idle()] : [idle(), action], 0.8);
    assert(Math.hypot(state.ball.x - start.x, state.ball.y - start.y) > 0.8,
      `${side}:${sx},${sy}:${direction}: ordinary tangential movement frees the ball`);
    assert.deepEqual(state.score, [0, 0]);
  }
});
check('Moving robots transfer momentum to the ball; walls bounce and drag slows it', () => {
  const state = playing(); state.robots[0].y = 1.3;
  advance(state, [{ x: 0, y: -1, dash: false }, idle()], 0.1);
  assert(state.ball.vy < -1);
  state.ball = { x: 5.5, y: 0, vx: 8, vy: 0 };
  advance(state, [idle(), idle()], 0.05); assert(state.ball.vx < 0);
  const speed = Math.abs(state.ball.vx); advance(state, [idle(), idle()], 0.1);
  assert(Math.abs(state.ball.vx) < speed);
});
check('Only goal mouths score; scoring resets positions and first to three wins', () => {
  const wall = playing(); wall.ball = { x: 4, y: -8.5, vx: 0, vy: -8 };
  advance(wall, [idle(), idle()], 0.2); assert.deepEqual(wall.score, [0, 0]); assert(wall.ball.vy > 0);
  for (const side of [0, 1]) {
    const state = playing();
    for (let goal = 1; goal <= 3; goal++) {
      state.kickoff = 0; state.ball = { x: 0, y: side === 0 ? -9.3 : 9.3, vx: 0, vy: side === 0 ? -8 : 8 };
      advance(state, [idle(), idle()], 0.05);
      assert.equal(state.score[side], goal); assert.equal(state.goalSerial, goal);
      assert.deepEqual(state.ball, { x: 0, y: 0, vx: 0, vy: 0 });
    }
    assert.equal(state.mode, 'over'); assert.equal(state.winner, side);
  }
});
function snapshot(state, side = 1) { return { game: 'pushball', epoch: 'match:0', side, snapshot: api.observeMatch(state), control: idle(), controlUntil: 0 }; }
check('Wall-release candidates use ordinary guarded inputs to free all four corners', () => {
  const radius = api.FIELD.cornerRadius;
  const cx = api.FIELD.width / 2 - radius, cy = api.FIELD.length / 2 - radius;
  const ballOrbit = radius - api.BALL_RADIUS, robotOrbit = radius - api.ROBOT_RADIUS;
  const contact = api.BALL_RADIUS + api.ROBOT_RADIUS, angle = Math.PI / 4;
  const offset = Math.acos((ballOrbit ** 2 + robotOrbit ** 2 - contact ** 2) / (2 * ballOrbit * robotOrbit));
  for (const side of [0, 1]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const state = playing(), attack = side === 0 ? -1 : 1;
    state.ball = { x: sx * (cx + ballOrbit / Math.sqrt(2)), y: sy * (cy + ballOrbit / Math.sqrt(2)), vx: 0, vy: 0 };
    const initial = { ...state.ball };
    const gx = -state.ball.x, gy = attack * (api.FIELD.length / 2 + 1) - state.ball.y;
    const direction = -sx * Math.sin(angle) * gx + sy * Math.cos(angle) * gy >= 0 ? 1 : -1;
    const from = angle - direction * offset;
    state.robots[side].x = sx * (cx + robotOrbit * Math.cos(from));
    state.robots[side].y = sy * (cy + robotOrbit * Math.sin(from));
    const plan = api.createPushballPlans(snapshot(state, side)).find(plan => plan.label.startsWith('Wall release:'));
    assert(plan, `${side}:${sx},${sy}: a release alternative is offered to TAMEV`);
    advance(state, [idle(), idle()], plan.steps[0].at);
    for (const step of plan.steps) {
      assert.equal(api.inspectPlannedInput(snapshot(state, side), step), 'ready');
      advance(state, side === 0 ? [step.input, idle()] : [idle(), step.input], 0.14);
    }
    assert(Math.hypot(state.ball.x - initial.x, state.ball.y - initial.y) > 0.4,
      `${side}:${sx},${sy}: replayed release plan moves the trapped ball`);
  }
});
check('Planner produces alternatives without mutating the live state', () => {
  for (const side of [0, 1]) {
    const source = snapshot(playing(), side), before = structuredClone(source);
    const plans = api.createPushballPlans(source);
    assert.deepEqual(source, before); assert.equal(plans.length, 5);
    assert(plans.every(plan => plan.steps.length >= 1 && plan.steps.length <= 4 && plan.label.length < 220));
    assert(plans.every(plan => plan.steps.every(step => Math.hypot(step.input.x, step.input.y) <= 1.00001)));
  }
});
check('Timed plans wait, replay as ordinary inputs, and reject expired or divergent state', () => {
  const state = playing(), source = snapshot(state), plan = api.createPushballPlans(source)[0];
  assert.equal(api.inspectPlannedInput(source, plan.steps[0]), 'wait');
  advance(state, [idle(), idle()], plan.steps[0].at);
  for (const step of plan.steps) {
    assert.equal(api.inspectPlannedInput(snapshot(state), step), 'ready');
    advance(state, [idle(), step.input], 0.14);
  }
  const first = plan.steps[0], exact = snapshot(playing()); exact.snapshot.elapsed = first.at;
  exact.snapshot.robots[1] = { ...exact.snapshot.robots[1], ...first.pushball.robot };
  exact.snapshot.robots[0] = { ...exact.snapshot.robots[0], ...first.pushball.opponent };
  exact.snapshot.ball = { ...first.pushball.ball };
  assert.equal(api.inspectPlannedInput(exact, first), 'ready');
  assert.equal(api.inspectPlannedInput({ ...exact, epoch: 'next-goal' }, first), 'invalid');
  exact.snapshot.ball.x += 4; assert.equal(api.inspectPlannedInput(exact, first), 'invalid');
  exact.snapshot.ball = { ...first.pushball.ball }; exact.snapshot.elapsed = first.until + 0.001;
  assert.equal(api.inspectPlannedInput(exact, first), 'invalid');
});
check('An imminent winning goal yields a guarded model-selectable stop, not a planner error', () => {
  const state = playing(); state.score[1] = 2;
  state.ball = { x: 0, y: 9.3, vx: 0, vy: 8 };
  const source = snapshot(state), plans = api.createPushballPlans(source);
  assert.equal(plans.length, 1); assert.deepEqual(plans[0].steps[0].input, idle());
  assert.equal(api.inspectPlannedInput(source, plans[0].steps[0]), 'ready');
  assert.equal(state.score[1], 2);
});
check('Observation contains copied visible state, not mutable references', () => {
  const state = playing(), observed = api.observeMatch(state);
  observed.ball.x = 99; observed.robots[0].x = 99; observed.score[0] = 99;
  assert.equal(state.ball.x, 0); assert.equal(state.robots[0].x, 0); assert.equal(state.score[0], 0);
});
console.log(`PASS ${checks} Robot Pushball rule and planning cases`);
