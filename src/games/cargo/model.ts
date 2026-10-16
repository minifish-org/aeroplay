export type CargoState = {
  player: number;
  crates: number[];
};
export type CargoBoard = {
  width: number;
  height: number;
  floor: number[];
  goals: number[];
  initial: CargoState;
};
export const DIRECTIONS = [
  { key: 'up', x: 0, y: -1 },
  { key: 'right', x: 1, y: 0 },
  { key: 'down', x: 0, y: 1 },
  { key: 'left', x: -1, y: 0 }
] as const;
export type CargoDirection = (typeof DIRECTIONS)[number]['key'];
export function parseCargo(map: string[]): CargoBoard {
  const width = Math.max(...map.map((row) => row.length)), height = map.length;
  const floor: number[] = [], goals: number[] = [], crates: number[] = [];
  let player = -1;
  map.forEach((row, y) => [...row].forEach((cell, x) => {
    const index = y * width + x;
    if (cell === '#')
      return;
    floor.push(index);
    if ('.+*'.includes(cell))
      goals.push(index);
    if ('$*'.includes(cell))
      crates.push(index);
    if ('@+'.includes(cell))
      player = index;
  }));
  return { width, height, floor, goals, initial: { player, crates } };
}
export function neighbor(board: CargoBoard, cell: number, direction: CargoDirection) {
  const d = DIRECTIONS.find((d) => d.key === direction)!;
  const x = (cell % board.width) + d.x, y = Math.floor(cell / board.width) + d.y;
  return x < 0 || x >= board.width || y < 0 || y >= board.height
    ? -1
    : y * board.width + x;
}
export function moveCargo(board: CargoBoard, state: CargoState, direction: CargoDirection): {
  state: CargoState;
  pushed: boolean;
} | null {
  const target = neighbor(board, state.player, direction);
  if (!board.floor.includes(target))
    return null;
  const crateIndex = state.crates.indexOf(target), crates = [...state.crates];
  if (crateIndex >= 0) {
    const beyond = neighbor(board, target, direction);
    if (!board.floor.includes(beyond) || crates.includes(beyond))
      return null;
    crates[crateIndex] = beyond;
  }
  return { state: { player: target, crates }, pushed: crateIndex >= 0 };
}
export function cargoSolved(board: CargoBoard, state: CargoState) {
  return state.crates.every((cell) => board.goals.includes(cell));
}
export function cargoCorner(board: CargoBoard, cell: number) {
  if (board.goals.includes(cell))
    return false;
  const wall = DIRECTIONS.map((d) => !board.floor.includes(neighbor(board, cell, d.key)));
  return (wall[0] || wall[2]) && (wall[1] || wall[3]);
}
export type CargoNode = {
  state: CargoState;
  route: CargoDirection[];
  pushes: number;
};
/**
 * Minimum-push solver over walking regions. Generation, the in-stage hint and the
 * resident model all call this one implementation, so every island stays solvable.
 */
