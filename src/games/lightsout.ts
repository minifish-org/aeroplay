import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';
import { exposeGame, message } from '../core/play';

const SIZE = 5;
const storage = namespace('lightsout');
type SaveState = {
  board: number[];
  initial: number[];
  moves: number;
  level: number;
  hintsUsed: number;
};
const lightsOut: GameModule = {
  id: 'lightsout',
  name: 'Lights Out',
  icon: '💡',
  description: 'A ripple of light. Solve each puzzle in the fewest taps.',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Lights Out', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const boardEl = document.createElement('div');
    boardEl.className = 'lights-grid';
    area.append(info, boardEl);
    const status = message(
      area,
      'Tap a light to flip it and its four neighbors. Turn them all off.'
    );
    let level = 1,
      moves = 0,
      board: number[] = [],
      initial: number[] = [],
      hintsUsed = 0,
      hinted = -1;
    const history: number[][] = [];
    const controls = document.createElement('div');
    controls.className = 'control-row';
    const undo = createTouchButton('Undo', () => {
      const old = history.pop();
      if (!old) return;
      board = old;
      moves--;
      hinted = -1;
      render();
    });
    const hint = createTouchButton('Hint', () => {
      hinted = solveLights(board)[0] ?? -1;
      hintsUsed++;
      render();
    });
    const reset = createTouchButton('Retry', () => {
      board = [...initial];
      moves = 0;
      hintsUsed = 0;
      hinted = -1;
      history.length = 0;
      render();
    });
    const next = createTouchButton('Next puzzle →', () => {
      if (!isSolved(board)) return;
      level++;
      newBoard();
      render();
    });
    controls.append(undo, hint, reset, next);
    area.append(controls);
    function newBoard() {
      board = Array(25).fill(0);
      const cells = Array.from({ length: 25 }, (_, i) => i);
      for (let i = 0; i < Math.min(12, 2 + level); i++) {
        const idx = cells.splice(
          Math.floor(Math.random() * cells.length),
          1
        )[0];
        applyToggle(board, idx % SIZE, Math.floor(idx / SIZE));
      }
      if (isSolved(board)) applyToggle(board, 2, 2);
      initial = [...board];
      moves = 0;
      hintsUsed = 0;
      hinted = -1;
      history.length = 0;
    }
    function render() {
      const solved = isSolved(board),
        par = solveLights(initial).length;
      info.textContent = `Puzzle ${level} · Moves ${moves} · Perfect ${par} · Lit ${board.filter(Boolean).length}`;
      status.textContent = solved
        ? `${moves <= par && !hintsUsed ? '★★★ Perfect!' : moves <= par + 3 ? '★★ Nicely done!' : '★ Solved!'} All lights out. Next puzzle unlocked.`
        : hinted >= 0
          ? 'Try the outlined tile. Its cross will flip together.'
          : 'Tap a tile and its four neighbors flip. Turn every light off.';
      undo.disabled = !history.length;
      hint.disabled = solved;
      next.disabled = !solved;
      boardEl.innerHTML = '';
      board.forEach((value, idx) => {
        const button = document.createElement('button');
        button.className = 'light-cell';
        button.classList.toggle('on', !!value);
        button.classList.toggle('hinted', hinted === idx);
        button.textContent = value ? '✦' : '·';
        button.disabled = solved;
        button.setAttribute(
          'aria-label',
          `Row ${Math.floor(idx / SIZE) + 1}, column ${(idx % SIZE) + 1}, ${value ? 'on' : 'off'}`
        );
        button.setAttribute('aria-pressed', String(!!value));
        button.addEventListener('click', () => {
          if (isSolved(board)) return;
          history.push([...board]);
          moves++;
          hinted = -1;
          applyToggle(board, idx % SIZE, Math.floor(idx / SIZE));
          render();
        });
        boardEl.append(button);
      });
      storage.save<SaveState>('state-v2', {
        board,
        initial,
        moves,
        level,
        hintsUsed
      });
    }
    const saved = storage.load<SaveState | null>('state-v2', null);
    if (
      saved &&
      [saved.board, saved.initial].every(
        (b) => b?.length === 25 && b.every((v) => v === 0 || v === 1)
      )
    ) {
      ({ board, initial, moves, level, hintsUsed } = saved);
    } else newBoard();
    render();
    const off = exposeGame(() => ({
      game: 'lightsout',
      mode: isSolved(board) ? 'won' : 'playing',
      board,
      initial,
      moves,
      level,
      hinted,
      hintsUsed,
      par: solveLights(initial).length
    }));
    return off;
  }
};

function applyToggle(board: number[], x: number, y: number) {
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]) {
    const nx = x + dx,
      ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE)
      board[ny * SIZE + nx] ^= 1;
  }
}
function isSolved(board: number[]) {
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
    (i) => !pivots.includes(i)
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
export default lightsOut;
