const SIZE = 4;
export type Grid = number[][];
export type MoveDirection = 'up' | 'down' | 'left' | 'right';
type MoveRecord = {
  sources: number[];
  target: number;
  value: number;
  merged: boolean;
};
export function compressAndMerge(arr: number[], forward: boolean): {
  newRow: number[];
  gained: number;
  moves: MoveRecord[];
} {
  const tiles = arr
    .map((val, idx) => ({ val, idx }))
    .filter(({ val }) => val !== 0);
  if (!forward)
    tiles.reverse();
  const mergedValues: number[] = [];
  const moves: MoveRecord[] = [];
  let gained = 0;
  let targetIndex = 0;
  for (let i = 0; i < tiles.length; i++) {
    const current = tiles[i];
    const next = tiles[i + 1];
    const target = forward ? targetIndex : SIZE - 1 - targetIndex;
    if (next && current.val === next.val) {
      const val = current.val * 2;
      mergedValues.push(val);
      moves.push({
        sources: [current.idx, next.idx],
        target,
        value: val,
        merged: true
      });
      gained += val;
      i++;
    }
    else {
      mergedValues.push(current.val);
      moves.push({
        sources: [current.idx],
        target,
        value: current.val,
        merged: false
      });
    }
    targetIndex++;
  }
  while (mergedValues.length < SIZE)
    mergedValues.push(0);
  const newRow = forward ? mergedValues : [...mergedValues].reverse();
  return { newRow, gained, moves };
}
export function gridToString(grid: Grid) {
  return grid.flat().join(',');
}
export function preview2048Move(grid: Grid, direction: MoveDirection) {
  const next = grid.map((row) => [...row]);
  let gained = 0;
  for (let index = 0; index < SIZE; index++) {
    const horizontal = direction === 'left' || direction === 'right';
    const line = horizontal ? grid[index] : grid.map((row) => row[index]);
    const merged = compressAndMerge(line, direction === 'left' || direction === 'up');
    gained += merged.gained;
    if (horizontal)
      next[index] = merged.newRow;
    else
      for (let row = 0; row < SIZE; row++)
        next[row][index] = merged.newRow[row];
  }
  return {
    grid: next,
    gained,
    empty: next.flat().filter((value) => value === 0).length,
    changed: gridToString(next) !== gridToString(grid)
  };
}
export type MergeSave = {
  grid: Grid;
  score: number;
  moves: number;
};
export type TileChange = {
  sources: number[];
  target: number;
  value: number;
  merged: boolean;
};
const copyGrid = (grid: Grid) => grid.map(row => [...row]);
export function validMergeSave(value: unknown): value is MergeSave {
  if (!value || typeof value !== 'object')
    return false;
  const save = value as MergeSave;
  return Array.isArray(save.grid) && save.grid.length === 4 && save.grid.every(row => Array.isArray(row) && row.length === 4 && row.every(cell => Number.isInteger(cell) && (cell === 0 || cell >= 2 && Number.isInteger(Math.log2(cell))))) &&
    Number.isFinite(save.score) && save.score >= 0 && Number.isInteger(save.moves) && save.moves >= 0;
}
export function create2048Model(saved: unknown = null, best = 0, random = Math.random) {
  const history: MergeSave[] = [];
  const model = {
    mode: 'playing' as 'playing' | 'paused' | 'over',
    grid: Array.from({ length: 4 }, () => Array<number>(4).fill(0)),
    score: 0, moves: 0, best: Math.max(0, best), epoch: 0, clock: 0,
    changes: [] as TileChange[], spawned: -1,
    canMove() {
      return model.grid.some((row, y) => row.some((value, x) => !value || value === row[x + 1] || value === model.grid[y + 1]?.[x]));
    },
    spawn() {
      const empty = model.grid.flatMap((row, y) => row.flatMap((value, x) => value ? [] : [y * 4 + x]));
      if (!empty.length)
        return;
      model.spawned = empty[Math.floor(random() * empty.length)];
      model.grid[Math.floor(model.spawned / 4)][model.spawned % 4] = random() < 0.9 ? 2 : 4;
    },
    reset() {
      model.epoch++;
      model.clock = 0;
      model.mode = 'playing';
      model.grid = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
      model.score = 0;
      model.moves = 0;
      model.changes = [];
      history.length = 0;
      model.spawn();
      model.spawn();
    },
    undo() {
      const previous = history.pop();
      if (!previous)
        return false;
      model.grid = copyGrid(previous.grid);
      model.score = previous.score;
      model.moves = previous.moves;
      model.mode = 'playing';
      model.changes = [];
      model.spawned = -1;
      model.epoch++;
      return true;
    },
    act(input: unknown) {
      if (input === 'undo')
        return model.undo();
      if (input === 'retry' || input === 'restart') {
        model.reset();
        return true;
      }
      if (model.mode !== 'playing' || !['up', 'down', 'left', 'right'].includes(String(input)))
        return false;
      const direction = input as MoveDirection;
      const next = preview2048Move(model.grid, direction);
      if (!next.changed)
        return false;
      history.push(model.saved());
      if (history.length > 20)
        history.shift();
      model.changes = [];
      for (let index = 0; index < 4; index++) {
        const horizontal = direction === 'left' || direction === 'right';
        const line = horizontal ? model.grid[index] : model.grid.map(row => row[index]);
        const merged = compressAndMerge(line, direction === 'left' || direction === 'up');
        for (const change of merged.moves)
          model.changes.push({ ...change,
            sources: change.sources.map(cell => horizontal ? index * 4 + cell : cell * 4 + index),
            target: horizontal ? index * 4 + change.target : change.target * 4 + index });
      }
      model.grid = next.grid;
      model.score += next.gained;
      model.moves++;
      model.best = Math.max(model.best, model.score);
      model.spawn();
      if (!model.canMove())
        model.mode = 'over';
      return true;
    },
    step(dt: number) { if (model.mode === 'playing')
      model.clock += Math.max(0, dt); },
    pause() { if (model.mode === 'playing')
      model.mode = 'paused'; },
    resume() { if (model.mode === 'paused')
      model.mode = 'playing'; },
    saved(): MergeSave { return { grid: copyGrid(model.grid), score: model.score, moves: model.moves }; },
    snapshot() {
      return { game: '2048', mode: model.mode, ...model.saved(), best: model.best, undoCount: history.length,
        highest: Math.max(...model.grid.flat()), epoch: model.epoch };
    },
    planning() {
      return model.mode === 'playing' && model.canMove()
        ? { game: '2048' as const, epoch: String(model.epoch), board: copyGrid(model.grid) } : null;
    },
    summary() {
      const highest = Math.max(...model.grid.flat());
      return { score: model.score, best: model.best, moves: model.moves, undoCount: history.length,
        milestone: Math.max(128, 2 ** (Math.floor(Math.log2(highest || 2)) + 1)), highest };
    }
  };
  if (validMergeSave(saved)) {
    model.grid = copyGrid(saved.grid);
    model.score = saved.score;
    model.moves = saved.moves;
    model.best = Math.max(model.best, model.score);
    if (!model.canMove())
      model.mode = 'over';
  }
  else
    model.reset();
  return model;
}
export type MergeModel = ReturnType<typeof create2048Model>;
