import { GameModule } from './gameTypes';
import { createGameShell } from '../core/ui';
import { namespace } from '../core/storage';

type Board = number[];

interface Puzzle {
  puzzle: string;
  solution: string;
}

interface SaveState {
  puzzleIndex: number;
  board: Board;
  elapsedSeconds: number;
  mistakes: number;
  bestSeconds: number | null;
}

const PUZZLES: Puzzle[] = [
  {
    puzzle: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    solution:
      '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  },
  {
    puzzle: '009000000080605020501078000000000700706040105004000000000830907090706080000000200',
    solution:
      '469312857387695421521478369832159746796243185154687293245831967913726584678964512'
  },
  {
    puzzle: '300200000000107000706030500070009080900020004010800050009040301000702000000008006',
    solution:
      '394256187582197463716834529275469138968523714413871652829645371651782945347918256'
  }
];

const storage = namespace('sudoku');

const sudoku: GameModule = {
  id: 'sudoku',
  name: 'Sudoku',
  description: 'Fill the 9x9 grid without conflicts.',
  icon: '🔢',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Sudoku', goBack);

    const info = document.createElement('div');
    info.className = 'info-row';
    const puzzleEl = document.createElement('div');
    const timeEl = document.createElement('div');
    const mistakesEl = document.createElement('div');
    const statusEl = document.createElement('div');
    info.append(puzzleEl, timeEl, mistakesEl, statusEl);
    area.appendChild(info);

    const boardEl = document.createElement('div');
    boardEl.className = 'sudoku-grid';
    area.appendChild(boardEl);

    const keypad = document.createElement('div');
    keypad.className = 'sudoku-keypad';
    area.appendChild(keypad);

    const newBtn = document.createElement('button');
    newBtn.className = 'sudoku-action';
    newBtn.textContent = 'New puzzle';
    area.appendChild(newBtn);

    let puzzleIndex = 0;
    let board: Board = [];
    let givens = new Set<number>();
    let solution: Board = [];
    let selected: number | null = null;
    let mistakes = 0;
    let elapsedBase = 0;
    let bestSeconds: number | null = null;
    let timerId: number | undefined;
    let startMs = Date.now();

    hydrateFromSave();
    buildKeypad();
    render();
    startTimer();

    function hydrateFromSave() {
      const saved = storage.load<SaveState | null>('state', null);
      const totalPuzzles = PUZZLES.length;
      const savedIndex = saved?.puzzleIndex ?? 0;
      puzzleIndex = savedIndex % totalPuzzles;
      const puzzle = PUZZLES[puzzleIndex];
      board =
        saved?.board?.length === 81 && saved.puzzleIndex === puzzleIndex
          ? [...saved.board]
          : parseBoard(puzzle.puzzle);
      solution = parseBoard(puzzle.solution);
      givens = puzzleIndices(puzzle.puzzle);
      mistakes = saved?.mistakes ?? 0;
      elapsedBase = saved?.elapsedSeconds ?? 0;
      bestSeconds = saved?.bestSeconds ?? storage.load<number | null>('bestSeconds', null);
      startMs = Date.now();
    }

    function startTimer() {
      if (timerId !== undefined) clearInterval(timerId);
      startMs = Date.now();
      timerId = window.setInterval(() => {
        updateInfo();
      }, 1000);
    }

    function stopTimer() {
      elapsedBase = getElapsed();
      if (timerId !== undefined) {
        clearInterval(timerId);
        timerId = undefined;
      }
    }

    function buildKeypad() {
      keypad.innerHTML = '';
      for (let n = 1; n <= 9; n++) {
        const btn = document.createElement('button');
        btn.className = 'sudoku-btn';
        btn.textContent = String(n);
        btn.addEventListener('click', () => setValue(n));
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          setValue(n);
        });
        keypad.appendChild(btn);
      }
      const erase = document.createElement('button');
      erase.className = 'sudoku-btn muted';
      erase.textContent = 'Erase';
      erase.addEventListener('click', () => setValue(0));
      erase.addEventListener('touchend', (e) => {
        e.preventDefault();
        setValue(0);
      });
      keypad.appendChild(erase);

      newBtn.addEventListener('click', nextPuzzle);
      newBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        nextPuzzle();
      });
    }

    function render() {
      boardEl.innerHTML = '';
      for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 9; x++) {
          const idx = y * 9 + x;
          const cell = document.createElement('button');
          cell.className = 'sudoku-cell';
          const val = board[idx];
          if (val) cell.textContent = String(val);
          if (givens.has(idx)) cell.classList.add('given');
          if (selected === idx) cell.classList.add('selected');
          if (val && val !== solution[idx]) cell.classList.add('invalid');
          if (val && !givens.has(idx) && hasConflict(idx, val)) cell.classList.add('conflict');
          if (x % 3 === 0) cell.classList.add('thick-left');
          if (y % 3 === 0) cell.classList.add('thick-top');
          cell.dataset.idx = String(idx);
          cell.addEventListener('click', onCellSelect);
          cell.addEventListener('touchend', (e) => {
            e.preventDefault();
            onCellSelect(e);
          });
          boardEl.appendChild(cell);
        }
      }
      updateInfo();
    }

    function onCellSelect(e: Event) {
      const el = e.currentTarget as HTMLElement;
      const idx = Number(el.dataset.idx);
      if (givens.has(idx)) return;
      selected = idx;
      render();
    }

    function setValue(val: number) {
      if (selected === null) return;
      if (givens.has(selected)) return;
      board[selected] = val;
      if (val !== 0 && val !== solution[selected]) {
        mistakes += 1;
      }
      render();
      saveState();
      if (isSolved()) {
        onSolved();
      }
    }

    function isSolved() {
      for (let i = 0; i < 81; i++) {
        if (board[i] !== solution[i]) return false;
      }
      return true;
    }

    function onSolved() {
      stopTimer();
      const elapsed = getElapsed();
      if (bestSeconds === null || elapsed < bestSeconds) {
        bestSeconds = elapsed;
        storage.save('bestSeconds', bestSeconds);
      }
      statusEl.textContent = 'Solved!';
      saveState();
    }

    function nextPuzzle() {
      stopTimer();
      puzzleIndex = (puzzleIndex + 1) % PUZZLES.length;
      const puzzle = PUZZLES[puzzleIndex];
      board = parseBoard(puzzle.puzzle);
      solution = parseBoard(puzzle.solution);
      givens = puzzleIndices(puzzle.puzzle);
      mistakes = 0;
      elapsedBase = 0;
      selected = null;
      startMs = Date.now();
      startTimer();
      statusEl.textContent = '';
      render();
      saveState();
    }

    function saveState() {
      storage.save<SaveState>('state', {
        puzzleIndex,
        board,
        elapsedSeconds: getElapsed(),
        mistakes,
        bestSeconds
      });
    }

    function updateInfo() {
      puzzleEl.textContent = `Puzzle ${puzzleIndex + 1}/${PUZZLES.length}`;
      timeEl.textContent = `Time: ${formatTime(getElapsed())}` + formatBest();
      mistakesEl.textContent = `Mistakes: ${mistakes}`;
    }

    function formatBest() {
      if (bestSeconds === null) return '';
      return ` (Best ${formatTime(bestSeconds)})`;
    }

    function getElapsed() {
      if (timerId === undefined) return elapsedBase;
      return elapsedBase + Math.floor((Date.now() - startMs) / 1000);
    }

    function hasConflict(idx: number, val: number) {
      if (val === 0) return false;
      const row = Math.floor(idx / 9);
      const col = idx % 9;
      for (let x = 0; x < 9; x++) {
        const i = row * 9 + x;
        if (i !== idx && board[i] === val) return true;
      }
      for (let y = 0; y < 9; y++) {
        const i = y * 9 + col;
        if (i !== idx && board[i] === val) return true;
      }
      const boxRow = Math.floor(row / 3) * 3;
      const boxCol = Math.floor(col / 3) * 3;
      for (let y = boxRow; y < boxRow + 3; y++) {
        for (let x = boxCol; x < boxCol + 3; x++) {
          const i = y * 9 + x;
          if (i !== idx && board[i] === val) return true;
        }
      }
      return false;
    }

    function parseBoard(str: string): Board {
      return str.split('').map((c) => Number(c) || 0);
    }

    function puzzleIndices(str: string) {
      const indices = new Set<number>();
      str.split('').forEach((c, i) => {
        if (Number(c) > 0) indices.add(i);
      });
      return indices;
    }

    function formatTime(totalSeconds: number) {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return () => {
      stopTimer();
    };
  }
};

export default sudoku;
