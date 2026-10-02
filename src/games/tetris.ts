import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import { isLayaControlling, registerLayaGame } from '../core/laya-bridge';
import { Mode, canvasOverlay, exposeGame, message } from '../core/play';

type Matrix = number[][];

const WIDTH = 10;
const HEIGHT = 20;
const CELL = 24;

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

const COLORS = [
  '#000',
  '#7dd3fc',
  '#fb7185',
  '#a78bfa',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#f472b6'
];

interface Piece {
  matrix: Matrix;
  x: number;
  y: number;
}

type PlacementAction = 'left' | 'right' | 'rotate';
interface Landing {
  piece: Piece;
  path: PlacementAction[];
  rotation: number;
  lines: number;
  holes: number;
  height: number;
  roughness: number;
  quality: number;
}

const tetris: GameModule = {
  id: 'tetris',
  name: 'Tetris',
  description: 'Stack tetrominoes, clear lines, avoid the top.',
  icon: '🧱',
  mount(root, goBack) {
    const storage = namespace('tetris');
    const { area } = createGameShell(root, 'Tetris', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const previews = document.createElement('div');
    previews.className = 'tetris-previews';
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * CELL;
    canvas.height = HEIGHT * CELL;
    canvas.className = 'game-canvas tetris-canvas';
    area.append(info, previews, canvas);
    const ctx = canvas.getContext('2d')!;
    const status = message(
      area,
      'Arrows move and rotate · Space drops · C holds · P pauses'
    );
    const controls = document.createElement('div');
    controls.className = 'control-row tetris-controls';
    const start = createTouchButton('Start', () => {
      if (mode === 'over') reset();
      mode = mode === 'playing' ? 'paused' : 'playing';
      draw();
    });
    controls.append(
      start,
      createTouchButton('◀', () => move(-1)),
      createTouchButton('⟳', rotate),
      createTouchButton('▶', () => move(1)),
      createTouchButton('Drop', drop),
      createTouchButton('Hold', hold)
    );
    area.append(controls);
    let board = createBoard();
    let bag: number[] = [],
      next: number[] = [];
    let current = 0,
      held: number | null = null,
      heldThisTurn = false;
    let piece: Piece = { matrix: [], x: 3, y: 0 };
    let score = 0,
      lines = 0,
      combo = -1,
      dropTimer = 0,
      lockTimer = 0,
      lockResets = 0;
    let best = storage.load('best', 0),
      mode: Mode = 'ready';
    let pieceVersion = 0;
    let landingCache: { key: string; landings: Landing[] } | null = null;
    function take() {
      if (!bag.length) {
        bag = [0, 1, 2, 3, 4, 5, 6];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return bag.pop()!;
    }
    function spawn(id: number) {
      pieceVersion++;
      current = id;
      piece = { matrix: SHAPES[id].map((r) => [...r]), x: 3, y: 0 };
      lockTimer = 0;
      dropTimer = 0;
      lockResets = 0;
      if (collides(board, piece)) mode = 'over';
      renderPreviews();
    }
    function nextPiece() {
      const id = next.shift()!;
      next.push(take());
      spawn(id);
    }
    function reset() {
      board = createBoard();
      bag = [];
      next = [take(), take(), take()];
      held = null;
      heldThisTurn = false;
      score = 0;
      lines = 0;
      combo = -1;
      mode = 'ready';
      nextPiece();
      status.textContent =
        'Arrows move and rotate · Space drops · C holds · P pauses';
    }
    function renderPreviews() {
      previews.innerHTML = '';
      [held, ...next].forEach((id, index) => {
        const item = document.createElement('div');
        item.className = 'piece-preview';
        const title = document.createElement('span');
        title.textContent = index === 0 ? 'HOLD' : `NEXT ${index}`;
        const mini = document.createElement('div');
        mini.className = 'mini-piece';
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            const cell = document.createElement('i');
            const value = id === null ? 0 : SHAPES[id][y]?.[x];
            if (value) cell.style.background = COLORS[value];
            mini.append(cell);
          }
        item.append(title, mini);
        previews.append(item);
      });
    }
    function lock() {
      merge(board, piece);
      const cleared = clearLines(board);
      combo = cleared ? combo + 1 : -1;
      if (cleared) {
        score +=
          ([0, 100, 300, 500, 800][cleared] + Math.max(0, combo) * 50) *
          (1 + Math.floor(lines / 10));
        lines += cleared;
        status.textContent = `${['', 'Single', 'Double!', 'Triple!', 'TETRIS!'][cleared]}${combo > 0 ? ` · Combo ×${combo + 1}` : ''}`;
      }
      best = Math.max(best, score);
      storage.save('best', best);
      heldThisTurn = false;
      nextPiece();
    }
    function shiftLock(grounded: boolean) {
      if (grounded && lockResets < 15) {
        lockTimer = 0;
        lockResets++;
      }
    }
    function move(dx: number) {
      if (mode !== 'playing') return;
      const grounded = collides(board, { ...piece, y: piece.y + 1 });
      if (!collides(board, { ...piece, x: piece.x + dx })) {
        piece.x += dx;
        shiftLock(grounded);
      }
      draw();
    }
    function rotate() {
      if (mode !== 'playing') return;
      const grounded = collides(board, { ...piece, y: piece.y + 1 });
      const candidate = rotatedPiece(board, piece);
      if (candidate) {
        piece = candidate;
        shiftLock(grounded);
      }
      draw();
    }
    function hold() {
      if (mode !== 'playing' || heldThisTurn) return;
      const old = held;
      held = current;
      if (old === null) nextPiece();
      else spawn(old);
      heldThisTurn = true;
      draw();
    }
    function drop() {
      if (mode !== 'playing') return;
      while (!collides(board, { ...piece, y: piece.y + 1 })) {
        piece.y++;
        score += 2;
      }
      lock();
      draw();
    }
    function draw() {
      info.textContent = `Score ${score} · Best ${best} · Lines ${lines} · Level ${1 + Math.floor(lines / 10)}`;
      start.textContent =
        mode === 'playing'
          ? 'Pause'
          : mode === 'paused'
            ? 'Resume'
            : mode === 'over'
              ? 'Play again'
              : 'Start';
      ctx.fillStyle = '#101e32';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1c2d43';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= WIDTH; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL, 0);
        ctx.lineTo(x * CELL, HEIGHT * CELL);
        ctx.stroke();
      }
      for (let y = 0; y <= HEIGHT; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL);
        ctx.lineTo(WIDTH * CELL, y * CELL);
        ctx.stroke();
      }
      drawMatrix(ctx, board, { x: 0, y: 0 });
      let ghostY = piece.y;
      while (!collides(board, { ...piece, y: ghostY + 1 })) ghostY++;
      ctx.globalAlpha = 0.22;
      drawMatrix(ctx, piece.matrix, { x: piece.x, y: ghostY });
      ctx.globalAlpha = 1;
      drawMatrix(ctx, piece.matrix, piece);
      if (mode !== 'playing')
        canvasOverlay(
          ctx,
          mode === 'ready'
            ? 'Make room for more.'
            : mode === 'paused'
              ? 'Paused'
              : `${score} points`,
          mode === 'ready'
            ? 'Press Start · ghost shows landing'
            : mode === 'paused'
              ? 'Press Resume'
              : 'Stack complete. Play again?'
        );
    }
    const loop = new GameLoop((dt) => {
      if (mode !== 'playing') return;
      if (isLayaControlling()) dt *= 0.18;
      dropTimer += dt;
      const speed = Math.max(0.09, 0.8 * Math.pow(0.8, Math.floor(lines / 10)));
      if (dropTimer >= speed) {
        dropTimer = 0;
        if (!collides(board, { ...piece, y: piece.y + 1 })) piece.y++;
      }
      if (collides(board, { ...piece, y: piece.y + 1 })) {
        lockTimer += dt;
        if (lockTimer >= 0.45) lock();
      } else lockTimer = 0;
      draw();
    });
    const key = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowUp' && !e.repeat) rotate();
      if (
        e.key === 'ArrowDown' &&
        mode === 'playing' &&
        !collides(board, { ...piece, y: piece.y + 1 })
      ) {
        piece.y++;
        score++;
        draw();
      }
      if (e.code === 'Space' && !e.repeat) {
        if (mode === 'ready' || mode === 'over') start.click();
        else drop();
      }
      if (e.key.toLowerCase() === 'c' && !e.repeat) hold();
      if (e.key === 'p' && !e.repeat) start.click();
    };
    const hidden = () => {
      if (document.hidden && mode === 'playing') {
        mode = 'paused';
        draw();
      }
    };
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hidden);
    reset();
    draw();
    loop.start();
    const off = exposeGame(
      () => ({
        game: 'tetris',
        mode,
        board,
        piece,
        current,
        next,
        held,
        heldThisTurn,
        score,
        lines
      }),
      (ms) => loop.advance(ms)
    );
    const placementKey = () =>
      `${pieceVersion}:${piece.x}:${piece.y}:${piece.matrix.flat().join('')}`;
    function placements() {
      const key = placementKey();
      if (landingCache?.key !== key)
        landingCache = { key, landings: findLandings(board, piece) };
      return landingCache.landings;
    }
    const layaOff = registerLayaGame({
      game: 'tetris',
      observe: () => {
        if (mode !== 'playing') return null;
        const landings = placements();
        if (!landings.length) return null;
        const shapeNames = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
        const heights = boardHeights(board);
        return {
          key: placementKey(),
          context: `Tetris: board width 10, height 20. Current piece ${shapeNames[current]}; next ${next.map((id) => shapeNames[id]).join(',')}. Column heights left to right: ${heights.join(',')}. Reachable placements are shortlisted using visible board outcomes. A hole is an empty cell below a block. Roughness is the sum of adjacent height differences.`,
          question: 'Which landing clears lines while keeping holes, height and roughness low?',
          choices: Object.fromEntries(landings.map((landing, index) => [
            String(index),
            `rotation ${landing.rotation * 90}, x ${landing.piece.x}: lines ${landing.lines}, holes ${landing.holes}, height ${landing.height}, roughness ${landing.roughness}`
          ]))
        };
      },
      act: (choice, key) => {
        if (mode !== 'playing' || key !== placementKey() || !/^\d+$/.test(choice))
          return false;
        const landing = placements()[Number(choice)];
        if (!landing) return false;
        for (const action of landing.path) {
          if (action === 'rotate') rotate();
          else move(action === 'left' ? -1 : 1);
        }
        if (
          piece.x !== landing.piece.x ||
          piece.matrix.flat().join('') !== landing.piece.matrix.flat().join('')
        ) return false;
        let y = piece.y;
        while (!collides(board, { ...piece, y: y + 1 })) y++;
        if (y !== landing.piece.y) return false;
        drop();
        return true;
      },
      start: () => {
        if (mode === 'over') reset();
        mode = 'playing';
        draw();
      },
      pause: () => { if (mode === 'playing') mode = 'paused'; draw(); },
      resume: () => { if (mode === 'paused') mode = 'playing'; draw(); },
      isFinished: () => mode === 'over',
      isPaused: () => mode === 'paused',
      intervalMs: 500,
      assistance: 'Reachable landings are calculated and shortlisted by board features. Laya chooses the placement. Watch gravity runs at 18% speed.'
    });
    return () => {
      loop.stop();
      layaOff();
      off();
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
    };
  }
};

