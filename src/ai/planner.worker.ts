import { FIELD, MOVE_SPEED, ballWallNormal, confineRobot, createMatch, idleAction, normalizeAction, stepMatch, type Action, type MatchState, type Side } from '../games/pushball/model';
import { FLIGHT, predictFlight } from '../games/flappy/model';
import { applyToggle, solveLights } from '../games/lightsout/model';
import { preview2048Move } from '../games/2048/model';
import { moveCargo, cargoCorner, neighbor, DIRECTIONS, solveCargo, type CargoBoard, type CargoState, type CargoDirection } from '../games/cargo/model';
import { sudokuCandidates, solveVisibleSudoku } from '../games/sudoku/model';
import type { InputPlan, PlannedInput, PlanningState, Point } from './player';
const planningSignature = (state: PlanningState) => {
  const prefix = `${state.game}:${state.epoch}:`;
  switch (state.game) {
    case 'flappy': return prefix;
    case 'pushball': return prefix + state.side;
    case 'cargo': return prefix + JSON.stringify(state.state);
    case 'sudoku': return prefix + JSON.stringify([state.board, state.selected, state.notes]);
    case 'match3': return prefix + JSON.stringify([state.board, state.selected]);
    case 'sky': return prefix + `${state.row}:${state.lane}`;
    default: return prefix + JSON.stringify(state.board);
  }
};
type State<G extends PlanningState['game']> = Extract<PlanningState, {
  game: G;
}>;
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const input = (state: PlanningState, value: unknown): PlannedInput => ({ input: value, expected: planningSignature(state) });
function flightPlans(source: State<'flappy'>, ahead: PlannedInput[]): InputPlan[] {
  let state = structuredClone(source);
  function coast(until: number) {
    const future = predictFlight(state, Math.max(0, until - state.time));
    if (!future)
      return false;
    state = { ...state, ...future, time: until };
    return true;
  }
  // Prefetch against the remaining accepted inputs, rather than an obsolete view.
  for (const step of ahead) {
    if (step.at === undefined || step.at < state.time || !coast(step.at))
      return [];
    if (step.input === 'flap')
      state.velocity = FLIGHT.flapVelocity;
  }
  if (!coast(state.time + (ahead.length ? 0.12 : 0.2)))
    return [];
  type Node = {
    state: State<'flappy'>;
    steps: PlannedInput[];
    score: number;
  };
  let beam: Node[] = [{ state, steps: [], score: 0 }];
  for (let depth = 0; depth < 7; depth++) {
    const next: Node[] = [];
    for (const node of beam)
      for (const action of ['flap', 'wait']) {
        const step = { ...input(node.state, action), at: node.state.time, until: node.state.time + 0.09, y: node.state.y, velocity: node.state.velocity };
        const motion = { ...node.state, velocity: action === 'flap' ? FLIGHT.flapVelocity : node.state.velocity };
        const future = predictFlight(motion, 0.12);
        if (!future)
          continue;
        const pipe = future.pipes.find(p => p.x + FLIGHT.pipeWidth + 4 >= FLIGHT.birdX - FLIGHT.radius);
        const target = pipe ? pipe.gapY + pipe.gap / 2 : FLIGHT.height / 2;
        const error = Math.abs(future.y - target);
        next.push({ state: { ...node.state, ...future, time: node.state.time + 0.12 }, steps: [...node.steps, step], score: node.score + error + (action === 'flap' ? 2 : 0) });
      }
    if (!next.length)
      break;
    beam = next.sort((a, b) => a.score - b.score).slice(0, 12);
  }
  return beam.filter(n => n.steps.length >= 3).slice(0, 3).map(n => ({ label: `Safe flight for ${n.steps.length} controls; average center error ${Math.round(n.score / n.steps.length)}.`, steps: n.steps }));
}
function cargoRoutePlan(source: State<'cargo'>, route: CargoDirection[], label: string): InputPlan {
  const state = structuredClone(source), steps: PlannedInput[] = [];
  for (const direction of route) {
    const next = moveCargo(state.board, state.state, direction);
    if (!next)
      break;
    steps.push(input(state, direction));
    state.state = next.state;
  }
  return { label, steps };
}
/** Human hints retain the full old solver budget and never use partial AI alternatives. */
export function createHintPlans(state: PlanningState): InputPlan[] {
  if (state.game !== 'cargo')
    return createInputPlans(state);
  const solution = solveCargo(state.board, state.state, 20000);
  return solution?.moves.length ? [cargoRoutePlan(state, solution.moves, `Deliver every crate in ${solution.pushes} pushes and ${solution.moves.length} ordinary steps.`)] : [];
}
function cargoPlans(source: State<'cargo'>): InputPlan[] {
  const solution = solveCargo(source.board, source.state, 6000);
  const routes = solution ? [{ route: solution.moves, label: `Deliver every crate in ${solution.pushes} pushes and ${solution.moves.length} ordinary steps.` }]
    : cargoPushPlans(source.board, source.state).slice(0, 3).map(p => ({ route: p.route, label: `Push toward a dock; delivered ${p.delivered}; dock distance ${p.distance}; ${p.route.length} ordinary steps.` }));
  return routes.map(route => cargoRoutePlan(source, route.route, route.label)).filter(plan => plan.steps.length);
}
function lightPlans(source: State<'lightsout'>): InputPlan[] {
  const presses = solveLights(source.board, source.size);
  if (!presses.length)
    return [];
  return [presses, [...presses].reverse()].map(order => {
    const state = structuredClone(source), steps: PlannedInput[] = [];
    for (const index of order) {
      steps.push(input(state, index));
      applyToggle(state.board, index % source.size, Math.floor(index / source.size), source.size);
    }
    return { label: `Turn every light off with ${steps.length} ordinary taps.`, steps };
  });
}
function sudokuPlans(source: State<'sudoku'>): InputPlan[] {
  const completion = solveVisibleSudoku(source.board);
  if (!completion) {
    const repairs = source.board.flatMap((v, index) => v && !source.givens.includes(index) ? [index] : []).sort((a, b) => Number(!sudokuCandidates(source.board, b).includes(source.board[b])) - Number(!sudokuCandidates(source.board, a).includes(source.board[a])));
    return repairs.slice(0, 3).map(index => {
      const state = structuredClone(source), steps = [];
      if (state.notes) {
        steps.push(input(state, { type: 'notes' }));
        state.notes = false;
      }
      if (state.selected !== index) {
        steps.push(input(state, { type: 'select', index }));
        state.selected = index;
      }
      steps.push(input(state, { type: 'value', value: 0 }));
      return { label: 'Erase an editable conflicting digit and replan from the visible board.', steps };
    });
  }
  const cells = source.board.flatMap((v, index) => !v ? [index] : []).sort((a, b) => sudokuCandidates(source.board, a).length - sudokuCandidates(source.board, b).length);
  if (!cells.length)
    return [];
  return [cells, [...cells].reverse()].map(order => {
    const state = structuredClone(source), steps: PlannedInput[] = [];
    if (state.notes) {
      steps.push(input(state, { type: 'notes' }));
      state.notes = false;
    }
    for (const index of order) {
      if (state.selected !== index) {
        steps.push(input(state, { type: 'select', index }));
        state.selected = index;
      }
      steps.push(input(state, { type: 'value', value: completion[index] }));
      state.board[index] = completion[index];
    }
    return { label: `Fill ${cells.length} empty cells using visible-board constraint search; each selection and digit is a separate input.`, steps };
  });
}
function mergePlans(source: State<'2048'>): InputPlan[] {
  const directions = ['up', 'right', 'down', 'left'] as const;
  function value(board: number[][]) {
    const logs = board.map(row => row.map(v => v ? Math.log2(v) : 0));
    let roughness = 0;
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        if (x < 3)
          roughness += Math.abs(logs[y][x] - logs[y][x + 1]);
        if (y < 3)
          roughness += Math.abs(logs[y][x] - logs[y + 1][x]);
      }
    const maximum = Math.max(...board.flat()), corner = [board[0][0], board[0][3], board[3][0], board[3][3]].includes(maximum);
    return board.flat().filter(v => !v).length * 20 - roughness + (corner ? 20 : 0);
  }
  return directions.map(d => {
    const first = preview2048Move(source.board, d);
    if (!first.changed)
      return null;
    const empties = first.grid.flatMap((row, y) => row.flatMap((v, x) => !v ? [{ x, y }] : []));
    // Spawn positions are unknown: average possible visible-board futures, never peek at RNG.
    let expected = 0;
    for (const cell of empties)
      for (const [tile, weight] of [[2, 0.9], [4, 0.1]]) {
        const board = first.grid.map(row => [...row]);
        board[cell.y][cell.x] = tile;
        const best = Math.max(...directions.map(next => { const move = preview2048Move(board, next); return move.changed ? value(move.grid) + move.gained * 0.1 : -1000; }));
        expected += best * weight / empties.length;
      }
    if (!empties.length)
      expected = value(first.grid);
    return { score: expected + first.gained * 0.1, label: `${d}: two-turn outlook ${Math.round(expected)}; merge points ${first.gained}; empty cells ${first.empty}.`, steps: [input(source, d)] };
  }).filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => b.score - a.score).slice(0, 3).map(({ label, steps }) => ({ label, steps }));
}
function matchPlans(source: State<'match3'>): InputPlan[] {
  const size = source.board.length;
  function matches(board: number[][]) {
    const cells = new Set<string>();
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        for (const d of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
          const run: Point[] = [];
          let p = { x, y };
          while (p.x < size && p.y < size && board[p.y][p.x] === board[y][x]) {
            run.push(p);
            p = { x: p.x + d.x, y: p.y + d.y };
          }
          if (run.length >= 3)
            run.forEach(q => cells.add(`${q.x},${q.y}`));
        }
    return cells.size;
  }
  const plans: {
    plan: InputPlan;
    count: number;
  }[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (const d of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
        const a = { x, y }, b = { x: x + d.x, y: y + d.y };
        if (b.x >= size || b.y >= size)
          continue;
        const board = source.board.map(row => [...row]);
        [board[a.y][a.x], board[b.y][b.x]] = [board[b.y][b.x], board[a.y][a.x]];
        const count = matches(board);
        if (!count)
          continue;
        const state = structuredClone(source), steps: PlannedInput[] = [];
        if (state.selected && same(state.selected, a)) {
          steps.push(input(state, a));
          state.selected = null;
        }
        if (state.selected) {
          steps.push(input(state, state.selected));
          state.selected = null;
        }
        steps.push(input(state, a));
        state.selected = a;
        steps.push(input(state, b));
        plans.push({ count, plan: { label: `Select and swap adjacent tiles to clear ${count} gems; each tap is separate.`, steps } });
      }
  return plans.sort((a, b) => b.count - a.count).slice(0, 3).map(p => p.plan);
}
function skyPlans(source: State<'sky'>): InputPlan[] {
  const targets = [source.target, ...[0, 1, 2].filter(lane => lane !== source.target && !source.obstacles.includes(lane))];
  return targets.map(lane => {
    const state = { ...source }, steps: PlannedInput[] = [];
    while (state.lane !== lane) {
      const action = state.lane < lane ? 'right' : 'left';
      steps.push(input(state, action));
      state.lane += action === 'right' ? 1 : -1;
    }
    if (!steps.length)
      steps.push(input(state, 'wait'));
    return { label: `${lane === source.target ? 'Collect the golden ring and avoid barriers' : 'Avoid barriers'} in lane ${lane}; ${steps.length} normal steering inputs.`, steps };
  });
}
export function createInputPlans(state: PlanningState, ahead: PlannedInput[] = []): InputPlan[] {
  switch (state.game) {
    case 'flappy': return flightPlans(state, ahead);
    case 'cargo': return cargoPlans(state);
    case 'lightsout': return lightPlans(state);
    case 'sudoku': return sudokuPlans(state);
    case '2048': return mergePlans(state);
    case 'match3': return matchPlans(state);
    case 'sky': return skyPlans(state);
    case 'pushball': return createPushballPlans(state);
  }
}
type PushballState = Extract<PlanningState, {
  game: 'pushball';
}>;
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
    if (tangentLength > 0.001) {
      nx = tx / tangentLength;
      ny = ty / tangentLength;
    }
    else {
      nx = -wall.y;
      ny = wall.x;
    }
  }
  const rx = body.x - bx, ry = body.y - by, distance = Math.hypot(rx, ry);
  const behind = -(rx * nx + ry * ny) / Math.max(distance, 0.001);
  let tx = bx - nx * 1.4, ty = by - ny * 1.4;
  if (behind > 0.82 && distance < 1.9) {
    tx = bx + nx * 3;
    ty = by + ny * 3;
  }
  else if (behind < 0.4 && distance < 3.6) {
    const flank = strategy === 'Left flank' ? -1 : strategy === 'Right flank' ? 1
      : bx > 3.8 ? -1 : bx < -3.8 ? 1 : rx >= 0 ? 1 : -1;
    tx = bx + flank * 1.9;
    ty = Math.abs(rx) < 1.5 ? by + attack * 0.6 : by - attack * 1.5;
  }
  else if (strategy === 'Left flank' || strategy === 'Right flank') {
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
function coast(state: MatchState, side: Side, action: Action, other: Action, duration: number, visit?: () => void) {
  for (let time = 0; time < duration - 0.00001; time += 1 / 120) {
    const dt = Math.min(1 / 120, duration - time);
    const own = { ...action, dash: time === 0 && action.dash };
    stepMatch(state, side === 0 ? [own, other] : [other, own], dt);
    visit?.();
  }
}
/** Generate alternatives only. The resident TAMEV model, not this planner, selects a plan. */
export function createPushballPlans(source: PushballState): InputPlan[] {
  const side = source.side, opponent: Side = side === 0 ? 1 : 0;
  const otherBody = source.snapshot.robots[opponent];
  // Future opponent inputs are unknown. Forecast only their current visible velocity.
  const other = normalizeAction({ x: otherBody.vx / MOVE_SPEED, y: otherBody.vy / MOVE_SPEED, dash: false });
  const strategies: Strategy[] = ['Intercept', 'Left flank', 'Right flank'];
  const attack = side === 0 ? -1 : 1, ball = source.snapshot.ball;
  // A visible ball already in the own half, or forecast to enter it, warrants defense.
  if (ball.y * attack < -3
    || ball.vy * attack < -0.5 && (ball.y + ball.vy * (LEAD + INTERVAL * 4)) * attack < -3)
    strategies.push('Defend');
  strategies.push('Dash shot');
  if (ballWallNormal(source.snapshot.ball))
    strategies.push('Wall release');
  const plans: InputPlan[] = [];
  for (const strategy of strategies) {
    const state = createMatch();
    state.mode = 'playing';
    state.kickoff = 0;
    state.robots = structuredClone(source.snapshot.robots);
    state.ball = { ...source.snapshot.ball };
    state.score = [...source.snapshot.score];
    state.elapsed = source.snapshot.elapsed;
    let robotMotion = 0, ballMotion = 0;
    const visit = () => {
      robotMotion = Math.max(robotMotion, Math.hypot(
        state.robots[side].x - source.snapshot.robots[side].x,
        state.robots[side].y - source.snapshot.robots[side].y));
      ballMotion = Math.max(ballMotion, Math.hypot(
        state.ball.x - source.snapshot.ball.x,
        state.ball.y - source.snapshot.ball.y));
    };
    const held = Math.max(0, Math.min(LEAD, source.controlUntil - state.elapsed));
    if (held)
      coast(state, side, { ...source.control, dash: false }, other, held, visit);
    coast(state, side, idleAction(), other, LEAD - held, visit);
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
      coast(state, side, action, other, INTERVAL, visit);
      if (state.goalSerial)
        break;
    }
    // A stationary forecast cannot execute this strategy from the visible state.
    // Keep moving-ball plans and the bounded goal wait unchanged.
    if (Math.hypot(ball.vx, ball.vy) <= 0.001 && robotMotion <= 0.001 && ballMotion <= 0.001)
      continue;
    const scored = state.score[side] > source.snapshot.score[side];
    const conceded = state.score[opponent] > source.snapshot.score[opponent];
    const danger = conceded || state.ball.y * attack < -6 && state.ball.vy * attack < -0.5;
    const progress = (state.ball.y - source.snapshot.ball.y) * attack;
    const gap = Math.hypot(state.robots[side].x - state.ball.x, state.robots[side].y - state.ball.y);
    plans.push({ label: `${strategy}: ${scored ? 'scores a goal' : `ball progress ${progress.toFixed(1)}; ball distance ${gap.toFixed(1)}`}; own-goal risk ${danger ? 'high' : 'low'}; ${steps.length} controls.`, steps });
  }
  return plans.filter(plan => plan.steps.length > 0);
}
export { solveCargo };
export type CargoPushPlan = {
  route: CargoDirection[];
  crate: number;
  target: number;
  direction: CargoDirection;
  delivered: number;
  distance: number;
};
/** Walking routes and static corner checks use only visible walls and crates. */
export function cargoPushPlans(board: CargoBoard, state: CargoState): CargoPushPlan[] {
  const routes = new Map<number, CargoDirection[]>([[state.player, []]]);
  const queue = [state.player];
  const floor = new Set(board.floor), crates = new Set(state.crates);
  for (let i = 0; i < queue.length; i++) {
    for (const direction of DIRECTIONS) {
      const cell = neighbor(board, queue[i], direction.key);
      if (!floor.has(cell) || crates.has(cell) || routes.has(cell))
        continue;
      routes.set(cell, [...routes.get(queue[i])!, direction.key]);
      queue.push(cell);
    }
  }
  const plans: CargoPushPlan[] = [];
  for (const crate of state.crates) {
    for (let index = 0; index < DIRECTIONS.length; index++) {
      const direction = DIRECTIONS[index].key;
      const behind = neighbor(board, crate, DIRECTIONS[(index + 2) % 4].key);
      const path = routes.get(behind);
      if (!path)
        continue;
      const push = moveCargo(board, { player: behind, crates: [...state.crates] }, direction);
      const target = neighbor(board, crate, direction);
      if (!push || cargoCorner(board, target))
        continue;
      const remainingGoals = board.goals.filter((goal) => goal === target || !push.state.crates.includes(goal));
      const distance = Math.min(...(remainingGoals.length ? remainingGoals : board.goals).map((goal) => Math.abs(goal % board.width - target % board.width) + Math.abs(Math.floor(goal / board.width) - Math.floor(target / board.width))));
      plans.push({
        route: [...path, direction], crate, target, direction,
        delivered: push.state.crates.filter((cell) => board.goals.includes(cell)).length,
        distance
      });
    }
  }
  return plans.sort((a, b) => b.delivered - a.delivered || a.distance - b.distance || a.route.length - b.route.length).slice(0, 16);
}
if (typeof self !== 'undefined')
  self.onmessage = ({ data }: MessageEvent<{
    id: number;
    state: PlanningState;
    ahead: PlannedInput[];
    mode?: 'plan' | 'hint';
  }>) => {
    try {
      self.postMessage({ id: data.id, plans: data.mode === 'hint' ? createHintPlans(data.state) : createInputPlans(data.state, data.ahead) });
    }
    catch (error) {
      self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Planning failed.' });
    }
  };
