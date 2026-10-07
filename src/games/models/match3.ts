export type Cell = number;
export type Point = { x: number; y: number };
export const SIZE = 8;
const GEM_COUNT = 5;
export function createBoard(): Cell[][] {
  let grid: Cell[][];
  do {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const choices = [0, 1, 2, 3, 4].filter(
          (v) =>
            !(x >= 2 && grid[y][x - 1] === v && grid[y][x - 2] === v) &&
            !(y >= 2 && grid[y - 1][x] === v && grid[y - 2][x] === v),
        );
        grid[y][x] = choices[Math.floor(Math.random() * choices.length)];
      }
  } while (!hasMove(grid));
  return grid;
}
export function findMove(grid: Cell[][]): Point[] | null {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      for (const n of [
        { x: x + 1, y },
        { x, y: y + 1 },
      ]) {
        if (n.x >= SIZE || n.y >= SIZE) continue;
        const p = { x, y };
        swap(grid, p, n);
        const found = findMatches(grid).length > 0;
        swap(grid, p, n);
        if (found) return [p, n];
      }
    }
  return null;
}
export function isNeighbor(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy === 1;
}

export function swap(
  grid: Cell[][],
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const tmp = grid[a.y][a.x];
  grid[a.y][a.x] = grid[b.y][b.x];
  grid[b.y][b.x] = tmp;
}

export function findMatches(grid: Cell[][]): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  // rows
  for (let y = 0; y < SIZE; y++) {
    let run = 1;
    for (let x = 1; x <= SIZE; x++) {
      if (x < SIZE && grid[y][x] === grid[y][x - 1]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) found.push({ x: x - 1 - k, y });
        }
        run = 1;
      }
    }
  }
  // cols
  for (let x = 0; x < SIZE; x++) {
    let run = 1;
    for (let y = 1; y <= SIZE; y++) {
      if (y < SIZE && grid[y][x] === grid[y - 1][x]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) found.push({ x, y: y - 1 - k });
        }
        run = 1;
      }
    }
  }
  return [...new Map(found.map((p) => [`${p.x}-${p.y}`, p])).values()];
}

export function applyGravityWithMoves(
  grid: Cell[][],
): { x: number; from: number; to: number; isNew: boolean }[] {
  const moves: { x: number; from: number; to: number; isNew: boolean }[] = [];

  for (let x = 0; x < SIZE; x++) {
    const column: Cell[] = Array(SIZE).fill(-1);
    let write = SIZE - 1;

    for (let y = SIZE - 1; y >= 0; y--) {
      if (grid[y][x] !== -1) {
        column[write] = grid[y][x];
        if (write !== y) {
          moves.push({ x, from: y, to: write, isNew: false });
        }
        write--;
      }
    }

    for (let y = write; y >= 0; y--) {
      column[y] = Math.floor(Math.random() * GEM_COUNT);
      moves.push({ x, from: -1, to: y, isNew: true });
    }

    for (let y = 0; y < SIZE; y++) {
      grid[y][x] = column[y];
    }
  }

  return moves;
}

export function hasMove(grid: Cell[][]): boolean {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const current = { x, y };
      const neighbors = [
        { x: x + 1, y },
        { x, y: y + 1 },
      ];
      for (const n of neighbors) {
        if (n.x >= SIZE || n.y >= SIZE) continue;
        swap(grid, current, n);
        const matches = findMatches(grid);
        swap(grid, current, n);
        if (matches.length) return true;
      }
    }
  }
  return false;
}

export function match3Moves(grid: Cell[][]) {
  const result: { a: Point; b: Point; count: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const a = { x, y };
      for (const b of [
        { x: x + 1, y },
        { x, y: y + 1 },
      ]) {
        if (b.x >= SIZE || b.y >= SIZE) continue;
        swap(grid, a, b);
        const count = findMatches(grid).length;
        swap(grid, a, b);
        if (count) result.push({ a, b, count });
      }
    }
  }
  return result.sort((a, b) => b.count - a.count);
}
