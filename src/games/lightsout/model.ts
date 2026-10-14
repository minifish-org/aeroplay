const SIZE = 5;
export function applyToggle(board: number[], x: number, y: number) {
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE)
      board[ny * SIZE + nx] ^= 1;
  }
}
export function isSolved(board: number[]) {
  return board.every((v) => v === 0);
}
// Row-reduce over GF(2), then enumerate free variables for a minimum-tap hint.
export function solveLights(board: number[]): number[] {
  const matrix = Array.from({ length: 25 }, (_, row) => {
    const cells = Array(25).fill(0);
    applyToggle(cells, row % SIZE, Math.floor(row / SIZE));
    return [...cells, board[row]];
  });
  const pivots: number[] = [];
  for (let col = 0, row = 0; col < 25 && row < 25; col++) {
    const pivot = matrix.findIndex((r, i) => i >= row && r[col] === 1);
    if (pivot < 0)
      continue;
    [matrix[row], matrix[pivot]] = [matrix[pivot], matrix[row]];
    for (let i = 0; i < 25; i++)
      if (i !== row && matrix[i][col])
        for (let j = col; j <= 25; j++)
          matrix[i][j] ^= matrix[row][j];
    pivots.push(col);
    row++;
  }
  const free = Array.from({ length: 25 }, (_, i) => i).filter((i) => !pivots.includes(i));
  let best: number[] | null = null;
  for (let mask = 0; mask < 2 ** free.length; mask++) {
    const solution = Array(25).fill(0);
    free.forEach((col, i) => {
      solution[col] = (mask >> i) & 1;
    });
    pivots.forEach((col, row) => {
      solution[col] = matrix[row][25];
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
export type LightsSave = {
  board: number[];
  initial: number[];
  moves: number;
  level: number;
  hintsUsed: number;
};
export function validLightsSave(value: unknown): value is LightsSave {
  if (!value || typeof value !== 'object')
    return false;
  const save = value as LightsSave;
  return [save.board, save.initial].every(board => Array.isArray(board) && board.length === 25 &&
    board.every(cell => cell === 0 || cell === 1)) && Number.isInteger(save.moves) && save.moves >= 0 &&
    Number.isInteger(save.level) && save.level >= 1 && Number.isInteger(save.hintsUsed) && save.hintsUsed >= 0;
}
export function createLightsOutModel(saved: unknown = null, random = Math.random) {
  const history: number[][] = [];
  const model = {
    mode: 'playing' as 'playing' | 'paused' | 'won',
    board: Array<number>(25).fill(0), initial: Array<number>(25).fill(0),
    moves: 0, level: 1, hintsUsed: 0, hinted: -1, par: 0, epoch: 0, clock: 0,
    fresh() {
      model.board = Array<number>(25).fill(0);
      const cells = Array.from({ length: 25 }, (_, index) => index);
      for (let index = 0; index < Math.min(12, 2 + model.level); index++) {
        const cell = cells.splice(Math.floor(random() * cells.length), 1)[0];
        applyToggle(model.board, cell % 5, Math.floor(cell / 5));
      }
      if (isSolved(model.board))
        applyToggle(model.board, 2, 2);
      model.initial = [...model.board];
      model.par = solveLights(model.initial).length;
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
      model.hinted = solveLights(model.board)[0] ?? -1;
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
      if (model.mode !== 'playing' || typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input >= 25)
        return false;
      history.push([...model.board]);
      model.moves++;
      model.hinted = -1;
      applyToggle(model.board, input % 5, Math.floor(input / 5));
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
      return { board: [...model.board], initial: [...model.initial], moves: model.moves,
        level: model.level, hintsUsed: model.hintsUsed };
    },
    snapshot() {
      return { game: 'lightsout', mode: model.mode, ...model.saved(), hinted: model.hinted, par: model.par,
        undoCount: history.length, stars: model.mode === 'won' ? model.stars() : 0, epoch: model.epoch };
    },
    stars() { return model.moves <= model.par && !model.hintsUsed ? 3 : model.moves <= model.par + 3 ? 2 : 1; },
    planning() {
      return model.mode === 'playing' ? { game: 'lightsout' as const,
        epoch: `${model.epoch}:${model.level}:${model.initial.join('')}`, board: [...model.board] } : null;
    },
    summary() {
      return { level: model.level, moves: model.moves, par: model.par, lit: model.board.filter(Boolean).length,
        hintsUsed: model.hintsUsed, undoCount: history.length, stars: model.mode === 'won' ? model.stars() : 0 };
    }
  };
  if (validLightsSave(saved)) {
    model.board = [...saved.board];
    model.initial = [...saved.initial];
    model.moves = saved.moves;
    model.level = saved.level;
    model.hintsUsed = saved.hintsUsed;
    model.par = solveLights(model.initial).length;
    if (isSolved(model.board))
      model.mode = 'won';
  }
  else
    model.fresh();
  return model;
}
export type LightsModel = ReturnType<typeof createLightsOutModel>;
