export const BOARD_MIN = 5;
export const BOARD_MAX = 8;
/** The board grows while a square still stays readable on a phone. */
export function lightsBoardSize(level: number) {
  if (level <= 4)
    return 5;
  if (level <= 8)
    return 6;
  if (level <= 14)
    return 7;
  return BOARD_MAX;
}
/** Minimum taps rise with the puzzle number, so difficulty never plateaus early. */
export function lightsParTarget(level: number) {
  return Math.min(lightsBoardSize(level) ** 2, 3 + Math.floor((level - 1) * 1.5));
}
export function applyToggle(board: number[], x: number, y: number, size: number) {
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < size && ny < size)
      board[ny * size + nx] ^= 1;
  }
}
export function isSolved(board: number[]) {
  return board.every((v) => v === 0);
}
/**
 * Row-reduce over GF(2), then enumerate free variables for a minimum-tap hint.
 * Every shipped size has a nullity of at most two, so this stays a handful of passes.
 */
export function solveLights(board: number[], size: number): number[] {
  const cells = size * size;
  if (board.length !== cells)
    return [];
  const matrix = Array.from({ length: cells }, (_, row) => {
    const taps = Array(cells).fill(0);
    applyToggle(taps, row % size, Math.floor(row / size), size);
    return [...taps, board[row]];
  });
  const pivots: number[] = [];
  for (let col = 0, row = 0; col < cells && row < cells; col++) {
    const pivot = matrix.findIndex((r, i) => i >= row && r[col] === 1);
    if (pivot < 0)
      continue;
    [matrix[row], matrix[pivot]] = [matrix[pivot], matrix[row]];
    for (let i = 0; i < cells; i++)
      if (i !== row && matrix[i][col])
        for (let j = col; j <= cells; j++)
          matrix[i][j] ^= matrix[row][j];
    pivots.push(col);
    row++;
  }
  const free = Array.from({ length: cells }, (_, i) => i).filter((i) => !pivots.includes(i));
  if (free.length > 12)
    return [];
  let best: number[] | null = null;
  for (let mask = 0; mask < 2 ** free.length; mask++) {
    const solution = Array(cells).fill(0);
    free.forEach((col, i) => {
      solution[col] = (mask >> i) & 1;
    });
    pivots.forEach((col, row) => {
      solution[col] = matrix[row][cells];
      free.forEach((f) => {
        solution[col] ^= matrix[row][f] & solution[f];
      });
    });
    const pressed = solution.flatMap((v, i) => (v ? [i] : []));
    if (!best || pressed.length < best.length)
      best = pressed;
  }
  return best ?? [];
}
export type LightsPuzzle = {
  size: number;
  board: number[];
  par: number;
};
/**
 * A puzzle is the parity of distinct taps, so its minimum tap count is the intended
 * par: sizes from six up have a unique solution and accept it directly, while the
 * five-by-five board retries until its quiet patterns cannot shorten the answer.
 */
export function lightsPuzzle(level: number, random: () => number = Math.random): LightsPuzzle {
  const size = lightsBoardSize(level), cells = size * size, target = lightsParTarget(level);
  for (let attempt = 0; attempt < 12; attempt++) {
    const board = Array<number>(cells).fill(0);
    const pool = Array.from({ length: cells }, (_, index) => index);
    for (let tap = 0; tap < target; tap++) {
      const cell = pool.splice(Math.floor(random() * pool.length), 1)[0];
      applyToggle(board, cell % size, Math.floor(cell / size), size);
    }
    const par = solveLights(board, size).length;
    if (par >= target || attempt === 11)
      return { size, board, par };
  }
  return { size, board: Array<number>(cells).fill(0), par: 0 };
}
export type LightsSave = {
  size?: number;
  board: number[];
  initial: number[];
  moves: number;
  level: number;
  hintsUsed: number;
  history?: number[][];
};
const isBinaryBoard = (value: unknown, cells: number) => Array.isArray(value) && value.length === cells &&
  value.every((cell) => cell === 0 || cell === 1);
