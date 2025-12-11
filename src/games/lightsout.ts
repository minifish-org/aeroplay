import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';

interface SaveState {
  board: number[];
  moves: number;
  seed: number;
  best: number | null;
}

const SIZE = 5;
const storage = namespace('lightsout');

const lightsOut: GameModule = {
  id: 'lightsout',
  name: 'Lights Out',
  description: 'Turn off all lights by toggling the cross.',
  icon: '💡',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Lights Out', goBack);

    const info = document.createElement('div');
    info.className = 'info-row';
    const movesEl = document.createElement('div');
    const bestEl = document.createElement('div');
    const statusEl = document.createElement('div');
    info.append(movesEl, bestEl, statusEl);
    area.appendChild(info);

    const boardEl = document.createElement('div');
    boardEl.className = 'lights-grid';
    area.appendChild(boardEl);

    const controls = document.createElement('div');
    controls.className = 'control-row';
    const shuffleBtn = createTouchButton('Shuffle', shuffle);
    const resetBtn = createTouchButton('Reset', reset);
    controls.append(shuffleBtn, resetBtn);
    area.appendChild(controls);

    let seed = Math.floor(Math.random() * 1_000_000);
    let board = createBoard(seed);
    let moves = 0;
    let best: number | null = null;

    hydrateFromSave();
    render();

    function hydrateFromSave() {
      const saved = storage.load<SaveState | null>('state', null);
      if (saved) {
        seed = saved.seed;
        board = saved.board?.length === SIZE * SIZE ? [...saved.board] : createBoard(seed);
        moves = saved.moves ?? 0;
        best = saved.best ?? null;
      } else {
        persist();
      }
    }

    function render() {
      boardEl.innerHTML = '';
      board.forEach((cell, idx) => {
        const btn = document.createElement('button');
        btn.className = 'light-cell';
        if (cell) btn.classList.add('on');
        btn.dataset.idx = String(idx);
        btn.addEventListener('click', onToggle);
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          onToggle(e);
        });
        boardEl.appendChild(btn);
      });
      movesEl.textContent = `Moves: ${moves}`;
      bestEl.textContent = best ? `Best: ${best}` : 'Best: —';
    }

    function onToggle(e: Event) {
      const idx = Number((e.currentTarget as HTMLElement).dataset.idx);
      const x = idx % SIZE;
      const y = Math.floor(idx / SIZE);
      applyToggle(board, x, y);
      moves += 1;
      if (isSolved(board)) {
        statusEl.textContent = 'Solved!';
        if (best === null || moves < best) {
          best = moves;
        }
      } else {
        statusEl.textContent = '';
      }
      persist();
      render();
    }

    function shuffle() {
      seed = Math.floor(Math.random() * 1_000_000);
      board = createBoard(seed);
      moves = 0;
      statusEl.textContent = '';
      persist();
      render();
    }

    function reset() {
      board = createBoard(seed);
      moves = 0;
      statusEl.textContent = '';
      persist();
      render();
    }

    function persist() {
      storage.save<SaveState>('state', { board, moves, seed, best });
    }

    return () => {};
  }
};

function createBoard(seed: number) {
  const rng = mulberry32(seed);
  const board = Array.from({ length: SIZE * SIZE }, () => 0);
  const toggles = 12;
  for (let i = 0; i < toggles; i++) {
    const idx = Math.floor(rng() * SIZE * SIZE);
    const x = idx % SIZE;
    const y = Math.floor(idx / SIZE);
    applyToggle(board, x, y);
  }
  if (isSolved(board)) {
    return createBoard(seed + 1);
  }
  return board;
}

function applyToggle(board: number[], x: number, y: number) {
  const deltas = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  deltas.forEach(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return;
    const idx = ny * SIZE + nx;
    board[idx] = board[idx] ? 0 : 1;
  });
}

function isSolved(board: number[]) {
  return board.every((c) => c === 0);
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default lightsOut;
