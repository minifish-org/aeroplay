import { FLIGHT, predictFlight } from '../games/flappyFlight';
import { createPushballPlans } from '../games/pushball/policy';
import { collides, merge, clearLines, rotatedPiece, boardHeights } from '../games/tetrisLogic';
import { applyToggle, solveLights } from '../games/lightsLogic';
import { preview2048Move } from '../games/mergeLogic';
import { moveCargo } from '../games/cargo/model';
import { solveCargo } from '../games/cargo/solver';
import { cargoPushPlans, sudokuCandidates, solveVisibleSudoku } from '../games/puzzleSolvers';
import { planningSignature, type InputPlan, type PlannedInput, type PlanningState, type Point } from './ai-planning-state';

type State<G extends PlanningState['game']> = Extract<PlanningState, { game: G }>;
const directions = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const input = (state: PlanningState, value: unknown): PlannedInput => ({ input: value, expected: planningSignature(state) });

function flightPlans(source: State<'flappy'>, ahead: PlannedInput[]): InputPlan[] {
  let state = structuredClone(source);
  function coast(until: number) {
    const future = predictFlight(state, Math.max(0, until - state.time));
    if (!future) return false;
    state = { ...state, ...future, time: until }; return true;
  }
  // Prefetch against the remaining accepted inputs, rather than an obsolete view.
  for (const step of ahead) {
    if (step.at === undefined || step.at < state.time || !coast(step.at)) return [];
    if (step.input === 'flap') state.velocity = FLIGHT.flapVelocity;
  }
  if (!coast(state.time + (ahead.length ? 0.12 : 0.2))) return [];
  type Node = { state: State<'flappy'>; steps: PlannedInput[]; score: number };
  let beam: Node[] = [{ state, steps: [], score: 0 }];
  for (let depth = 0; depth < 7; depth++) {
    const next: Node[] = [];
    for (const node of beam) for (const action of ['flap', 'wait']) {
      const step = { ...input(node.state, action), at: node.state.time, until: node.state.time + 0.09, y: node.state.y, velocity: node.state.velocity };
      const motion = { ...node.state, velocity: action === 'flap' ? FLIGHT.flapVelocity : node.state.velocity };
      const future = predictFlight(motion, 0.12);
      if (!future) continue;
      const pipe = future.pipes.find(p => p.x + FLIGHT.pipeWidth + 4 >= FLIGHT.birdX - FLIGHT.radius);
      const target = pipe ? pipe.gapY + pipe.gap / 2 : FLIGHT.height / 2;
      const error = Math.abs(future.y - target);
      next.push({ state: { ...node.state, ...future, time: node.state.time + 0.12 }, steps: [...node.steps, step], score: node.score + error + (action === 'flap' ? 2 : 0) });
    }
    if (!next.length) break;
    beam = next.sort((a, b) => a.score - b.score).slice(0, 12);
  }
  return beam.filter(n => n.steps.length >= 3).slice(0, 3).map(n => ({ label: `Safe flight for ${n.steps.length} controls; average center error ${Math.round(n.score / n.steps.length)}.`, steps: n.steps }));
}

function tetrisPlans(source: State<'tetris'>): InputPlan[] {
  type Node = { piece: State<'tetris'>['piece']; steps: PlannedInput[] };
  const queue: Node[] = [{ piece: source.piece, steps: [] }], seen = new Set<string>(), results: { plan: InputPlan; score: number }[] = [];
  for (let i = 0; i < queue.length && i < 180; i++) {
    const node = queue[i], state = { ...source, piece: node.piece }, signature = planningSignature(state);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const landing = { ...node.piece };
    while (!collides(source.board, { ...landing, y: landing.y + 1 })) landing.y++;
    const board = source.board.map(row => [...row]); merge(board, landing);
    const lines = clearLines(board), heights = boardHeights(board);
    let holes = 0;
    for (let x = 0; x < 10; x++) {
      let covered = false;
      for (let y = 0; y < 20; y++) { if (board[y][x]) covered = true; else if (covered) holes++; }
    }
    const roughness = heights.slice(1).reduce((sum, h, x) => sum + Math.abs(h - heights[x]), 0);
    results.push({ score: holes * 12 + heights.reduce((a, b) => a + b, 0) + roughness * 0.7 - lines * 30,
      plan: { label: `Landing clears ${lines} lines; holes ${holes}; height ${Math.max(...heights)}; roughness ${roughness}; ${node.steps.length + 1} controls.`, steps: [...node.steps, input(state, 'drop')] } });
    if (node.steps.length >= 8) continue;
    for (const action of ['left', 'right', 'rotate'] as const) {
      const piece = action === 'rotate' ? rotatedPiece(source.board, node.piece) : { ...node.piece, x: node.piece.x + (action === 'left' ? -1 : 1) };
      if (piece && !collides(source.board, piece)) queue.push({ piece, steps: [...node.steps, input(state, action)] });
    }
  }
  return results.sort((a, b) => a.score - b.score).slice(0, 3).map(r => r.plan);
}