function createBoard(): Matrix {
  return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
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

function rotatedPiece(board: Matrix, piece: Piece): Piece | null {
  const matrix = rotateMatrix(piece.matrix);
  for (const [dx, dy] of [
    [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [0, -2]
  ]) {
    const candidate = { matrix, x: piece.x + dx, y: piece.y + dy };
    if (!collides(board, candidate)) return candidate;
  }
  return null;
}

function boardHeights(board: Matrix) {
  return Array.from({ length: WIDTH }, (_, x) => {
    const top = board.findIndex((row) => row[x] !== 0);
    return top < 0 ? 0 : HEIGHT - top;
  });
}

function findLandings(board: Matrix, initial: Piece): Landing[] {
  const queue: { piece: Piece; path: PlacementAction[]; rotation: number }[] = [
    { piece: initial, path: [], rotation: 0 }
  ];
  const visited = new Set<string>();
  const landings = new Map<string, Landing>();
  while (queue.length && visited.size < 200) {
    const state = queue.shift()!;
    const key = `${state.piece.x}:${state.piece.y}:${state.piece.matrix.flat().join('')}`;
    if (visited.has(key) || state.piece.y < -4 || collides(board, state.piece)) continue;
    visited.add(key);
    const landing = { ...state.piece };
    while (!collides(board, { ...landing, y: landing.y + 1 })) landing.y++;
    const cells: string[] = [];
    landing.matrix.forEach((row, y) => row.forEach((value, x) => {
      if (value) cells.push(`${landing.x + x},${landing.y + y}`);
    }));
    const landingKey = cells.sort().join(';');
    if (!landings.has(landingKey) && cells.every((cell) => Number(cell.split(',')[1]) >= 0)) {
      const result = board.map((row) => [...row]);
      merge(result, landing);
      const lines = clearLines(result);
      const heights = boardHeights(result);
      const height = Math.max(...heights);
      const roughness = heights.slice(1).reduce(
        (sum, value, index) => sum + Math.abs(value - heights[index]), 0
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
        quality: lines * 10000 - holes * 600 - height * 100 - roughness * 20 -
          heights.reduce((sum, value) => sum + value, 0) * 5
      });
    }
    for (const [action, dx] of [['left', -1], ['right', 1]] as const) {
      const candidate = { ...state.piece, x: state.piece.x + dx };
      if (!collides(board, candidate))
        queue.push({ piece: candidate, path: [...state.path, action], rotation: state.rotation });
    }
    const rotated = rotatedPiece(board, state.piece);
    if (rotated)
      queue.push({ piece: rotated, path: [...state.path, 'rotate'], rotation: (state.rotation + 1) % 4 });
  }
  return [...landings.values()].sort((a, b) => b.quality - a.quality).slice(0, 12);
}

function drawMatrix(
  ctx: CanvasRenderingContext2D,
  matrix: Matrix,
  offset: Point
) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      const value = matrix[y][x];
      if (!value) continue;
      ctx.fillStyle = COLORS[value];
      ctx.fillRect(
        (x + offset.x) * CELL,
        (y + offset.y) * CELL,
        CELL - 1,
        CELL - 1
      );
    }
  }
}

interface Point {
  x: number;
  y: number;
}

export default tetris;
