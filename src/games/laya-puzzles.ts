export type SudokuMove = { index: number; value: number; candidates: number[] };

/** Candidate digits use only the displayed board's row, column and box. */
export function sudokuCandidates(board: number[], index: number) {
  const row = Math.floor(index / 9), col = index % 9;
  const used = new Set<number>();
  for (let i = 0; i < 9; i++) {
    const rowIndex = row * 9 + i;
    const colIndex = i * 9 + col;
    if (rowIndex !== index) used.add(board[rowIndex]);
    if (colIndex !== index) used.add(board[colIndex]);
  }
  for (let y = Math.floor(row / 3) * 3; y < Math.floor(row / 3) * 3 + 3; y++) {
    for (let x = Math.floor(col / 3) * 3; x < Math.floor(col / 3) * 3 + 3; x++) {
      const peer = y * 9 + x;
      if (peer !== index) used.add(board[peer]);
    }
  }
  return Array.from({ length: 9 }, (_, i) => i + 1).filter((value) => !used.has(value));
}

/** Bounded constraint search derives a completion without any stored answer. */
export function solveVisibleSudoku(visible: number[], budget = 50000): number[] | null {
  if (visible.length !== 81 || visible.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) return null;
  const board = [...visible];
  if (board.some((value, index) => value && !sudokuCandidates(board, index).includes(value))) return null;
  let remaining = budget;
  function search(): boolean {
    if (--remaining < 0) return false;
    let cell = -1;
    let digits: number[] = [];
    for (let index = 0; index < board.length; index++) {
      if (board[index]) continue;
      const allowed = sudokuCandidates(board, index);
      if (!allowed.length) return false;
      if (cell < 0 || allowed.length < digits.length) { cell = index; digits = allowed; }
      if (digits.length === 1) break;
    }
    if (cell < 0) return true;
    for (const value of digits) {
      board[cell] = value;
      if (search()) return true;
    }
    board[cell] = 0;
    return false;
  }
  return search() ? board : null;
}

export function sudokuLayaMoves(board: number[], givens: Set<number>): SudokuMove[] {
  const empty = board.flatMap((value, index) => value ? [] : [{ index, digits: sudokuCandidates(board, index) }]);
  const conflicts = board.flatMap((value, index) =>
    value && !givens.has(index) && !sudokuCandidates(board, index).includes(value) ? [index] : []);
  const repair = () => (conflicts.length ? conflicts : board.flatMap((value, index) => value && !givens.has(index) ? [index] : []))
    .slice(-16).map((index) => ({ index, value: 0, candidates: [] }));
  if (conflicts.length || empty.some((cell) => !cell.digits.length)) return repair();
  const forced = empty.filter((cell) => cell.digits.length === 1);
  if (forced.length) return forced.slice(0, 16).map((cell) => ({ index: cell.index, value: cell.digits[0], candidates: cell.digits }));
  const cell = empty.sort((a, b) => a.digits.length - b.digits.length)[0];
  if (!cell) return [];
  // On a branch, advertise only digits that admit a visible-board completion.
  const checked = cell.digits.filter((value) => {
    const next = [...board];
    next[cell.index] = value;
    return solveVisibleSudoku(next) !== null;
  });
  return checked.length
    ? checked.map((value) => ({ index: cell.index, value, candidates: cell.digits }))
    : repair();
}

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
      if (!floor.has(cell) || crates.has(cell) || routes.has(cell)) continue;
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
      if (!path) continue;
      const push = moveCargo(board, { player: behind, crates: [...state.crates] }, direction);
      const target = neighbor(board, crate, direction);
      if (!push || cargoCorner(board, target)) continue;
      const remainingGoals = board.goals.filter((goal) => goal === target || !push.state.crates.includes(goal));
      const distance = Math.min(...(remainingGoals.length ? remainingGoals : board.goals).map((goal) =>
        Math.abs(goal % board.width - target % board.width) + Math.abs(Math.floor(goal / board.width) - Math.floor(target / board.width))));
      plans.push({
        route: [...path, direction], crate, target, direction,
        delivered: push.state.crates.filter((cell) => board.goals.includes(cell)).length,
        distance
      });
    }
  }
  return plans.sort((a, b) => b.delivered - a.delivered || a.distance - b.distance || a.route.length - b.route.length).slice(0, 16);
}
import { CargoBoard, CargoDirection, CargoState, DIRECTIONS, cargoCorner, moveCargo, neighbor } from './cargo/model';
