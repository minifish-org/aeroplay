export const FIELD = { width: 12, length: 18, goalWidth: 4.8, cornerRadius: 2.4 } as const;
export const ROBOT_RADIUS = 0.72;
export const BALL_RADIUS = 0.4;
export const MOVE_SPEED = 4.6;
export const DASH_SPEED = 9;
export const DASH_DURATION = 0.22;
export const DASH_COOLDOWN = 2.8;
export const WIN_SCORE = 3;
export type Side = 0 | 1;
export type MatchMode = 'ready' | 'playing' | 'paused' | 'over';
export interface Action { x: number; y: number; dash: boolean }
export interface Body { x: number; y: number; vx: number; vy: number }
export interface Robot extends Body {
  facingX: number;
  facingY: number;
  cooldown: number;
  dashLeft: number;
}
export interface MatchState {
  mode: MatchMode;
  robots: [Robot, Robot];
  ball: Body;
  score: [number, number];
  elapsed: number;
  kickoff: number;
  goalSerial: number;
  lastScorer: Side | null;
  winner: Side | null;
}
export const idleAction = (): Action => ({ x: 0, y: 0, dash: false });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function robot(side: Side): Robot {
  return { x: 0, y: side === 0 ? 5.5 : -5.5, vx: 0, vy: 0,
    facingX: 0, facingY: side === 0 ? -1 : 1, cooldown: 0, dashLeft: 0 };
}
export function createMatch(): MatchState {
  return { mode: 'ready', robots: [robot(0), robot(1)],
    ball: { x: 0, y: 0, vx: 0, vy: 0 }, score: [0, 0], elapsed: 0,
    kickoff: 1, goalSerial: 0, lastScorer: null, winner: null };
}
export function normalizeAction(action: Action): Action {
  const x = Number.isFinite(action.x) ? clamp(action.x, -1, 1) : 0;
  const y = Number.isFinite(action.y) ? clamp(action.y, -1, 1) : 0;
  const magnitude = Math.max(1, Math.hypot(x, y));
  return { x: x / magnitude, y: y / magnitude, dash: action.dash === true };
}
/** Project a disc onto the continuous rounded boundary, not into square pockets. */
function confineCorner(body: { x: number; y: number }, radius: number) {
  const centerX = FIELD.width / 2 - FIELD.cornerRadius;
  const centerY = FIELD.length / 2 - FIELD.cornerRadius;
  const dx = Math.abs(body.x) - centerX, dy = Math.abs(body.y) - centerY;
  if (dx <= 0 || dy <= 0) return null;
  const distance = Math.hypot(dx, dy), limit = FIELD.cornerRadius - radius;
  if (distance <= limit) return null;
  const sx = Math.sign(body.x), sy = Math.sign(body.y);
  const nx = dx / distance, ny = dy / distance;
  body.x = sx * (centerX + nx * limit);
  body.y = sy * (centerY + ny * limit);
  return { x: sx * nx, y: sy * ny };
}
export function confineRobot(body: { x: number; y: number }) {
  body.x = clamp(body.x, -FIELD.width / 2 + ROBOT_RADIUS, FIELD.width / 2 - ROBOT_RADIUS);
  body.y = clamp(body.y, -FIELD.length / 2 + ROBOT_RADIUS, FIELD.length / 2 - ROBOT_RADIUS);
  confineCorner(body, ROBOT_RADIUS);
}
/** Visible arena geometry for planning a tangential release, with no special AI forces. */
export function ballWallNormal(ball: { x: number; y: number }) {
  const dx = Math.abs(ball.x) - (FIELD.width / 2 - FIELD.cornerRadius);
  const dy = Math.abs(ball.y) - (FIELD.length / 2 - FIELD.cornerRadius);
  const distance = Math.hypot(dx, dy);
  if (dx > 0 && dy > 0 && distance >= FIELD.cornerRadius - BALL_RADIUS - 0.18) {
    return { x: Math.sign(ball.x) * dx / distance, y: Math.sign(ball.y) * dy / distance };
  }
  if (Math.abs(ball.x) >= FIELD.width / 2 - BALL_RADIUS - 0.18) return { x: Math.sign(ball.x), y: 0 };
  if (Math.abs(ball.y) >= FIELD.length / 2 - BALL_RADIUS - 0.18
    && Math.abs(ball.x) > FIELD.goalWidth / 2 - BALL_RADIUS) return { x: 0, y: Math.sign(ball.y) };
  return null;
}
function moveRobot(body: Robot, raw: Action, dt: number) {
  const action = normalizeAction(raw);
  body.cooldown = Math.max(0, body.cooldown - dt);
  if (Math.hypot(action.x, action.y) > 0.05 && body.dashLeft === 0) {
    const size = Math.hypot(action.x, action.y);
    body.facingX = action.x / size;
    body.facingY = action.y / size;
  }
  if (action.dash && body.cooldown === 0 && body.dashLeft === 0 && Math.hypot(action.x, action.y) > 0.1) {
    body.dashLeft = DASH_DURATION;
    body.cooldown = DASH_COOLDOWN;
  }
  const dashing = body.dashLeft > 0;
  const vx = dashing ? body.facingX * DASH_SPEED : action.x * MOVE_SPEED;
  const vy = dashing ? body.facingY * DASH_SPEED : action.y * MOVE_SPEED;
  const oldX = body.x, oldY = body.y;
  body.x += vx * dt;
  body.y += vy * dt;
  confineRobot(body);
  body.vx = (body.x - oldX) / dt;
  body.vy = (body.y - oldY) / dt;
  body.dashLeft = Math.max(0, body.dashLeft - dt);
}
function separateRobots(a: Robot, b: Robot) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= ROBOT_RADIUS * 2) return;
  const nx = distance > 0.0001 ? dx / distance : 1;
  const ny = distance > 0.0001 ? dy / distance : 0;
  const overlap = (ROBOT_RADIUS * 2 - distance) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;
  confineRobot(a); confineRobot(b);
}
function pushBall(body: Robot, ball: Body) {
  const dx = ball.x - body.x, dy = ball.y - body.y;
  const distance = Math.hypot(dx, dy);
  const contact = BALL_RADIUS + ROBOT_RADIUS;
  if (distance >= contact) return;
  const nx = distance > 0.0001 ? dx / distance : body.facingX;
  const ny = distance > 0.0001 ? dy / distance : body.facingY;
  ball.x = body.x + nx * contact;
  ball.y = body.y + ny * contact;
  const relative = (ball.vx - body.vx) * nx + (ball.vy - body.vy) * ny;
  if (relative < 0) {
    ball.vx -= 1.35 * relative * nx;
    ball.vy -= 1.35 * relative * ny;
  }
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > 16) { ball.vx *= 16 / speed; ball.vy *= 16 / speed; }
}
function scoreGoal(state: MatchState, side: Side) {
  state.score[side]++;
  state.goalSerial++;
  state.lastScorer = side;
  state.robots = [robot(0), robot(1)];
  state.ball = { x: 0, y: 0, vx: 0, vy: 0 };
  state.kickoff = 1.4;
  if (state.score[side] >= WIN_SCORE) {
    state.mode = 'over';
    state.winner = side;
  }
}
function ballWalls(state: MatchState) {
  const ball = state.ball;
  const sideLimit = FIELD.width / 2 - BALL_RADIUS;
  if (Math.abs(ball.x) > sideLimit) {
    ball.x = Math.sign(ball.x) * sideLimit;
    ball.vx = -Math.sign(ball.x) * Math.abs(ball.vx) * 0.72;
  }
  const endLimit = FIELD.length / 2 - BALL_RADIUS;
  const mouth = FIELD.goalWidth / 2 - BALL_RADIUS;
  if (Math.abs(ball.y) > endLimit) {
    if (Math.abs(ball.x) > mouth) {
      ball.y = Math.sign(ball.y) * endLimit;
      ball.vy = -Math.sign(ball.y) * Math.abs(ball.vy) * 0.72;
    } else if (Math.abs(ball.y) > FIELD.length / 2 + BALL_RADIUS) {
      scoreGoal(state, ball.y < 0 ? 0 : 1);
    }
  }
  const normal = confineCorner(ball, BALL_RADIUS);
  if (normal) {
    const outward = ball.vx * normal.x + ball.vy * normal.y;
    if (outward > 0) {
      ball.vx -= 1.72 * outward * normal.x;
      ball.vy -= 1.72 * outward * normal.y;
    }
  }
}
/** Both controllers enter exactly the same physics path. No rendering or AI runs here. */
export function stepMatch(state: MatchState, inputs: readonly [Action, Action], dt: number) {
  if (state.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  let remaining = Math.min(dt, 0.1);
  let first = true;
  while (remaining > 0.000001 && state.mode === 'playing') {
    const step = Math.min(remaining, 1 / 120);
    remaining -= step;
    state.elapsed += step;
    if (state.kickoff > 0) {
      state.kickoff = Math.max(0, state.kickoff - step);
      first = false;
      continue;
    }
    for (const side of [0, 1] as const) {
      moveRobot(state.robots[side], { ...inputs[side], dash: first && inputs[side].dash }, step);
    }
    first = false;
    separateRobots(...state.robots);
    state.ball.x += state.ball.vx * step;
    state.ball.y += state.ball.vy * step;
    // Alternate collision order to avoid permanently favoring one side.
    const order: Side[] = Math.floor(state.elapsed * 120) % 2 ? [0, 1] : [1, 0];
    for (const side of order) pushBall(state.robots[side], state.ball);
    ballWalls(state);
    const drag = Math.exp(-0.72 * step);
    state.ball.vx *= drag; state.ball.vy *= drag;
  }
}
export interface Observation {
  robots: [Robot, Robot];
  ball: Body;
  score: [number, number];
  elapsed: number;
}
export const CONTROL_LIFETIME = 0.24;
export function observeMatch(state: MatchState): Observation {
  return { robots: state.robots.map((body) => ({ ...body })) as [Robot, Robot],
    ball: { ...state.ball }, score: [...state.score], elapsed: state.elapsed };
}