function mazePlans(source: State<'maze'>): InputPlan[] {
  const exit = { x: source.size - 1, y: source.size - 1 };
  function route(from: Point, target: Point): Point[] {
    const queue = [{ p: from, way: [] as Point[] }], seen = new Set([`${from.x},${from.y}`]);
    for (let i = 0; i < queue.length; i++) {
      const { p, way } = queue[i]; if (same(p, target)) return way;
      const walls = source.walls[p.y][p.x];
      directions.forEach((d, index) => {
        if ([walls.top, walls.right, walls.bottom, walls.left][index]) return;
        const n = { x: p.x + d.x, y: p.y + d.y }, key = `${n.x},${n.y}`;
        if (!same(target, exit) && same(n, exit)) return;
        if (!seen.has(key)) { seen.add(key); queue.push({ p: n, way: [...way, d] }); }
      });
    }
    return [];
  }
  const permutations = (points: Point[]): Point[][] => points.length ? points.flatMap((p, i) => permutations(points.filter((_, j) => i !== j)).map(tail => [p, ...tail])) : [[]];
  return permutations(source.stars).map(order => {
    const state = structuredClone(source), steps: PlannedInput[] = [];
    for (const target of [...order, exit]) {
      if (same(state.position, target)) continue;
      const way = route(state.position, target); if (!way.length) return null;
      for (const d of way) {
        steps.push(input(state, d)); state.position = { x: state.position.x + d.x, y: state.position.y + d.y };
        state.stars = state.stars.filter(p => !same(p, state.position));
      }
    }
    return { label: `Collect all ${source.stars.length} stars and reach the exit in ${steps.length} ordinary steps.`, steps };
  }).filter((p): p is InputPlan => !!p && !!p.steps.length).sort((a, b) => a.steps.length - b.steps.length).slice(0, 3);
}

function cargoPlans(source: State<'cargo'>): InputPlan[] {
  const solution = solveCargo(source.board, source.state, 6000);
  const routes = solution ? [{ route: solution.moves, label: `Deliver every crate in ${solution.pushes} pushes and ${solution.moves.length} ordinary steps.` }]
    : cargoPushPlans(source.board, source.state).slice(0, 3).map(p => ({ route: p.route, label: `Push toward a dock; delivered ${p.delivered}; dock distance ${p.distance}; ${p.route.length} ordinary steps.` }));
  return routes.map(route => {
    const state = structuredClone(source), steps: PlannedInput[] = [];
    for (const d of route.route) {
      const next = moveCargo(state.board, state.state, d); if (!next) break;
      steps.push(input(state, d)); state.state = next.state;
    }
    return { label: route.label, steps };
  }).filter(p => p.steps.length);
}

function lightPlans(source: State<'lightsout'>): InputPlan[] {
  const presses = solveLights(source.board);
  if (!presses.length) return [];
  return [presses, [...presses].reverse()].map(order => {
    const state = structuredClone(source), steps: PlannedInput[] = [];
    for (const index of order) { steps.push(input(state, index)); applyToggle(state.board, index % 5, Math.floor(index / 5)); }
    return { label: `Turn every light off with ${steps.length} ordinary taps.`, steps };
  });
}