export function validLightsSave(value: unknown): value is LightsSave {
  if (!value || typeof value !== 'object')
    return false;
  const save = value as LightsSave;
  const cells = Array.isArray(save.board) ? save.board.length : 0;
  const size = Number.isInteger(save.size) ? save.size! : Math.round(Math.sqrt(cells));
  return size >= BOARD_MIN && size <= BOARD_MAX && size * size === cells &&
    isBinaryBoard(save.board, cells) && isBinaryBoard(save.initial, cells) &&
    Number.isInteger(save.moves) && save.moves >= 0 &&
    Number.isInteger(save.level) && save.level >= 1 && Number.isInteger(save.hintsUsed) && save.hintsUsed >= 0;
}
export function createLightsOutModel(saved: unknown = null, random = Math.random) {
  const history: number[][] = [];
  const model = {
    mode: 'playing' as 'playing' | 'paused' | 'won',
    size: 5,
    board: Array<number>(25).fill(0), initial: Array<number>(25).fill(0),
    moves: 0, level: 1, hintsUsed: 0, hinted: -1, par: 0, epoch: 0, clock: 0,
    fresh() {
      const puzzle = lightsPuzzle(model.level, random);
      model.size = puzzle.size;
      model.board = [...puzzle.board];
      model.initial = [...model.board];
      model.par = puzzle.par;
      model.reset();
    },
    reset() {
      model.board = [...model.initial];
      model.moves = 0;
      model.hintsUsed = 0;
      model.hinted = -1;
      model.epoch++;
      model.clock = 0;
      history.length = 0;
      model.mode = isSolved(model.board) ? 'won' : 'playing';
    },
    undo() {
      const previous = history.pop();
      if (!previous)
        return false;
      model.board = previous;
      model.moves--;
      model.hinted = -1;
      model.mode = 'playing';
      model.epoch++;
      return true;
    },
    hint() {
      if (model.mode !== 'playing')
        return false;
      model.hinted = solveLights(model.board, model.size)[0] ?? -1;
      model.hintsUsed++;
      return model.hinted >= 0;
    },
    next() {
      if (model.mode !== 'won')
        return false;
      model.level++;
      model.fresh();
      return true;
    },
    act(input: unknown) {
      if (input === 'undo')
        return model.undo();
      if (input === 'hint')
        return model.hint();
      if (input === 'retry' || input === 'restart') {
        model.reset();
        return true;
      }
      if (input === 'next')
        return model.next();
      if (model.mode !== 'playing' || typeof input !== 'number' || !Number.isInteger(input) ||
        input < 0 || input >= model.size * model.size)
        return false;
      history.push([...model.board]);
      if (history.length > 20)
        history.shift();
      model.moves++;
      model.hinted = -1;
      applyToggle(model.board, input % model.size, Math.floor(input / model.size), model.size);
      if (isSolved(model.board))
        model.mode = 'won';
      return true;
    },
    step(dt: number) { if (model.mode === 'playing')
      model.clock += Math.max(0, dt); },
    pause() { if (model.mode === 'playing')
      model.mode = 'paused'; },
    resume() { if (model.mode === 'paused')
      model.mode = 'playing'; },
    saved(): LightsSave {
      return { size: model.size, board: [...model.board], initial: [...model.initial], moves: model.moves,
        level: model.level, hintsUsed: model.hintsUsed, history: history.map(board => [...board]) };
    },
    snapshot() {
      return { game: 'lightsout', mode: model.mode, size: model.size, board: [...model.board], initial: [...model.initial], moves: model.moves,
        level: model.level, hintsUsed: model.hintsUsed, hinted: model.hinted, par: model.par,
        undoCount: history.length, stars: model.mode === 'won' ? model.stars() : 0, epoch: model.epoch };
    },
    stars() { return model.moves <= model.par && !model.hintsUsed ? 3 : model.moves <= model.par + 3 ? 2 : 1; },
    planning() {
      return model.mode === 'playing' ? { game: 'lightsout' as const,
        epoch: `${model.epoch}:${model.level}:${model.initial.join('')}`, board: [...model.board], size: model.size } : null;
    },
    summary() {
      return { level: model.level, size: model.size, moves: model.moves, par: model.par, lit: model.board.filter(Boolean).length,
        hintsUsed: model.hintsUsed, undoCount: history.length, stars: model.mode === 'won' ? model.stars() : 0 };
    }
  };
  if (validLightsSave(saved)) {
    const cells = saved.board.length;
    model.size = Number.isInteger(saved.size) ? saved.size! : Math.round(Math.sqrt(cells));
    model.board = [...saved.board];
    model.initial = [...saved.initial];
    model.moves = saved.moves;
    model.level = saved.level;
    model.hintsUsed = saved.hintsUsed;
    model.par = solveLights(model.initial, model.size).length;
    if (Array.isArray(saved.history) && saved.history.length <= Math.min(20, saved.moves) && saved.history.every(board =>
      isBinaryBoard(board, cells)))
      history.push(...saved.history.map(board => [...board]));
    if (isSolved(model.board))
      model.mode = 'won';
  }
  else
    model.fresh();
  return model;
}
export type LightsModel = ReturnType<typeof createLightsOutModel>;
