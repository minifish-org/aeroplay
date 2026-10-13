import { applyToggle, isSolved, solveLights } from './lightsLogic';
export { solveLights } from './lightsLogic';
import { GameModule } from './gameTypes';
import { LightsView } from './views/puzzles';
import { createGameShell, createTouchButton, wrapSurface, surfaceActions } from '../core/ui';
import { namespace } from '../core/storage';
import { exposeGame, message } from '../core/play';

const SIZE = 5;
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
  mount(root, goBack, player) {
    const storage = namespace('lightsout');
    const { area } = createGameShell(root, 'Lights Out', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const boardEl = document.createElement('div');
    boardEl.className = 'lights-grid';
    const surface = wrapSurface(boardEl, 'surface-board');
    area.append(info, surface);
    const view = new LightsView(boardEl);
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
    let paused = false;
    const history: number[][] = [];
    const controls = surfaceActions(surface);
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
        button.addEventListener('click', () => input.human(idx));
        boardEl.append(button);
      });
      view.draw(board, hinted);
      storage.save<SaveState>('state-v2', {
        board,
        initial,
        moves,
        level,
        hintsUsed
      });
    }
    function press(index: number) {
      if (paused || isSolved(board))
        return;
      if (!Number.isInteger(index) || index < 0 || index >= board.length)
        return;
      history.push([...board]);
      moves++;
      hinted = -1;
      applyToggle(board, index % SIZE, Math.floor(index / SIZE));
      view.press(index);
      render();
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
    const stateKey = () => `${level}:${moves}:${board.join('')}`;
    const options = () =>
      board.map((_, index) => index)
        .map((index) => {
          const next = [...board];
          applyToggle(next, index % SIZE, Math.floor(index / SIZE));
          return { index, lit: next.filter(Boolean).length };
        }).sort((a, b) => a.lit - b.lit).slice(0, 16);
    const input = player.connect<number>({
      game: 'lightsout',
      planning: () => !paused && !isSolved(board) ? { game: 'lightsout', epoch: `${level}:${initial.join('')}`, board } : null,
      observe: () => {
        if (paused || isSolved(board)) return null;
        const candidates = options();
        if (!candidates.length) return null;
        return {
          key: stateKey(),
          context: 'Lights Out 5 by 5. A tap flips its own cell and four neighbors. All offered taps use the same rule and consume one move.',
          question: 'Which tap leaves the fewest lights on?',
          inputs: Object.fromEntries(candidates.map((c, i) => [String(i), c.index])),
          choices: Object.fromEntries(
            candidates.map((c, i) => [
              String(i),
              `Tap r${Math.floor(c.index / SIZE) + 1}c${(c.index % SIZE) + 1}; ${c.lit} lights remain`
            ])
          )
        };
      },
      isCurrent: key => key === stateKey(),
      apply: index => { const before = moves; press(index); return before !== moves; },
      start: () => {
        paused = false;
        if (isSolved(board)) {
          level++;
          newBoard();
          render();
        }
      },
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
      isFinished: () => isSolved(board),
      isPaused: () => paused,
    });
    const off = exposeGame(
      () => ({
        game: 'lightsout',
        visual: view.snapshot(),
        mode: isSolved(board) ? 'won' : paused ? 'paused' : 'playing',
        board,
        initial,
        moves,
        level,
        hinted,
        hintsUsed,
        par: solveLights(initial).length
      }),
      (ms) => view.scene.advance(ms)
    );
    return () => {
      input.dispose();
      off();
      view.dispose();
    };
  }
};

export default lightsOut;
