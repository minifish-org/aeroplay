export const SIZE = 5;
export function applyToggle(board: number[], x: number, y: number) {
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx,
      ny = y + dy;
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
    if (pivot < 0) continue;
    [matrix[row], matrix[pivot]] = [matrix[pivot], matrix[row]];
    for (let i = 0; i < 25; i++)
      if (i !== row && matrix[i][col])
        for (let j = col; j <= 25; j++) matrix[i][j] ^= matrix[row][j];
    pivots.push(col);
    row++;
  }
  const free = Array.from({ length: 25 }, (_, i) => i).filter(
    (i) => !pivots.includes(i),
  );
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
    if (!best || pressed.length < best.length) best = pressed;
  }
  return best ?? [];
}
