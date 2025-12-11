import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';

type Matrix = number[][];

const WIDTH = 10;
const HEIGHT = 20;
const CELL = 18;
const storage = namespace('tetris');

const SHAPES: Matrix[] = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  [
    [2, 0, 0],
    [2, 2, 2],
    [0, 0, 0]
  ],
  [
    [0, 0, 3],
    [3, 3, 3],
    [0, 0, 0]
  ],
  [
    [4, 4],
    [4, 4]
  ],
  [
    [0, 5, 5],
    [5, 5, 0],
    [0, 0, 0]
  ],
  [
    [0, 6, 0],
    [6, 6, 6],
    [0, 0, 0]
  ],
  [
    [7, 7, 0],
    [0, 7, 7],
    [0, 0, 0]
  ]
];

const COLORS = ['#000', '#7dd3fc', '#fb7185', '#a78bfa', '#fbbf24', '#34d399', '#60a5fa', '#f472b6'];

interface Piece {
  matrix: Matrix;
  x: number;
  y: number;
}

const tetris: GameModule = {
  id: 'tetris',
  name: 'Tetris',
  description: 'Stack tetrominoes, clear lines, avoid the top.',
  icon: '🧱',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Tetris', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const scoreEl = document.createElement('div');
    const bestEl = document.createElement('div');
    info.append(scoreEl, bestEl);
    area.appendChild(info);

    const play = document.createElement('div');
    play.className = 'game-flex tetris-flex';
    area.appendChild(play);

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * CELL;
    canvas.height = HEIGHT * CELL;
    canvas.className = 'game-canvas tetris-canvas';
    play.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas missing');

    const controls = document.createElement('div');
    controls.className = 'control-row tetris-controls';
    const leftBtn = createTouchButton('◀', () => move(-1));
    const rightBtn = createTouchButton('▶', () => move(1));
    const rotateBtn = createTouchButton('⟳', () => rotate());
    const dropBtn = createTouchButton('▼', () => drop());
    controls.append(leftBtn, rotateBtn, dropBtn, rightBtn);
    play.appendChild(controls);

    let board = createBoard();
    let piece = spawnPiece();
    let score = 0;
    let best = storage.load('best', 0);
    let dropTimer = 0;
    const loop = new GameLoop((dt) => {
      dropTimer += dt;
      const speed = Math.max(0.15, 0.8 - score * 0.0005);
      if (dropTimer >= speed) {
        dropTimer = 0;
        stepDown();
      }
      draw();
    });

    const updateUI = () => {
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;
    };

    const stepDown = () => {
      piece.y += 1;
      if (collides(board, piece)) {
        piece.y -= 1;
        merge(board, piece);
        const cleared = clearLines(board);
        if (cleared > 0) {
          score += cleared * 100;
          best = Math.max(best, score);
          storage.save('best', best);
        }
        piece = spawnPiece();
        if (collides(board, piece)) {
          board = createBoard();
          score = 0;
        }
      }
      updateUI();
    };

    const move = (dx: number) => {
      piece.x += dx;
      if (collides(board, piece)) {
        piece.x -= dx;
      }
      draw();
    };

    const rotate = () => {
      const rotated = rotateMatrix(piece.matrix);
      const backup = piece.matrix;
      piece.matrix = rotated;
      if (collides(board, piece)) {
        piece.matrix = backup;
      }
      draw();
    };

    const drop = () => {
      while (!collides(board, { ...piece, y: piece.y + 1 })) {
        piece.y += 1;
      }
      stepDown();
    };

    const draw = () => {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawMatrix(ctx, board, { x: 0, y: 0 });
      drawMatrix(ctx, piece.matrix, { x: piece.x, y: piece.y });
    };

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowUp') rotate();
      if (e.key === 'ArrowDown') stepDown();
      if (e.key === ' ') drop();
    };
    window.addEventListener('keydown', keyHandler);

    updateUI();
    draw();
    loop.start();

    return () => {
      loop.stop();
      window.removeEventListener('keydown', keyHandler);
    };
  }
};

function createBoard(): Matrix {
  return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
}

function spawnPiece(): Piece {
  const matrix = SHAPES[Math.floor(Math.random() * SHAPES.length)].map((row) => [...row]);
  return { matrix, x: 3, y: 0 };
}

function collides(board: Matrix, piece: Piece): boolean {
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

function merge(board: Matrix, piece: Piece) {
  for (let y = 0; y < piece.matrix.length; y++) {
    for (let x = 0; x < piece.matrix[y].length; x++) {
      if (piece.matrix[y][x] && piece.y + y >= 0) {
        board[piece.y + y][piece.x + x] = piece.matrix[y][x];
      }
    }
  }
}

function clearLines(board: Matrix): number {
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

function drawMatrix(ctx: CanvasRenderingContext2D, matrix: Matrix, offset: Point) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      const value = matrix[y][x];
      if (!value) continue;
      ctx.fillStyle = COLORS[value];
      ctx.fillRect((x + offset.x) * CELL, (y + offset.y) * CELL, CELL - 1, CELL - 1);
    }
  }
}

interface Point {
  x: number;
  y: number;
}

export default tetris;