export function solveCargo(board: CargoBoard, start: CargoState, limit = 20000): {
  moves: CargoDirection[];
  pushes: number;
} | null {
  const floor = new Set(board.floor);
  function reachable(state: CargoState) {
    const routes = new Map<number, CargoDirection[]>([[state.player, []]]), queue = [state.player], crates = new Set(state.crates);
    for (let i = 0; i < queue.length; i++)
      for (const d of DIRECTIONS) {
        const next = neighbor(board, queue[i], d.key);
        if (!floor.has(next) || crates.has(next) || routes.has(next))
          continue;
        routes.set(next, [...routes.get(queue[i])!, d.key]);
        queue.push(next);
      }
    return routes;
  }
  const queue: CargoNode[] = [{ state: start, route: [], pushes: 0 }], seen = new Set<string>();
  for (let index = 0; index < queue.length && index < limit; index++) {
    const { state, route, pushes } = queue[index];
    if (cargoSolved(board, state))
      return { moves: route, pushes };
    const paths = reachable(state), key = `${[...state.crates].sort((a, b) => a - b)}|${Math.min(...paths.keys())}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    for (let i = 0; i < state.crates.length; i++)
      for (let d = 0; d < 4; d++) {
        const crate = state.crates[i], direction = DIRECTIONS[d].key;
        const from = neighbor(board, crate, DIRECTIONS[(d + 2) % 4].key), target = neighbor(board, crate, direction);
        if (!paths.has(from) ||
          !floor.has(target) ||
          state.crates.includes(target) ||
          cargoCorner(board, target))
          continue;
        const crates = [...state.crates];
        crates[i] = target;
        queue.push({
          state: { player: crate, crates },
          route: [...route, ...paths.get(from)!, direction],
          pushes: pushes + 1
        });
      }
  }
  return null;
}
export type CargoLevel = {
  number: number;
  name: string;
  tip: string;
  map: string[];
  par: number;
  crates: number;
  difficulty: string;
};
const TIERS = ['Jetty', 'Quay', 'Crane Yard', 'Cold Store', 'Dry Dock', 'Breakwater', 'High Bay', 'Causeway', 'Terminal', 'Long Wharf'];
const TIPS = [
  'Push the crate onto the glowing dock. You can push, never pull.',
  'Walk around a crate to push from a new direction.',
  'Two deliveries: the order matters, so keep space to walk.',
  'Deliver every crate. A blocked crate may need Undo.'
];
const OPPOSITE: Record<CargoDirection, CargoDirection> = { up: 'down', down: 'up', left: 'right', right: 'left' };
/** Each island number owns a deterministic stream, so a saved run always regenerates its level. */
function seeded(seed: number) {
  let state = (Math.imul(seed, 2654435761) ^ 0x85ebca6b) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const shuffled = <T,>(values: T[], random: () => number) => {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
};
const pick = <T,>(list: T[], random: () => number) => list[Math.floor(random() * list.length)];
/** Bounded step that treats everything outside the wall ring as blocked. */
function stepInside(cell: number, direction: CargoDirection, width: number, height: number) {
  const delta = DIRECTIONS.find((item) => item.key === direction)!;
  const x = (cell % width) + delta.x, y = Math.floor(cell / width) + delta.y;
  return x < 1 || y < 1 || x > width - 2 || y > height - 2 ? -1 : y * width + x;
}
type CargoShape = {
  width: number;
  height: number;
  walls: Set<number>;
  pockets: Set<number>;
  goals: number[];
  crates: number[];
  player: number;
};
/** A cell with a blocked side on two axes; a crate pushed there can never be pulled back. */
function cargoPockets(width: number, height: number, walls: ReadonlySet<number>) {
  const pockets = new Set<number>();
  for (let y = 1; y <= height - 2; y++)
    for (let x = 1; x <= width - 2; x++) {
      const cell = y * width + x;
      if (walls.has(cell))
        continue;
      const blocked = (directions: CargoDirection[]) => directions.some((key) => {
        const next = stepInside(cell, key, width, height);
        return next < 0 || walls.has(next);
      });
      if (blocked(['up', 'down']) && blocked(['left', 'right']))
        pockets.add(cell);
    }
  return pockets;
}
function cargoLayout(width: number, height: number, random: () => number, crates: number, density: number): CargoShape {
  const inside: number[] = [];
  for (let y = 1; y <= height - 2; y++)
    for (let x = 1; x <= width - 2; x++)
      inside.push(y * width + x);
  const walls = new Set<number>();
  const connected = () => {
    const from = inside.find((cell) => !walls.has(cell));
    if (from === undefined)
      return false;
    const seen = new Set<number>([from]), queue = [from];
    for (let index = 0; index < queue.length; index++)
      for (const { key } of DIRECTIONS) {
        const cell = stepInside(queue[index], key, width, height);
        if (cell < 0 || walls.has(cell) || seen.has(cell))
          continue;
        seen.add(cell);
        queue.push(cell);
      }
    return seen.size === inside.length - walls.size;
  };
  // A wall never splits the room, and the room always keeps walking space.
  for (const cell of shuffled(inside, random)) {
    if (random() >= density || inside.length - walls.size < crates * 3 + 8)
      continue;
    walls.add(cell);
    if (!connected())
      walls.delete(cell);
  }
  const open = inside.filter((cell) => !walls.has(cell));
  const pockets = cargoPockets(width, height, walls);
  const spots = open.filter((cell) => !pockets.has(cell));
  const goals = shuffled(spots.length >= crates ? spots : open, random).slice(0, crates);
  return { width, height, walls, pockets, goals, crates: [...goals], player: pick(open.filter((cell) => !goals.includes(cell)), random) };
}
/** Undoing a push from the delivered state stays a legal forward push by construction. */
function cargoScramble(shape: CargoShape, steps: number, random: () => number) {
  const distance = (cell: number, goal: number) =>
    Math.abs((cell % shape.width) - (goal % shape.width)) + Math.abs(Math.floor(cell / shape.width) - Math.floor(goal / shape.width));
  let done = 0;
  for (; done < steps; done++) {
    const occupied = new Set(shape.crates), moves: { index: number; from: number; player: number; gain: number }[] = [];
    shape.crates.forEach((crate, index) => {
      for (const { key } of DIRECTIONS) {
        const from = stepInside(crate, OPPOSITE[key], shape.width, shape.height);
        const behind = from < 0 ? -1 : stepInside(from, OPPOSITE[key], shape.width, shape.height);
        if (from < 0 || behind < 0 || shape.walls.has(from) || shape.walls.has(behind) || shape.pockets.has(from) || occupied.has(from) || occupied.has(behind))
          continue;
        moves.push({ index, from, player: behind, gain: distance(from, shape.goals[index]) - distance(crate, shape.goals[index]) });
      }
    });
    // Crates that wander into a pocket can only be pulled until every crate is stuck.
    if (!moves.length)
      break;
    // Walk crates away from their dock, otherwise a random pull ends next to the goal.
    const spreading = moves.filter((move) => move.gain > 0);
    const move = pick(spreading.length && random() < 0.75 ? spreading : moves, random);
    shape.crates[move.index] = move.from;
    shape.player = move.player;
  }
  return done;
}
function cargoMap(shape: CargoShape) {
  const map: string[] = [];
  for (let y = 0; y < shape.height; y++) {
    let row = '';
    for (let x = 0; x < shape.width; x++) {
      const cell = y * shape.width + x;
      const border = x === 0 || y === 0 || x === shape.width - 1 || y === shape.height - 1;
      row += border || shape.walls.has(cell) ? '#' :
        shape.crates.includes(cell) ? (shape.goals.includes(cell) ? '*' : '$') :
        shape.player === cell ? (shape.goals.includes(cell) ? '+' : '@') :
        shape.goals.includes(cell) ? '.' : ' ';
    }
    map.push(row);
  }
  return map;
}
const LEVEL_CACHE = new Map<number, CargoLevel>();
/** Two islands per stage, then the last stage repeats: the solver budget sets that ceiling. */
const STAGES = [
  { crates: 1, width: 9, height: 7, density: 0 },
  { crates: 1, width: 9, height: 7, density: 0.05 },
  { crates: 2, width: 9, height: 7, density: 0.06 },
  { crates: 2, width: 9, height: 8, density: 0.08 },
  { crates: 2, width: 10, height: 8, density: 0.1 },
  { crates: 2, width: 10, height: 9, density: 0.1 },
  { crates: 3, width: 9, height: 7, density: 0.06 },
  { crates: 3, width: 9, height: 7, density: 0.08 }
];
/**
 * Generated islands never run out: every island is scrambled from a delivered state and
 * accepted only when the shipped solver still proves it deliverable inside the same
 * budget the in-stage hint and the resident model use, so every island stays playable.
 */
export function cargoLevel(number: number): CargoLevel {
  const level = Math.max(1, Math.floor(Number(number)) || 1);
  const known = LEVEL_CACHE.get(level);
  if (known)
    return known;
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor((level - 1) / 2))];
  const floorPar = level === 1 ? 2 : level < 5 ? 4 : 6;
  const wantedPar = clamp(3 + Math.floor(level / 2), floorPar, 3 + stage.crates * 2);
  const build = (attempt: number, crates: number, density: number) => {
    const random = seeded(level * 7919 + attempt);
    const shape = cargoLayout(stage.width, stage.height, random, crates, density);
    const steps = cargoScramble(shape, Math.min(10 + level * 2, 34), random);
    if (shape.crates.every((cell) => shape.goals.includes(cell)) || steps < 6)
      return null;
    const map = cargoMap(shape), board = parseCargo(map);
    if (board.goals.length !== shape.goals.length || board.initial.crates.length !== shape.goals.length)
      return null;
    // A budget equal to the hint's 20000 nodes keeps every accepted island hintable.
    const answer = solveCargo(board, board.initial, 20000);
    if (!answer || answer.pushes < floorPar || answer.pushes > 16)
      return null;
    return {
      number: level,
      name: TIERS[(level - 1) % TIERS.length],
      tip: TIPS[Math.min(shape.goals.length, TIPS.length - 1)],
      map,
      par: answer.pushes,
      crates: shape.goals.length,
      difficulty: answer.pushes <= 4 ? 'Gentle' : answer.pushes <= 8 ? 'Steady' : answer.pushes <= 12 ? 'Hard' : 'Packed'
    } as CargoLevel;
  };
  let best: CargoLevel | null = null, solved = 0;
  for (let attempt = 0; attempt < 4 && solved < 2; attempt++) {
    const candidate = build(attempt, attempt < 3 ? stage.crates : Math.max(1, stage.crates - 1), attempt < 3 ? stage.density : stage.density / 2);
    if (!candidate)
      continue;
    solved++;
    if (candidate.par >= wantedPar)
      return remember(candidate);
    if (!best || candidate.par > best.par)
      best = candidate;
  }
  if (best)
    return remember(best);
  const random = seeded(level), shape = cargoLayout(9, 7, random, 1, 0);
  cargoScramble(shape, 8, random);
  const map = cargoMap(shape), board = parseCargo(map);
  const answer = solveCargo(board, board.initial, 20000);
  return remember({ number: level, name: TIERS[(level - 1) % TIERS.length], tip: TIPS[0], map,
    par: answer?.pushes ?? 2, crates: 1, difficulty: 'Gentle' });
  function remember(levelData: CargoLevel) {
    if (LEVEL_CACHE.size > 32)
      LEVEL_CACHE.clear();
    LEVEL_CACHE.set(level, levelData);
    return levelData;
  }
}
type CargoUndo = { state: CargoState; pushes: number };
export type CargoSave = {
  level: number;
  state: CargoState;
  moves: number;
  pushes: number;
  usedHint: boolean;
  history?: CargoUndo[];
};
export class CargoRun {
  mode = 'playing';
  level = 0;
  data: CargoLevel;
  board: CargoBoard;
  state: CargoState;
  moves = 0;
  pushes = 0;
  usedHint = false;
  hintDirection: CargoDirection | null = null;
  epoch = 0;
  stars: Record<string, number>;
  history: CargoUndo[] = [];
  constructor(saved: CargoSave | null = null, stars: Record<string, number> = {}) {
    this.stars = stars;
    this.level = Math.max(0, Math.floor(Number(saved?.level ?? 0)) || 0);
    this.data = cargoLevel(this.level + 1);
    this.board = parseCargo(this.data.map);
    this.state = structuredClone(this.board.initial);
    if (saved && saved.state && Array.isArray(saved.state.crates) && saved.state.crates.length === this.state.crates.length && saved.state.crates.every(c => this.board.floor.includes(c)) && new Set(saved.state.crates).size === saved.state.crates.length && this.board.floor.includes(saved.state.player) && !saved.state.crates.includes(saved.state.player)) {
      this.state = structuredClone(saved.state);
      this.moves = Math.max(0, saved.moves || 0);
      this.pushes = Math.max(0, saved.pushes || 0);
      this.usedHint = !!saved.usedHint;
      if (Array.isArray(saved.history) && saved.history.length <= 200 && saved.history.length <= this.moves && saved.history.every(item => item && Number.isInteger(item.pushes) && item.pushes >= 0 && item.pushes <= this.pushes && item.state && Array.isArray(item.state.crates) && item.state.crates.length === this.state.crates.length && new Set(item.state.crates).size === item.state.crates.length && item.state.crates.every(c => this.board.floor.includes(c)) && this.board.floor.includes(item.state.player) && !item.state.crates.includes(item.state.player)))
        this.history = structuredClone(saved.history);
    }
    this.sync();
  }
  sync() { this.mode = cargoSolved(this.board, this.state) ? 'won' : 'playing'; }
  /** Restart replays the island; a delivered island moves on to the next generated one. */
  reset() { this.loadLevel(this.level + (this.mode === 'won' ? 1 : 0)); }
  loadLevel(level: number) {
    this.level = Math.max(0, Math.floor(Number(level)) || 0);
    this.data = cargoLevel(this.level + 1);
    this.board = parseCargo(this.data.map);
    this.state = structuredClone(this.board.initial);
    this.moves = this.pushes = 0;
    this.usedHint = false;
    this.hintDirection = null;
    this.history = [];
    this.epoch++;
    this.sync();
  }
  act(input: unknown) {
    if (input === 'restart') {
      this.reset();
      return true;
    }
    if (input === 'next') {
      this.loadLevel(this.level + 1);
      return true;
    }
    if (typeof input === 'object' && input && 'level' in input) {
      this.loadLevel(Number((input as {
        level: number;
      }).level));
      return true;
    }
    if (input === 'undo') {
      const previous = this.history.pop();
      if (!previous)
        return false;
      this.state = previous.state;
      this.pushes = previous.pushes;
      this.moves--;
      this.hintDirection = null;
      this.epoch++;
      this.sync();
      return true;
    }
    if (this.mode !== 'playing' || !DIRECTIONS.some(d => d.key === input))
      return false;
    const next = moveCargo(this.board, this.state, input as CargoDirection);
    if (!next)
      return false;
    this.history.push({ state: structuredClone(this.state), pushes: this.pushes });
    this.state = next.state;
    this.moves++;
    if (next.pushed)
      this.pushes++;
    this.hintDirection = null;
    this.sync();
    if (String(this.mode) === 'won') {
      const par = this.data.par, stars = this.pushes <= par && !this.usedHint ? 3 : this.pushes <= par + 3 ? 2 : 1;
      this.stars[this.level] = Math.max(this.stars[this.level] ?? 0, stars);
    }
    return true;
  }
  step(_dt: number) { void _dt; }
  pause() { if (this.mode === 'playing')
    this.mode = 'paused'; this.hintDirection = null; }
  resume() { if (this.mode === 'paused')
    this.sync(); }
  save(): CargoSave { return { level: this.level, state: structuredClone(this.state), moves: this.moves, pushes: this.pushes, usedHint: this.usedHint, history: structuredClone(this.history.slice(-200)) }; }
  planning() { return this.mode === 'playing' ? { game: 'cargo' as const, epoch: String(this.epoch) + ':' + this.level, board: structuredClone(this.board), state: structuredClone(this.state) } : null; }
  snapshot() { return { game: 'cargo', mode: this.mode, level: this.level + 1, name: this.data.name, difficulty: this.data.difficulty, crates: this.data.crates, map: [...this.data.map], board: this.board, state: this.state, moves: this.moves, pushes: this.pushes, par: this.data.par, usedHint: this.usedHint, hintDirection: this.hintDirection, stars: this.stars, history: this.history.length }; }
}
