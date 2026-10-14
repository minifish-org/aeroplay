export const PUZZLES = [
  {
    puzzle: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  },
  {
    puzzle: '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
    solution: '435269781682571493197834562826195347374682915951743628519326874248957136763418259'
  },
  {
    puzzle: '300200000000107000706030500070009080900020004010800050009040301000702000000008006',
    solution: '351286497492157638786934512275469183938521764614873259829645371163792845547318926'
  }
];
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
  if (visible.length !== 81 || visible.some((value) => !Number.isInteger(value) || value < 0 || value > 9))
    return null;
  const board = [...visible];
  if (board.some((value, index) => value && !sudokuCandidates(board, index).includes(value)))
    return null;
  let remaining = budget;
  function search(): boolean {
    if (--remaining < 0)
      return false;
    let cell = -1;
    let digits: number[] = [];
    for (let index = 0; index < board.length; index++) {
      if (board[index])
        continue;
      const allowed = sudokuCandidates(board, index);
      if (!allowed.length)
        return false;
      if (cell < 0 || allowed.length < digits.length) {
        cell = index;
        digits = allowed;
      }
      if (digits.length === 1)
        break;
    }
    if (cell < 0)
      return true;
    for (const value of digits) {
      board[cell] = value;
      if (search())
        return true;
    }
    board[cell] = 0;
    return false;
  }
  return search() ? board : null;
}
export type SudokuSave = {
  puzzleIndex: number;
  board: number[];
  elapsedSeconds: number;
  mistakes: number;
  bestSeconds: number | null;
  notes?: number[][];
  hints?: number;
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
  let solution: number[] = [];
  const model = {
    mode: 'playing' as 'playing' | 'paused' | 'won',
    puzzleIndex: 0, board: [] as number[], givens: [] as number[], notes: [] as number[][],
    selected: null as number | null, noteMode: false, hints: 3, mistakes: 0,
    elapsedSeconds: 0, bestSeconds, epoch: 0,
    solved() { return model.board.length === 81 && model.board.every((value, index) => value === solution[index]); },
    reset() {
      const puzzle = PUZZLES[model.puzzleIndex];
      model.board = [...puzzle.puzzle].map(Number);
      solution = [...puzzle.solution].map(Number);
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
    next() { model.puzzleIndex = (model.puzzleIndex + 1) % PUZZLES.length; model.reset(); return true; },
    remember(limit = true) {
      history.push({ board: [...model.board], notes: cloneNotes(model.notes) });
      if (limit && history.length > 100)
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
        model.remember(false);
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
    saved(): SudokuSave {
      return { puzzleIndex: model.puzzleIndex, board: [...model.board], notes: cloneNotes(model.notes),
        elapsedSeconds: Math.floor(model.elapsedSeconds), mistakes: model.mistakes,
        bestSeconds: model.bestSeconds, hints: model.hints };
    },
    snapshot() {
      return { game: 'sudoku', mode: model.mode, ...model.saved(), givens: [...model.givens], selected: model.selected,
        noteMode: model.noteMode, undoCount: history.length, epoch: model.epoch };
    },
    planning() {
      return model.mode === 'playing' ? { game: 'sudoku' as const, epoch: `${model.epoch}:${model.puzzleIndex}`,
        board: [...model.board], givens: [...model.givens], selected: model.selected, notes: model.noteMode } : null;
    },
    summary() {
      return { puzzle: model.puzzleIndex + 1, total: PUZZLES.length, elapsedSeconds: Math.floor(model.elapsedSeconds),
        bestSeconds: model.bestSeconds, mistakes: model.mistakes, hints: model.hints,
        filled: model.board.filter(Boolean).length, undoCount: history.length, noteMode: model.noteMode };
    }
  };
  const save = saved as Partial<SudokuSave> | null;
  if (Number.isInteger(save?.puzzleIndex) && save!.puzzleIndex! >= 0)
    model.puzzleIndex = save!.puzzleIndex! % PUZZLES.length;
  model.reset();
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
    if (model.solved())
      model.mode = 'won';
  }
  return model;
}
export type SudokuModel = ReturnType<typeof createSudokuModel>;
