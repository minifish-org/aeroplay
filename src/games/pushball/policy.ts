import { planningSignature, type InputPlan, type PlannedInput, type PlanningState } from '../../core/ai-planning-state';
import { FIELD, MOVE_SPEED, ballWallNormal, confineRobot, createMatch, idleAction, normalizeAction, stepMatch, type Action, type MatchState, type Side } from './model';

type State = Extract<PlanningState, { game: 'pushball' }>;
type Strategy = 'Intercept' | 'Left flank' | 'Right flank' | 'Defend' | 'Dash shot' | 'Wall release';
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
const INTERVAL = 0.14;
const LEAD = 0.16;

function steer(state: MatchState, side: Side, strategy: Strategy): Action {
  const body = state.robots[side], ball = state.ball;
  const attack = side === 0 ? -1 : 1;
  const bx = clamp(ball.x + ball.vx * 0.15, FIELD.width / 2 - 0.5);
  const by = clamp(ball.y + ball.vy * 0.15, FIELD.length / 2 - 0.5);
  const gx = -bx, gy = attack * (FIELD.length / 2 + 1) - by;
  const length = Math.hypot(gx, gy);
  let nx = gx / length, ny = gy / length;
  const wall = strategy === 'Wall release' ? ballWallNormal(ball) : null;
  if (wall) {
    // A robot cannot get outside a wall to push inward. Approach from the side
    // and guide the ball tangentially, using the same collisions as the human.
    const outward = nx * wall.x + ny * wall.y;
    const tx = nx - outward * wall.x, ty = ny - outward * wall.y;
    const tangentLength = Math.hypot(tx, ty);
    if (tangentLength > 0.001) { nx = tx / tangentLength; ny = ty / tangentLength; }
    else { nx = -wall.y; ny = wall.x; }
  }
  const rx = body.x - bx, ry = body.y - by, distance = Math.hypot(rx, ry);
  const behind = -(rx * nx + ry * ny) / Math.max(distance, 0.001);
  let tx = bx - nx * 1.4, ty = by - ny * 1.4;
  if (behind > 0.82 && distance < 1.9) {
    tx = bx + nx * 3; ty = by + ny * 3;
  } else if (behind < 0.4 && distance < 3.6) {
    const flank = strategy === 'Left flank' ? -1 : strategy === 'Right flank' ? 1
      : bx > 3.8 ? -1 : bx < -3.8 ? 1 : rx >= 0 ? 1 : -1;
    tx = bx + flank * 1.9;
    ty = Math.abs(rx) < 1.5 ? by + attack * 0.6 : by - attack * 1.5;
  } else if (strategy === 'Left flank' || strategy === 'Right flank') {
    tx += strategy === 'Left flank' ? -0.8 : 0.8;
  }
  if (strategy === 'Defend' && ball.y * attack > -3) {
    tx = clamp(bx * 0.65, 2.5);
    ty = -attack * 5.8;
  }
  const target = { x: tx, y: ty };
  confineRobot(target);
  const dx = target.x - body.x, dy = target.y - body.y, scale = Math.max(0.55, Math.hypot(dx, dy));
  return normalizeAction({ x: dx / scale, y: dy / scale,
    dash: strategy === 'Dash shot' && body.cooldown === 0 && behind > 0.85 && distance > 1.15 && distance < 2.6 });
}

function coast(state: MatchState, side: Side, action: Action, other: Action, duration: number) {
  for (let time = 0; time < duration - 0.00001; time += 1 / 120) {
    const dt = Math.min(1 / 120, duration - time);
    const own = { ...action, dash: time === 0 && action.dash };
    stepMatch(state, side === 0 ? [own, other] : [other, own], dt);
  }
}

/** Generate alternatives only. The resident TAMEV model, not this planner, selects a plan. */
export function createPushballPlans(source: State): InputPlan[] {
  const side = source.side, opponent: Side = side === 0 ? 1 : 0;
  const otherBody = source.snapshot.robots[opponent];
  // Future opponent inputs are unknown. Forecast only their current visible velocity.
  const other = normalizeAction({ x: otherBody.vx / MOVE_SPEED, y: otherBody.vy / MOVE_SPEED, dash: false });
  const strategies: Strategy[] = ['Intercept', 'Left flank', 'Right flank', 'Defend', 'Dash shot'];
  if (ballWallNormal(source.snapshot.ball)) strategies.push('Wall release');
  const plans: InputPlan[] = [];
  for (const strategy of strategies) {
    const state = createMatch();
    state.mode = 'playing'; state.kickoff = 0;
    state.robots = structuredClone(source.snapshot.robots);
    state.ball = { ...source.snapshot.ball };
    state.score = [...source.snapshot.score];
    state.elapsed = source.snapshot.elapsed;
    const held = Math.max(0, Math.min(LEAD, source.controlUntil - state.elapsed));
    if (held) coast(state, side, { ...source.control, dash: false }, other, held);
    coast(state, side, idleAction(), other, LEAD - held);
    if (state.goalSerial > 0) {
      // A goal during the inference lead is not a planning failure. The model
      // can choose a bounded ordinary stop, and the real goal epoch cancels it.
      return [{ label: 'Wait for goal: ball is forecast to cross the line; stop and allow the score. 1 control.',
        steps: [{ input: idleAction(), expected: planningSignature(source),
          at: source.snapshot.elapsed, until: source.snapshot.elapsed + LEAD,
          pushball: { robot: { ...source.snapshot.robots[side] }, ball: { ...source.snapshot.ball },
            opponent: { ...source.snapshot.robots[opponent] } } }] }];
    }
    const steps: PlannedInput[] = [];
    for (let index = 0; index < 4 && state.mode === 'playing'; index++) {
      const action = steer(state, side, strategy);
      steps.push({ input: action, expected: planningSignature(source), at: state.elapsed,
        until: state.elapsed + 0.12,
        pushball: { robot: { ...state.robots[side] }, ball: { ...state.ball }, opponent: { ...state.robots[opponent] } } });
      coast(state, side, action, other, INTERVAL);
      if (state.goalSerial) break;
    }
    const attack = side === 0 ? -1 : 1;
    const scored = state.score[side] > source.snapshot.score[side];
    const conceded = state.score[opponent] > source.snapshot.score[opponent];
    const danger = conceded || state.ball.y * attack < -6 && state.ball.vy * attack < -0.5;
    const progress = (state.ball.y - source.snapshot.ball.y) * attack;
    const gap = Math.hypot(state.robots[side].x - state.ball.x, state.robots[side].y - state.ball.y);
    plans.push({ label: `${strategy}: ${scored ? 'scores a goal' : `ball progress ${progress.toFixed(1)}; ball distance ${gap.toFixed(1)}`}; own-goal risk ${danger ? 'high' : 'low'}; ${steps.length} controls.`, steps });
  }
  return plans.filter(plan => plan.steps.length > 0);
}
