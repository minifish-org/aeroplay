export type Matrix = number[][];

export const WIDTH = 10;
export const HEIGHT = 20;

export const SHAPES: Matrix[] = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [2, 0, 0],
    [2, 2, 2],
    [0, 0, 0],
  ],
  [
    [0, 0, 3],
    [3, 3, 3],
    [0, 0, 0],
  ],
  [
    [4, 4],
    [4, 4],
  ],
  [
    [0, 5, 5],
    [5, 5, 0],
    [0, 0, 0],
  ],
  [
    [0, 6, 0],
    [6, 6, 6],
    [0, 0, 0],
  ],
  [
    [7, 7, 0],
    [0, 7, 7],
    [0, 0, 0],
  ],
];

export interface Piece {
  matrix: Matrix;
  x: number;
  y: number;
}

export type PlacementAction = "left" | "right" | "rotate";
export interface Landing {
  piece: Piece;
  path: PlacementAction[];
  rotation: number;
  lines: number;
  holes: number;
  height: number;
  roughness: number;
  quality: number;
}

export function createBoard(): Matrix {
  return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
}

export function collides(board: Matrix, piece: Piece): boolean {
  for (let y = 0; y < piece.matrix.length; y++) {
    for (let x = 0; x < piece.matrix[y].length; x++) {
      if (!piece.matrix[y][x]) continue;
      const px = x + piece.x;
      const py = y + piece.y;
      if (px < 0 || px >= WIDTH || py >= HEIGHT) return true;
      if (py >= 0 && board[py][px]) return true;
    }
  }
  return false;
}

export function merge(board: Matrix, piece: Piece) {
  for (let y = 0; y < piece.matrix.length; y++) {
    for (let x = 0; x < piece.matrix[y].length; x++) {
      if (piece.matrix[y][x] && piece.y + y >= 0) {
        board[piece.y + y][piece.x + x] = piece.matrix[y][x];
      }
    }
  }
}

export function clearLines(board: Matrix): number {
  let cleared = 0;
  for (let y = board.length - 1; y >= 0; y--) {
    if (board[y].every((v) => v !== 0)) {
      board.splice(y, 1);
      board.unshift(Array(WIDTH).fill(0));
      cleared++;
      y++;
    }
  }
  return cleared;
}

export function rotateMatrix(matrix: Matrix): Matrix {
  const size = matrix.length;
  const result = Array.from({ length: size }, () => Array(size).fill(0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      result[x][size - y - 1] = matrix[y][x];
    }
  }
  return result;
}

export function rotatedPiece(board: Matrix, piece: Piece): Piece | null {
  const matrix = rotateMatrix(piece.matrix);
  for (const [dx, dy] of [
    [0, 0],
    [-1, 0],
    [1, 0],
    [-2, 0],
    [2, 0],
    [0, -1],
    [0, -2],
  ]) {
    const candidate = { matrix, x: piece.x + dx, y: piece.y + dy };
    if (!collides(board, candidate)) return candidate;
  }
  return null;
}

export function boardHeights(board: Matrix) {
  return Array.from({ length: WIDTH }, (_, x) => {
    const top = board.findIndex((row) => row[x] !== 0);
    return top < 0 ? 0 : HEIGHT - top;
  });
}

export function findLandings(board: Matrix, initial: Piece): Landing[] {
  const queue: { piece: Piece; path: PlacementAction[]; rotation: number }[] = [
    { piece: initial, path: [], rotation: 0 },
  ];
  const visited = new Set<string>();
  const landings = new Map<string, Landing>();
  while (queue.length && visited.size < 200) {
    const state = queue.shift()!;
    const key = `${state.piece.x}:${state.piece.y}:${state.piece.matrix.flat().join("")}`;
    if (visited.has(key) || state.piece.y < -4 || collides(board, state.piece))
      continue;
    visited.add(key);
    const landing = { ...state.piece };
    while (!collides(board, { ...landing, y: landing.y + 1 })) landing.y++;
    const cells: string[] = [];
    landing.matrix.forEach((row, y) =>
      row.forEach((value, x) => {
        if (value) cells.push(`${landing.x + x},${landing.y + y}`);
      }),
    );
    const landingKey = cells.sort().join(";");
    if (
      !landings.has(landingKey) &&
      cells.every((cell) => Number(cell.split(",")[1]) >= 0)
    ) {
      const result = board.map((row) => [...row]);
      merge(result, landing);
      const lines = clearLines(result);
      const heights = boardHeights(result);
      const height = Math.max(...heights);
      const roughness = heights
        .slice(1)
        .reduce(
          (sum, value, index) => sum + Math.abs(value - heights[index]),
          0,
        );
      let holes = 0;
      for (let x = 0; x < WIDTH; x++) {
        let covered = false;
        for (let y = 0; y < HEIGHT; y++) {
          if (result[y][x]) covered = true;
          else if (covered) holes++;
        }
      }
      landings.set(landingKey, {
        piece: landing,
        path: state.path,
        rotation: state.rotation,
        lines,
        holes,
        height,
        roughness,
        quality:
          lines * 10000 -
          holes * 600 -
          height * 100 -
          roughness * 20 -
          heights.reduce((sum, value) => sum + value, 0) * 5,
      });
    }
    for (const [action, dx] of [
      ["left", -1],
      ["right", 1],
    ] as const) {
      const candidate = { ...state.piece, x: state.piece.x + dx };
      if (!collides(board, candidate))
        queue.push({
          piece: candidate,
          path: [...state.path, action],
          rotation: state.rotation,
        });
    }
    const rotated = rotatedPiece(board, state.piece);
    if (rotated)
      queue.push({
        piece: rotated,
        path: [...state.path, "rotate"],
        rotation: (state.rotation + 1) % 4,
      });
  }
  return [...landings.values()]
    .sort((a, b) => b.quality - a.quality)
    .slice(0, 12);
}
