import { createBoard, collides, merge, clearLines, rotatedPiece, boardHeights } from './tetrisLogic';
import { GameModule } from './gameTypes';
import { createGameCanvas } from '../core/pixi/scene';
import { TetrisView } from './views/tetris';
import { createGameShell, createTouchButton, wrapSurface, surfaceActions, surfaceCorner } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import { Mode, exposeGame, message } from '../core/play';

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

type TetrisInput = 'left' | 'right' | 'rotate' | 'down' | 'drop' | 'hold';
const tetris: GameModule = {
  id: 'tetris',
  name: 'Tetris',
  description: 'Stack tetrominoes, clear lines, avoid the top.',
  icon: '🧱',
  mount(root, goBack, player) {
    const storage = namespace('tetris');
    const { area } = createGameShell(root, 'Tetris', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const previews = document.createElement('div');
    previews.className = 'tetris-previews';
    const canvas = createGameCanvas(WIDTH * CELL, HEIGHT * CELL);
    canvas.className = 'game-canvas tetris-canvas';
    const surface = wrapSurface(canvas, 'surface-tetris');
    area.append(info, surface);
    const display = surfaceCorner(surface, 'tr');
    display.append(previews);
    const view = new TetrisView(canvas);
    const status = message(
      area,
      'Arrows move and rotate · Space drops · C holds · P pauses'
    );
    const controls = surfaceActions(surface);
    const start = createTouchButton('Start', () => {
      if (mode === 'over') reset();
      mode = mode === 'playing' ? 'paused' : 'playing';
      draw();
    });
    controls.append(start);
    const moveColumn = surfaceCorner(surface, 'left');
    moveColumn.append(
      createTouchButton('◀', () => input.human('left')),
      createTouchButton('⟳', () => input.human('rotate')),
      createTouchButton('▶', () => input.human('right'))
    );
    const dropColumn = surfaceCorner(surface, 'right');
    dropColumn.append(
      createTouchButton('Drop', () => input.human('drop')),
      createTouchButton('Hold', () => input.human('hold'))
    );
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
      view.lock(
        board,
        piece,
        board.flatMap((row, y) => (row.every(Boolean) ? [y] : []))
      );
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
      view.hardDrop();
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
      let ghostY = piece.y;
      while (!collides(board, { ...piece, y: ghostY + 1 })) ghostY++;
      view.draw(board, piece, ghostY, mode, lines, score);
    }
    const loop = new GameLoop(
      (dt) => {
        if (mode !== 'playing' || view.animating) return;
        dropTimer += dt;
        const speed = Math.max(
          0.09,
          0.8 * Math.pow(0.8, Math.floor(lines / 10))
        );
        if (dropTimer >= speed) {
          dropTimer = 0;
          if (!collides(board, { ...piece, y: piece.y + 1 })) piece.y++;
        }
        if (collides(board, { ...piece, y: piece.y + 1 })) {
          lockTimer += dt;
          if (lockTimer >= 0.45) lock();
        } else lockTimer = 0;
        draw();
      },
      0.05,
      (dt) => view.tick(mode === 'paused' ? 0 : dt)
    );
    const key = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.key === 'ArrowLeft') input.human('left');
      if (e.key === 'ArrowRight') input.human('right');
      if (e.key === 'ArrowUp' && !e.repeat) input.human('rotate');
      if (e.key === 'ArrowDown') input.human('down');
      if (e.code === 'Space' && !e.repeat) {
        if (mode === 'ready' || mode === 'over') start.click();
        else input.human('drop');
      }
      if (e.key.toLowerCase() === 'c' && !e.repeat) input.human('hold');
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
        visual: view.snapshot(),
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
    const placementKey = () => `${pieceVersion}:${piece.x}:${piece.y}:${piece.matrix.flat().join('')}:${heldThisTurn}`;
    function options() {
      const candidates: { action: TetrisInput; piece: Piece }[] = [];
      for (const [action, dx] of [['left', -1], ['right', 1]] as const) {
        const next = { ...piece, x: piece.x + dx };
        if (!collides(board, next)) candidates.push({ action, piece: next });
      }
      const rotated = rotatedPiece(board, piece);
      if (rotated) candidates.push({ action: 'rotate', piece: rotated });
      candidates.push({ action: 'drop', piece });
      if (!collides(board, { ...piece, y: piece.y + 1 })) candidates.push({ action: 'down', piece });
      if (!heldThisTurn) candidates.push({ action: 'hold', piece: { matrix: SHAPES[held ?? next[0]], x: 3, y: 0 } });
      return candidates.map(candidate => {
        const landing = { ...candidate.piece };
        while (!collides(board, { ...landing, y: landing.y + 1 })) landing.y++;
        const result = board.map(row => [...row]);
        merge(result, landing);
        const clears = clearLines(result), heights = boardHeights(result);
        let holes = 0;
        for (let x = 0; x < WIDTH; x++) {
          let covered = false;
          for (let y = 0; y < HEIGHT; y++) {
            if (result[y][x]) covered = true;
            else if (covered) holes++;
          }
        }
        const roughness = heights.slice(1).reduce((sum, h, i) => sum + Math.abs(h - heights[i]), 0);
        return { action: candidate.action, description: `${candidate.action}: landing clears ${clears} lines, holes ${holes}, height ${Math.max(...heights)}, roughness ${roughness}` };
      });
    }
    const input = player.connect<TetrisInput>({
      game: 'tetris',
      planning: () => mode === 'playing' ? { game: 'tetris', epoch: `${pieceVersion}:${board.flat().join(',')}`, board, piece } : null,
      observe: () => {
        if (mode !== 'playing') return null;
        const actions = options();
        return {
          key: placementKey(),
          context: `Tetris. Piece ${['I', 'J', 'L', 'O', 'S', 'T', 'Z'][current]} at column ${piece.x}, row ${piece.y}. Column heights ${boardHeights(board).join(',')}. Gravity continues during decisions. Each option is one control; landing features describe an eventual drop.`,
          question: 'Which control makes a landing with more cleared lines and fewer holes, height and roughness?',
          choices: Object.fromEntries(actions.map(c => [c.action, c.description])),
          inputs: Object.fromEntries(actions.map(c => [c.action, c.action])),
        };
      },
      isCurrent: key => key === placementKey(),
      apply: action => {
        if (mode !== 'playing') return false;
        const before = `${placementKey()}:${score}:${lockResets}`;
        if (action === 'left') move(-1);
        if (action === 'right') move(1);
        if (action === 'rotate') rotate();
        if (action === 'drop') drop();
        if (action === 'hold') hold();
        if (action === 'down' && !collides(board, { ...piece, y: piece.y + 1 })) { piece.y++; score++; draw(); }
        return before !== `${placementKey()}:${score}:${lockResets}`;
      },
      start: () => { if (mode === 'over') reset(); mode = 'playing'; draw(); },
      pause: () => { if (mode === 'playing') mode = 'paused'; draw(); },
      resume: () => { if (mode === 'paused') mode = 'playing'; draw(); },
      isFinished: () => mode === 'over', isPaused: () => mode === 'paused',
    });
    return () => {
      loop.stop();
      view.dispose();
      input.dispose();
      off();
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
    };
  }
};

export default tetris;
