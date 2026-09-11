import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';
import { exposeGame, message } from '../core/play';

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
  notes?: number[][];
  hints?: number;
}

const PUZZLES: Puzzle[] = [
  {
    puzzle:
      '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
    solution:
      '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  },
  {
    puzzle:
      '000260701680070090190004500820100040004602900050003028009300074040050036703018000',
    solution:
      '435269781682571493197834562826195347374682915951743628519326874248957136763418259'
  },
  {
    puzzle:
      '300200000000107000706030500070009080900020004010800050009040301000702000000008006',
    solution:
      '351286497492157638786934512275469183938521764614873259829645371163792845547318926'
  }
];

const storage = namespace('sudoku');

const sudoku: GameModule = {
  id: 'sudoku',
  name: 'Sudoku',
  description:
    'A quiet challenge, with pencil notes and a nudge when you need it.',
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
    let notes: number[][] = Array.from({ length: 81 }, () => []);
    let noteMode = false;
    let hints = 3;
    const history: { board: Board; notes: number[][] }[] = [];
    const helper = message(
      area,
      'Choose a cell, then a number. Use Notes to pencil in candidates.'
    );
    const actions = document.createElement('div');
    actions.className = 'control-row';
    const noteButton = createTouchButton('Notes: Off', () => {
      noteMode = !noteMode;
      noteButton.textContent = `Notes: ${noteMode ? 'On' : 'Off'}`;
      noteButton.setAttribute('aria-pressed', String(noteMode));
    });
    const undoButton = createTouchButton('Undo', () => {
      if (isSolved()) return;
      const old = history.pop();
      if (!old) return;
      board = old.board;
      notes = old.notes;
      render();
      saveState();
    });
    const hintButton = createTouchButton('Hint · 3', () => {
      if (!hints || isSolved()) return;
      if (
        selected === null ||
        givens.has(selected) ||
        board[selected] === solution[selected]
      )
        selected = board.findIndex((v, i) => v !== solution[i]);
      if (selected < 0) return;
      hints--;
      noteMode = false;
      noteButton.textContent = 'Notes: Off';
      noteButton.setAttribute('aria-pressed', 'false');
      setValue(solution[selected]);
      helper.textContent =
        'One cell revealed. Check its row, column and box for your next move.';
    });
    actions.append(noteButton, undoButton, hintButton);
    area.insertBefore(actions, newBtn);

    hydrateFromSave();
    buildKeypad();
    render();
    if (!isSolved()) startTimer();

    function hydrateFromSave() {
      const saved = storage.load<SaveState | null>('state-v2', null);
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
      bestSeconds =
        saved?.bestSeconds ?? storage.load<number | null>('bestSeconds', null);
      notes =
        saved?.notes?.length === 81
          ? saved.notes
          : Array.from({ length: 81 }, () => []);
      hints = saved?.hints ?? 3;
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
        keypad.appendChild(btn);
      }
      const erase = document.createElement('button');
      erase.className = 'sudoku-btn muted';
      erase.textContent = 'Erase';
      erase.addEventListener('click', () => setValue(0));
      keypad.appendChild(erase);

      newBtn.addEventListener('click', nextPuzzle);
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
          else if (notes[idx]?.length) {
            const pencil = document.createElement('span');
            pencil.className = 'sudoku-notes';
            for (let n = 1; n <= 9; n++) {
              const label = document.createElement('span');
              label.textContent = notes[idx].includes(n) ? String(n) : '';
              pencil.append(label);
            }
            cell.append(pencil);
          }
          cell.setAttribute(
            'aria-label',
            `Row ${y + 1}, column ${x + 1}, ${val || 'empty'}${givens.has(idx) ? ', given' : ''}`
          );
          if (selected !== null) {
            const sy = Math.floor(selected / 9),
              sx = selected % 9;
            if (
              x === sx ||
              y === sy ||
              (Math.floor(x / 3) === Math.floor(sx / 3) &&
                Math.floor(y / 3) === Math.floor(sy / 3))
            )
              cell.classList.add('peer');
            if (val && val === board[selected])
              cell.classList.add('same-value');
          }
          if (givens.has(idx)) cell.classList.add('given');
          if (selected === idx) cell.classList.add('selected');
          if (val && val !== solution[idx]) cell.classList.add('invalid');
          if (val && !givens.has(idx) && hasConflict(idx, val))
            cell.classList.add('conflict');
          if (x % 3 === 0) cell.classList.add('thick-left');
          if (y % 3 === 0) cell.classList.add('thick-top');
          cell.dataset.idx = String(idx);
          cell.addEventListener('click', onCellSelect);
          boardEl.appendChild(cell);
        }
      }
      updateInfo();
    }

    function onCellSelect(e: Event) {
      const el = e.currentTarget as HTMLElement;
      const idx = Number(el.dataset.idx);
      selected = idx;
      render();
    }

    function setValue(val: number) {
      if (selected === null || isSolved()) return;
      if (givens.has(selected)) return;
      if (noteMode && val && !board[selected]) {
        history.push({ board: [...board], notes: notes.map((n) => [...n]) });
        notes[selected] = notes[selected].includes(val)
          ? notes[selected].filter((n) => n !== val)
          : [...notes[selected], val];
        render();
        saveState();
        return;
      }
      if (board[selected] === val && (val !== 0 || !notes[selected].length))
        return;
      history.push({ board: [...board], notes: notes.map((n) => [...n]) });
      if (history.length > 100) history.shift();
      notes[selected] = [];
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
      notes = Array.from({ length: 81 }, () => []);
      hints = 3;
      history.length = 0;
      startMs = Date.now();
      startTimer();
      statusEl.textContent = '';
      render();
      saveState();
    }

    function saveState() {
      storage.save<SaveState>('state-v2', {
        puzzleIndex,
        board,
        elapsedSeconds: getElapsed(),
        mistakes,
        bestSeconds,
        notes,
        hints
      });
    }

    function updateInfo() {
      puzzleEl.textContent = `Puzzle ${puzzleIndex + 1}/${PUZZLES.length}`;
      timeEl.textContent = `Time: ${formatTime(getElapsed())}` + formatBest();
      mistakesEl.textContent = `Mistakes: ${mistakes} · Filled ${board.filter(Boolean).length}/81`;
      hintButton.textContent = `Hint · ${hints}`;
      hintButton.disabled = !hints || isSolved();
      undoButton.disabled = !history.length || isSolved();
      statusEl.textContent = isSolved() ? 'Solved! Beautiful work.' : '';
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

    const keyHandler = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        setValue(Number(e.key));
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setValue(0);
      }
      if (e.key.toLowerCase() === 'n') noteButton.click();
      if (e.key.toLowerCase() === 'z') undoButton.click();
      const delta = (
        { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 } as Record<
          string,
          number
        >
      )[e.key];
      if (delta) {
        e.preventDefault();
        selected = Math.max(0, Math.min(80, (selected ?? 0) + delta));
        render();
      }
    };
    const visibility = () => {
      if (document.hidden) {
        stopTimer();
        saveState();
      } else if (!isSolved()) startTimer();
    };
    const pageHide = () => {
      stopTimer();
      saveState();
    };
    window.addEventListener('keydown', keyHandler);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    const off = exposeGame(() => ({
      game: 'sudoku',
      mode: isSolved() ? 'won' : 'playing',
      board,
      selected,
      notes,
      noteMode,
      hints,
      mistakes,
      puzzleIndex,
      elapsed: getElapsed()
    }));
    return () => {
      stopTimer();
      saveState();
      off();
      window.removeEventListener('keydown', keyHandler);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
    };
  }
};

export default sudoku;
