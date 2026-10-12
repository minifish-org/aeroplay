const SIZE = 4;
type Grid = number[][];
type MoveDirection = 'up' | 'down' | 'left' | 'right';
type MoveRecord = { sources: number[]; target: number; value: number; merged: boolean };

export function compressAndMerge(
  arr: number[],
  forward: boolean
): { newRow: number[]; gained: number; moves: MoveRecord[] } {
  const tiles = arr
    .map((val, idx) => ({ val, idx }))
    .filter(({ val }) => val !== 0);
  if (!forward) tiles.reverse();

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
    } else {
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

  while (mergedValues.length < SIZE) mergedValues.push(0);
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
    const merged = compressAndMerge(
      line,
      direction === 'left' || direction === 'up'
    );
    gained += merged.gained;
    if (horizontal) next[index] = merged.newRow;
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
