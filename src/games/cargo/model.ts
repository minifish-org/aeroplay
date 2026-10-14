export type CargoState = {
  player: number;
  crates: number[];
};
export type CargoLevel = {
  name: string;
  tip: string;
  map: string[];
  par: number;
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
export const CARGO_LEVELS: CargoLevel[] = [
  { "name": "First Delivery", "tip": "Push the crate onto the glowing dock. You can push, never pull.", "map": ["#######", "#     #", "# @$ .#", "#     #", "#######"], "par": 2 },
  { "name": "Around the Corner", "tip": "Walk around a crate to push from a new direction.", "map": ["#######", "#  .  #", "#     #", "# @$  #", "#     #", "#######"], "par": 2 },
  { "name": "Two to Go", "tip": "The order of your deliveries matters. Keep space to walk.", "map": ["########", "# .  . #", "# $  $ #", "#   @  #", "#      #", "########"], "par": 2 },
  { "name": "Harbor Turn", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#   . #", "##    #", "# $   #", "#@#   #", "# *   #", "#######"], "par": 4 },
  { "name": "Side Street", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#     #", "#$$  ##", "#   . #", "#  @  #", "#.#   #", "#######"], "par": 6 },
  { "name": "The Courtyard", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#   . #", "# $ # #", "#  $ .#", "# @   #", "#  #  #", "#######"], "par": 5 },
  { "name": "Cross Traffic", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#     #", "# $   #", "#  @  #", "### $ #", "#   ..#", "#######"], "par": 7 },
  { "name": "Tight Quarters", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#   #@#", "##  $$#", "#   $.#", "#.  . #", "##    #", "#######"], "par": 7 },
  { "name": "Three Little Parcels", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#. .$@#", "# ##$$#", "#     #", "#  # .#", "#     #", "#######"], "par": 7 },
  { "name": "Island Exchange", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#    ##", "#@$ $ #", "#.#   #", "# #   #", "#.. $ #", "#######"], "par": 10 },
  { "name": "Last Mile", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "#  .# #", "#  $$ #", "#     #", "## $@##", "# ..  #", "#######"], "par": 7 },
  { "name": "Master Courier", "tip": "Protect your walking space. A crate in a corner may need Undo.", "map": ["#######", "##  #+#", "# . *$#", "#   # #", "# $#  #", "#     #", "#######"], "par": 9 }
];
export type CargoSave = {
  level: number;
  state: CargoState;
  moves: number;
  pushes: number;
  usedHint: boolean;
};
export class CargoRun {
  mode = 'playing';
  level = 0;
  board: CargoBoard;
  state: CargoState;
  moves = 0;
  pushes = 0;
  usedHint = false;
  hintDirection: CargoDirection | null = null;
  epoch = 0;
  stars: Record<string, number>;
  history: {
    state: CargoState;
    pushes: number;
  }[] = [];
  constructor(saved: CargoSave | null = null, stars: Record<string, number> = {}) {
    this.stars = stars;
    this.level = Math.max(0, Math.min(11, Math.floor(saved?.level ?? 0)));
    this.board = parseCargo(CARGO_LEVELS[this.level].map);
    this.state = structuredClone(this.board.initial);
    if (saved && saved.state && Array.isArray(saved.state.crates) && saved.state.crates.length === this.state.crates.length && saved.state.crates.every(c => this.board.floor.includes(c)) && new Set(saved.state.crates).size === saved.state.crates.length && this.board.floor.includes(saved.state.player) && !saved.state.crates.includes(saved.state.player)) {
      this.state = structuredClone(saved.state);
      this.moves = Math.max(0, saved.moves || 0);
      this.pushes = Math.max(0, saved.pushes || 0);
      this.usedHint = !!saved.usedHint;
    }
    this.sync();
  }
  sync() { this.mode = cargoSolved(this.board, this.state) ? 'won' : 'playing'; }
  reset() { this.loadLevel(this.level); }
  loadLevel(level: number) {
    this.level = Math.max(0, Math.min(11, level));
    this.board = parseCargo(CARGO_LEVELS[this.level].map);
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
      this.loadLevel((this.level + 1) % 12);
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
      const par = CARGO_LEVELS[this.level].par, stars = this.pushes <= par && !this.usedHint ? 3 : this.pushes <= par + 3 ? 2 : 1;
      this.stars[this.level] = Math.max(this.stars[this.level] ?? 0, stars);
    }
    return true;
  }
  step(_dt: number) { void _dt; }
  pause() { if (this.mode === 'playing')
    this.mode = 'paused'; this.hintDirection = null; }
  resume() { if (this.mode === 'paused')
    this.sync(); }
  save(): CargoSave { return { level: this.level, state: structuredClone(this.state), moves: this.moves, pushes: this.pushes, usedHint: this.usedHint }; }
  planning() { return this.mode === 'playing' ? { game: 'cargo' as const, epoch: String(this.epoch) + ':' + this.level, board: structuredClone(this.board), state: structuredClone(this.state) } : null; }
  snapshot() { return { game: 'cargo', mode: this.mode, level: this.level + 1, name: CARGO_LEVELS[this.level].name, board: this.board, state: this.state, moves: this.moves, pushes: this.pushes, par: CARGO_LEVELS[this.level].par, usedHint: this.usedHint, hintDirection: this.hintDirection, stars: this.stars, history: this.history.length }; }
}