function sudokuPlans(source: State<'sudoku'>): InputPlan[] {
  const completion = solveVisibleSudoku(source.board);
  if (!completion) {
    const repairs = source.board.flatMap((v, index) => v && !source.givens.includes(index) ? [index] : []).sort((a, b) => Number(!sudokuCandidates(source.board, b).includes(source.board[b])) - Number(!sudokuCandidates(source.board, a).includes(source.board[a])));
    return repairs.slice(0, 3).map(index => {
      const state = structuredClone(source), steps = [];
      if (state.notes) { steps.push(input(state, { type: 'notes' })); state.notes = false; }
      if (state.selected !== index) { steps.push(input(state, { type: 'select', index })); state.selected = index; }
      steps.push(input(state, { type: 'value', value: 0 }));
      return { label: 'Erase an editable conflicting digit and replan from the visible board.', steps };
    });
  }
  const cells = source.board.flatMap((v, index) => !v ? [index] : []).sort((a, b) => sudokuCandidates(source.board, a).length - sudokuCandidates(source.board, b).length);
  if (!cells.length) return [];
  return [cells, [...cells].reverse()].map(order => {
    const state = structuredClone(source), steps: PlannedInput[] = [];
    if (state.notes) { steps.push(input(state, { type: 'notes' })); state.notes = false; }
    for (const index of order) {
      if (state.selected !== index) { steps.push(input(state, { type: 'select', index })); state.selected = index; }
      steps.push(input(state, { type: 'value', value: completion[index] })); state.board[index] = completion[index];
    }
    return { label: `Fill ${cells.length} empty cells using visible-board constraint search; each selection and digit is a separate input.`, steps };
  });
}

function snakePlans(source: State<'snake'>): InputPlan[] {
  function advance(s: State<'snake'>, d: Point): State<'snake'> | null {
    if (d.x === -s.direction.x && d.y === -s.direction.y) return null;
    const head = s.segments.at(-1)!, p = { x: head.x + d.x, y: head.y + d.y };
    if (s.wrap) { p.x = (p.x + s.size) % s.size; p.y = (p.y + s.size) % s.size; }
    const grows = !!s.food && same(p, s.food) || !!s.bonus && same(p, s.bonus);
    if (p.x < 0 || p.y < 0 || p.x >= s.size || p.y >= s.size || (grows ? s.segments : s.segments.slice(1)).some(q => same(q, p))) return null;
    return { ...s, tick: s.tick + 1, direction: d, segments: [...(grows ? s.segments : s.segments.slice(1)), p] };
  }
  const initial = advance(source, source.direction); // Plan the next control before its tick arrives.
  if (!initial) return [];
  type Node = { state: State<'snake'>; steps: PlannedInput[]; score: number; eaten: boolean };
  let beam: Node[] = [{ state: initial, steps: [], score: 0, eaten: false }];
  for (let depth = 0; depth < 10; depth++) {
    const next: Node[] = [];
    for (const node of beam) {
      if (node.eaten) { next.push(node); continue; }
      for (const d of directions) {
        const future = advance(node.state, d); if (!future) continue;
        const head = future.segments.at(-1)!, target = source.food ?? source.bonus;
        const dx = target ? Math.abs(head.x - target.x) : 0, dy = target ? Math.abs(head.y - target.y) : 0;
        const distance = source.wrap ? Math.min(dx, source.size - dx) + Math.min(dy, source.size - dy) : dx + dy;
        const exits = directions.filter(direction => advance(future, direction)).length;
        const eaten = future.segments.length > node.state.segments.length;
        next.push({ state: future, steps: [...node.steps, { ...input(node.state, d), tick: node.state.tick }], score: distance * 4 - exits * 3 + depth * 0.2 - (eaten ? 50 : 0), eaten });
      }
    }
    if (!next.length) break;
    beam = next.sort((a, b) => a.score - b.score).slice(0, 24);
  }
  return beam.filter(n => n.steps.length).slice(0, 3).map(n => ({ label: `${n.eaten ? 'Reach fruit safely' : 'Safe route toward fruit'}; ${n.steps.length} normal direction inputs.`, steps: n.steps }));
}

