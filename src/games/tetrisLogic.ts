type Matrix = number[][];
type Piece = { matrix: Matrix; x: number; y: number };
const WIDTH = 10, HEIGHT = 20;

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

function rotateMatrix(matrix: Matrix): Matrix {
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
    [0, -2]
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
