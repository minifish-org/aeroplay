export type SudokuPuzzle = {
  number: number;
  puzzle: string;
  solution: string;
  givens: number;
  difficulty: string;
};
const maskOf = (digit: number) => 1 << (digit - 1);
const boxOf = (index: number) => Math.floor(Math.floor(index / 9) / 3) * 3 + Math.floor((index % 9) / 3);
const digitsOf = (mask: number) => {
  const list: number[] = [];
  for (let digit = 1; digit <= 9; digit++)
    if (mask & maskOf(digit))
      list.push(digit);
  return list;
};
const countBits = (mask: number) => {
  let total = 0;
  for (let bits = mask; bits; bits &= bits - 1)
    total++;
  return total;
};
/** Each puzzle number owns a deterministic stream, so a saved game always regenerates its board. */
function seeded(seed: number) {
  let state = (Math.imul(seed, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(values: number[], random: () => number) {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index--) {
    const pick = Math.floor(random() * (index + 1));
    [list[index], list[pick]] = [list[pick], list[index]];
  }
  return list;
}
/** One masked MRV search shared by generation, uniqueness checks and the planner. */
function searchSudoku(visible: readonly number[], limit: number, budget: number) {
  const empty = { count: 0, found: null as number[] | null };
  if (visible.length !== 81 || visible.some((value) => !Number.isInteger(value) || value < 0 || value > 9))
    return empty;
  const board = [...visible], row = Array(9).fill(0), col = Array(9).fill(0), box = Array(9).fill(0);
  for (let index = 0; index < 81; index++) {
    const digit = board[index];
    if (!digit)
      continue;
    const bit = maskOf(digit), mask = row[Math.floor(index / 9)] | col[index % 9] | box[boxOf(index)];
    if (mask & bit)
      return empty;
    row[Math.floor(index / 9)] |= bit;
    col[index % 9] |= bit;
    box[boxOf(index)] |= bit;
  }
  let remaining = budget;
  const search = (): number => {
    if (remaining-- < 0)
      return 0;
    let cell = -1, candidates = 0, fewest = 10;
    for (let index = 0; index < 81; index++) {
      if (board[index])
        continue;
      const allowed = ~(row[Math.floor(index / 9)] | col[index % 9] | box[boxOf(index)]) & 0x1ff;
      const size = countBits(allowed);
      if (!size)
        return 0;
      if (size < fewest) {
        fewest = size;
        cell = index;
        candidates = allowed;
        if (size === 1)
          break;
      }
    }
    if (cell < 0) {
      empty.found = [...board];
      return 1;
    }
    const rowIndex = Math.floor(cell / 9), colIndex = cell % 9, boxIndex = boxOf(cell);
    let total = 0;
    for (const digit of digitsOf(candidates)) {
      const bit = maskOf(digit);
      board[cell] = digit;
      row[rowIndex] |= bit;
      col[colIndex] |= bit;
      box[boxIndex] |= bit;
      total += search();
      board[cell] = 0;
      row[rowIndex] &= ~bit;
      col[colIndex] &= ~bit;
      box[boxIndex] &= ~bit;
      if (total >= limit)
        break;
    }
    return total;
  };
  empty.count = search();
  return empty;
}
/** Candidate digits use only the displayed board's row, column and box. */
export function sudokuCandidates(board: number[], index: number) {
  const row = Math.floor(index / 9), col = index % 9;
  const used = new Set<number>();
  for (let i = 0; i < 9; i++) {
    const rowIndex = row * 9 + i;
    const colIndex = i * 9 + col;
    if (rowIndex !== index)
      used.add(board[rowIndex]);
    if (colIndex !== index)
      used.add(board[colIndex]);
  }
  for (let y = Math.floor(row / 3) * 3; y < Math.floor(row / 3) * 3 + 3; y++) {
    for (let x = Math.floor(col / 3) * 3; x < Math.floor(col / 3) * 3 + 3; x++) {
      const peer = y * 9 + x;
      if (peer !== index)
        used.add(board[peer]);
    }
  }
  return Array.from({ length: 9 }, (_, i) => i + 1).filter((value) => !used.has(value));
}
/** Bounded constraint search derives a completion without any stored answer. */
export function solveVisibleSudoku(visible: number[], budget = 50000): number[] | null {
  return searchSudoku(visible, 1, budget).found;
}
/** Generation and verification count completions instead of only finding one. */
export function countSudokuSolutions(visible: readonly number[], limit = 2, budget = 20000) {
  return searchSudoku(visible, limit, budget).count;
}
/** A puzzle that naked and hidden singles finish never asks a human to guess. */
export function solveSudokuSingles(visible: readonly number[]) {
  const board = [...visible];
  const units: number[][] = [];
  for (let unit = 0; unit < 9; unit++) {
    units.push(Array.from({ length: 9 }, (_, i) => unit * 9 + i));
    units.push(Array.from({ length: 9 }, (_, i) => i * 9 + unit));
    units.push(Array.from({ length: 9 }, (_, i) => Math.floor(unit / 3) * 27 + (unit % 3) * 3 + Math.floor(i / 3) * 9 + i % 3));
  }
  for (let pass = 0; pass < 200; pass++) {
    let placed = 0;
    for (let cell = 0; cell < 81; cell++) {
      if (board[cell])
        continue;
      const allowed = sudokuCandidates(board, cell);
      if (allowed.length === 1) {
        board[cell] = allowed[0];
        placed++;
      }
    }
    for (const unit of units) {
      for (let digit = 1; digit <= 9; digit++) {
        if (unit.some((cell) => board[cell] === digit))
          continue;
        const spots = unit.filter((cell) => !board[cell] && sudokuCandidates(board, cell).includes(digit));
        if (spots.length === 1) {
          board[spots[0]] = digit;
          placed++;
        }
      }
    }
    if (board.every(Boolean))
      return true;
    if (!placed)
      return false;
  }
  return false;
}
function fullSolution(random: () => number) {
  const board = Array(81).fill(0), row = Array(9).fill(0), col = Array(9).fill(0), box = Array(9).fill(0);
  const place = (): boolean => {
    let cell = -1, candidates = 0, fewest = 10;
    for (let index = 0; index < 81; index++) {
      if (board[index])
        continue;
      const allowed = ~(row[Math.floor(index / 9)] | col[index % 9] | box[boxOf(index)]) & 0x1ff;
      const size = countBits(allowed);
      if (!size)
        return false;
      if (size < fewest) {
        fewest = size;
        cell = index;
        candidates = allowed;
        if (size === 1)
          break;
      }
    }
    if (cell < 0)
      return true;
    const rowIndex = Math.floor(cell / 9), colIndex = cell % 9, boxIndex = boxOf(cell);
    for (const digit of shuffled(digitsOf(candidates), random)) {
      const bit = maskOf(digit);
      board[cell] = digit;
      row[rowIndex] |= bit;
      col[colIndex] |= bit;
      box[boxIndex] |= bit;
      if (place())
        return true;
      board[cell] = 0;
      row[rowIndex] &= ~bit;
      col[colIndex] &= ~bit;
      box[boxIndex] &= ~bit;
    }
    return false;
  };
  place();
  return board;
}
/**
 * Every puzzle is generated on device: a relabelled full grid is dug down to the
 * given count of its number while one completion and singles-only solving hold.
 */
export function sudokuPuzzle(number: number): SudokuPuzzle {
  const level = Math.max(1, Math.floor(Number(number)) || 1);
  const random = seeded(level);
  const solution = fullSolution(random);
  const labels = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const relabelled = solution.map((digit) => labels[digit - 1]);
  const puzzle = [...relabelled];
  const floor = Math.max(30, 46 - Math.floor((level - 1) * 0.8));
  let givens = 81;
  for (const index of shuffled(Array.from({ length: 81 }, (_, i) => i), random)) {
    if (givens <= floor)
      break;
    const saved = puzzle[index];
    if (!saved)
      continue;
    puzzle[index] = 0;
    if (countSudokuSolutions(puzzle, 2, 4000) === 1 && solveSudokuSingles(puzzle))
      givens--;
    else
      puzzle[index] = saved;
  }
  return {
    number: level,
    puzzle: puzzle.join(''),
    solution: relabelled.join(''),
    givens,
    difficulty: givens >= 44 ? 'Gentle' : givens >= 38 ? 'Easy' : givens >= 33 ? 'Steady' : 'Sharp'
  };
}
export type SudokuSave = {
  number: number;
  board: number[];
  elapsedSeconds: number;
  mistakes: number;
  bestSeconds: number | null;
  notes?: number[][];
  hints?: number;
  history?: { board: number[]; notes: number[][] }[];
};
export type SudokuInput = {
  type: 'select';
  index: number;
} | {
  type: 'value';
  value: number;
} | {
  type: 'notes';
};
const cloneNotes = (notes: number[][]) => notes.map(note => [...note]);
export function createSudokuModel(saved: unknown = null, bestSeconds: number | null = null) {
  const history: {
    board: number[];
    notes: number[][];
  }[] = [];
  let solution: number[] = [], difficulty = 'Gentle';
  const model = {
    mode: 'playing' as 'playing' | 'paused' | 'won',
    number: 1, board: [] as number[], givens: [] as number[], notes: [] as number[][],
    selected: null as number | null, noteMode: false, hints: 3, mistakes: 0,
    elapsedSeconds: 0, bestSeconds, epoch: 0,
    solved() { return model.board.length === 81 && model.board.every((value, index) => value === solution[index]); },
    load() {
      const generated = sudokuPuzzle(model.number);
      solution = [...generated.solution].map(Number);
      difficulty = generated.difficulty;
      model.board = [...generated.puzzle].map(Number);
      model.givens = model.board.flatMap((value, index) => value ? [index] : []);
      model.notes = Array.from({ length: 81 }, () => []);
      model.selected = null;
      model.noteMode = false;
      model.hints = 3;
      model.mistakes = 0;
      model.elapsedSeconds = 0;
      model.mode = 'playing';
      model.epoch++;
      history.length = 0;
    },
    /** Retry keeps the puzzle, a finished puzzle advances to the next generated one. */
    reset(advance?: boolean) {
      if (advance ?? model.mode === 'won')
        model.number++;
      model.load();
    },
    next() {
      model.reset(true);
      return true;
    },
    remember() {
      history.push({ board: [...model.board], notes: cloneNotes(model.notes) });
      if (history.length > 100)
        history.shift();
    },
    undo() {
      if (model.mode === 'won')
        return false;
      const old = history.pop();
      if (!old)
        return false;
      model.board = old.board;
      model.notes = old.notes;
      model.epoch++;
      return true;
    },
    value(value: number) {
      const index = model.selected;
      if (model.mode !== 'playing' || index === null || model.givens.includes(index) ||
        !Number.isInteger(value) || value < 0 || value > 9)
        return false;
      if (model.noteMode && value && !model.board[index]) {
        model.remember();
        model.notes[index] = model.notes[index].includes(value)
          ? model.notes[index].filter(note => note !== value) : [...model.notes[index], value];
        return true;
      }
      if (model.board[index] === value && (value || !model.notes[index].length))
        return false;
      model.remember();
      model.notes[index] = [];
      model.board[index] = value;
      if (value && value !== solution[index])
        model.mistakes++;
      if (model.solved()) {
        model.mode = 'won';
        const elapsed = Math.floor(model.elapsedSeconds);
        if (model.bestSeconds === null || elapsed < model.bestSeconds)
          model.bestSeconds = elapsed;
      }
      return true;
    },
    hint() {
      if (model.mode !== 'playing' || !model.hints)
        return false;
      if (model.selected === null || model.givens.includes(model.selected) || model.board[model.selected] === solution[model.selected])
        model.selected = model.board.findIndex((value, index) => value !== solution[index]);
      if (model.selected < 0)
        return false;
      model.hints--;
      model.noteMode = false;
      return model.value(solution[model.selected]);
    },
    act(input: unknown) {
      if (input === 'undo')
        return model.undo();
      if (input === 'hint')
        return model.hint();
      if (input === 'next')
        return model.next();
      if (input === 'retry' || input === 'restart') {
        model.reset();
        return true;
      }
      if (model.mode !== 'playing' || !input || typeof input !== 'object')
        return false;
      const action = input as SudokuInput;
      if (action.type === 'notes') {
        model.noteMode = !model.noteMode;
        return true;
      }
      if (action.type === 'value')
        return model.value(action.value);
      if (action.type === 'select' && Number.isInteger(action.index) && action.index >= 0 && action.index < 81) {
        if (model.selected === action.index)
          return false;
        model.selected = action.index;
        return true;
      }
      return false;
    },
    step(dt: number) { if (model.mode === 'playing')
      model.elapsedSeconds += Math.max(0, dt); },
    pause() { if (model.mode === 'playing')
      model.mode = 'paused'; },
    resume() { if (model.mode === 'paused')
      model.mode = 'playing'; },
    conflict(index: number) { return !!model.board[index] && !sudokuCandidates(model.board, index).includes(model.board[index]); },
    invalid(index: number) { return !!model.board[index] && model.board[index] !== solution[index]; },
    saved(withHistory = true): SudokuSave {
      return { number: model.number, board: [...model.board], notes: cloneNotes(model.notes),
        elapsedSeconds: Math.floor(model.elapsedSeconds), mistakes: model.mistakes,
        bestSeconds: model.bestSeconds, hints: model.hints,
        history: withHistory ? history.map(item => ({ board: [...item.board], notes: cloneNotes(item.notes) })) : undefined };
    },
    snapshot() {
      return { game: 'sudoku', mode: model.mode, ...model.saved(false), difficulty, givens: [...model.givens], selected: model.selected,
        noteMode: model.noteMode, undoCount: history.length, epoch: model.epoch };
    },
    planning() {
      return model.mode === 'playing' ? { game: 'sudoku' as const, epoch: `${model.epoch}:${model.number}`,
        board: [...model.board], givens: [...model.givens], selected: model.selected, notes: model.noteMode } : null;
    },
    summary() {
      return { number: model.number, difficulty, givens: model.givens.length, elapsedSeconds: Math.floor(model.elapsedSeconds),
        bestSeconds: model.bestSeconds, mistakes: model.mistakes, hints: model.hints,
        filled: model.board.filter(Boolean).length, undoCount: history.length, noteMode: model.noteMode };
    }
  };
  const save = saved as Partial<SudokuSave> & { puzzleIndex?: number } | null;
  const legacy = Number.isInteger(save?.puzzleIndex) ? (save!.puzzleIndex ?? 0) + 1 : null;
  if (Number.isInteger(save?.number) && save!.number! >= 1)
    model.number = save!.number!;
  else if (legacy)
    model.number = legacy;
  model.load();
  if (save?.board?.length === 81 && save.board.every(value => Number.isInteger(value) && value >= 0 && value <= 9) &&
    model.givens.every(index => save.board![index] === model.board[index])) {
    model.board = [...save.board];
    model.elapsedSeconds = Math.max(0, save.elapsedSeconds ?? 0);
    model.mistakes = Math.max(0, save.mistakes ?? 0);
    model.bestSeconds = save.bestSeconds ?? bestSeconds;
    model.hints = Math.max(0, Math.min(3, save.hints ?? 3));
    if (save.notes?.length === 81 && save.notes.every(note => Array.isArray(note) &&
      note.every(value => Number.isInteger(value) && value >= 1 && value <= 9)))
      model.notes = cloneNotes(save.notes);
    if (Array.isArray(save.history)) {
      const valid = save.history.slice(-100).filter(item => item && Array.isArray(item.board) && item.board.length === 81 &&
        item.board.every(value => Number.isInteger(value) && value >= 0 && value <= 9) &&
        model.givens.every(index => item.board[index] === model.board[index]) && Array.isArray(item.notes) &&
        item.notes.length === 81 && item.notes.every(note => Array.isArray(note) && note.every(value => Number.isInteger(value) && value >= 1 && value <= 9)));
      history.push(...valid.map(item => ({ board: [...item.board], notes: cloneNotes(item.notes) })));
    }
    if (model.solved())
      model.mode = 'won';
  }
  return model;
}
export type SudokuModel = ReturnType<typeof createSudokuModel>;