function mergePlans(source: State<'2048'>): InputPlan[] {
  const directions = ['up', 'right', 'down', 'left'] as const;
  function value(board: number[][]) {
    const logs = board.map(row => row.map(v => v ? Math.log2(v) : 0));
    let roughness = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (x < 3) roughness += Math.abs(logs[y][x] - logs[y][x + 1]);
      if (y < 3) roughness += Math.abs(logs[y][x] - logs[y + 1][x]);
    }
    const maximum = Math.max(...board.flat()), corner = [board[0][0], board[0][3], board[3][0], board[3][3]].includes(maximum);
    return board.flat().filter(v => !v).length * 20 - roughness + (corner ? 20 : 0);
  }
  return directions.map(d => {
    const first = preview2048Move(source.board, d); if (!first.changed) return null;
    const empties = first.grid.flatMap((row, y) => row.flatMap((v, x) => !v ? [{ x, y }] : []));
    // Spawn positions are unknown: average possible visible-board futures, never peek at RNG.
    let expected = 0;
    for (const cell of empties) for (const [tile, weight] of [[2, 0.9], [4, 0.1]]) {
      const board = first.grid.map(row => [...row]); board[cell.y][cell.x] = tile;
      const best = Math.max(...directions.map(next => { const move = preview2048Move(board, next); return move.changed ? value(move.grid) + move.gained * 0.1 : -1000; }));
      expected += best * weight / empties.length;
    }
    if (!empties.length) expected = value(first.grid);
    return { score: expected + first.gained * 0.1, label: `${d}: two-turn outlook ${Math.round(expected)}; merge points ${first.gained}; empty cells ${first.empty}.`, steps: [input(source, d)] };
  }).filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => b.score - a.score).slice(0, 3).map(({ label, steps }) => ({ label, steps }));
}

function matchPlans(source: State<'match3'>): InputPlan[] {
  const size = source.board.length;
  function matches(board: number[][]) {
    const cells = new Set<string>();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (const d of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
      const run: Point[] = []; let p = { x, y };
      while (p.x < size && p.y < size && board[p.y][p.x] === board[y][x]) { run.push(p); p = { x: p.x + d.x, y: p.y + d.y }; }
      if (run.length >= 3) run.forEach(q => cells.add(`${q.x},${q.y}`));
    }
    return cells.size;
  }
  const plans: { plan: InputPlan; count: number }[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (const d of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
    const a = { x, y }, b = { x: x + d.x, y: y + d.y }; if (b.x >= size || b.y >= size) continue;
    const board = source.board.map(row => [...row]); [board[a.y][a.x], board[b.y][b.x]] = [board[b.y][b.x], board[a.y][a.x]];
    const count = matches(board); if (!count) continue;
    const state = structuredClone(source), steps: PlannedInput[] = [];
    if (state.selected && same(state.selected, a)) { steps.push(input(state, a)); state.selected = null; }
    if (state.selected) { steps.push(input(state, state.selected)); state.selected = null; }
    steps.push(input(state, a)); state.selected = a; steps.push(input(state, b));
    plans.push({ count, plan: { label: `Select and swap adjacent tiles to clear ${count} gems; each tap is separate.`, steps } });
  }
  return plans.sort((a, b) => b.count - a.count).slice(0, 3).map(p => p.plan);
}

function skyPlans(source: State<'sky'>): InputPlan[] {
  const targets = [source.target, ...[0, 1, 2].filter(lane => lane !== source.target && !source.obstacles.includes(lane))];
  return targets.map(lane => {
    const state = { ...source }, steps: PlannedInput[] = [];
    while (state.lane !== lane) { const action = state.lane < lane ? 'right' : 'left'; steps.push(input(state, action)); state.lane += action === 'right' ? 1 : -1; }
    if (!steps.length) steps.push(input(state, 'wait'));
    return { label: `${lane === source.target ? 'Collect the golden ring and avoid barriers' : 'Avoid barriers'} in lane ${lane}; ${steps.length} normal steering inputs.`, steps };
  });
}

export function createInputPlans(state: PlanningState, ahead: PlannedInput[] = []): InputPlan[] {
  switch (state.game) {
    case 'flappy': return flightPlans(state, ahead);
    case 'snake': return snakePlans(state);
    case 'tetris': return tetrisPlans(state);
    case 'maze': return mazePlans(state);
    case 'cargo': return cargoPlans(state);
    case 'lightsout': return lightPlans(state);
    case 'sudoku': return sudokuPlans(state);
    case '2048': return mergePlans(state);
    case 'match3': return matchPlans(state);
    case 'sky': return skyPlans(state);
    case 'pushball': return createPushballPlans(state);
  }
}
