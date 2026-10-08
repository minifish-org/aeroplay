import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton } from '../core/ui';
import { namespace } from '../core/storage';
import { GameLoop } from '../core/engine';
import { exposeGame, message } from '../core/play';
import { isLayaControlling, registerLayaGame } from '../core/laya-bridge';
import { GemView, GEM_TIMING } from './views/gems';

type Cell = number;
type Point = { x: number; y: number };
const SIZE = 8;
const COLORS = ['#ef916e', '#6fcaeb', '#bb9bea', '#7ed6ad', '#f1ca6e'];
const SYMBOLS = ['◆', '●', '✦', '⬟', '▲'];
const match3: GameModule = {
  id: 'match3',
  name: 'Match-3',
  icon: '💎',
  description: '30 moves. One goal. Set off a spectacular chain reaction.',
  mount(root, goBack) {
    const storage = namespace('match3');
    const { area } = createGameShell(root, 'Match-3', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const progress = document.createElement('progress');
    progress.className = 'goal-progress';
    progress.setAttribute('aria-label', 'Level score target');
    const boardEl = document.createElement('div');
    boardEl.className = 'match3-board';
    area.append(info, progress, boardEl);
    const view = new GemView(boardEl);
    const status = message(
      area,
      'Tap two neighbors. Cascades multiply your points.'
    );
    let grid = createBoard(),
      score = 0,
      moves = 30,
      level = 1,
      best = storage.load('best', 0);
    let selected: Point | null = null,
      hinted: Point[] = [],
      matching: Point[] = [];
    let phase: 'playing' | 'clearing' | 'falling' | 'won' | 'over' = 'playing';
    let timer = 0,
      chain = 0;
    let paused = false;
    const saved = storage.load<{
      grid: number[][];
      score: number;
      moves: number;
      level: number;
    } | null>('run', null);
    if (
      saved &&
      saved.grid?.length === SIZE &&
      saved.grid.every(
        (r) =>
          r.length === SIZE &&
          r.every((v) => Number.isInteger(v) && v >= 0 && v < COLORS.length)
      ) &&
      !findMatches(saved.grid).length
    ) {
      grid = saved.grid;
      score = saved.score;
      moves = saved.moves;
      level = saved.level;
    }
    const controls = document.createElement('div');
    controls.className = 'control-row';
    const hint = createTouchButton('Hint', () => {
      if (phase !== 'playing') return;
      hinted = findMove(grid) ?? [];
      selected = null;
      status.textContent =
        'Try swapping the two outlined gems. Hints cost no moves.';
      render();
    });
    function restartLevel() {
      if (phase === 'clearing' || phase === 'falling') return;
      if (phase === 'won') level++;
      grid = createBoard();
      score = 0;
      moves = 30;
      chain = 0;
      selected = null;
      hinted = [];
      phase = 'playing';
      status.textContent = 'Tap two neighbors. Cascades multiply your points.';
      persist();
      render();
    }
    const next = createTouchButton('Restart level', restartLevel);
    controls.append(hint, next);
    area.append(controls);
    function target() {
      return 1000 + (level - 1) * 350;
    }
    function persist() {
      storage.save('run', { grid, score, moves, level });
    }
    function render(
      falls: { x: number; from: number; to: number; isNew: boolean }[] = []
    ) {
      info.textContent = `Level ${level} · Score ${score}/${target()} · Moves ${moves} · Best ${best}`;
      progress.max = target();
      progress.value = score;
      hint.disabled = phase !== 'playing';
      next.disabled = phase === 'clearing' || phase === 'falling';
      next.textContent =
        phase === 'won'
          ? 'Next level →'
          : phase === 'over'
            ? 'Try again'
            : 'Restart level';
      boardEl.innerHTML = '';
      grid.forEach((row, y) =>
        row.forEach((value, x) => {
          const button = document.createElement('button');
          button.className = 'match3-cell';
          button.style.background = COLORS[value];
          button.textContent = SYMBOLS[value];
          button.setAttribute(
            'aria-label',
            `Row ${y + 1}, column ${x + 1}, gem ${value + 1}`
          );
          button.dataset.x = String(x);
          button.dataset.y = String(y);
          button.classList.toggle(
            'selected',
            selected?.x === x && selected?.y === y
          );
          button.classList.toggle(
            'hinted',
            hinted.some((p) => p.x === x && p.y === y)
          );
          button.classList.toggle(
            'match3-clearing',
            phase === 'clearing' && matching.some((p) => p.x === x && p.y === y)
          );
          const fall = falls.find((m) => m.x === x && m.to === y);
          if (fall) {
            const cellSize = boardEl.clientWidth / SIZE;
            button.style.setProperty(
              '--fall-distance',
              `${(fall.to - fall.from) * cellSize}px`
            );
            button.classList.add('match3-fall');
          }
          button.disabled = phase !== 'playing';
          button.addEventListener('click', () => select({ x, y }));
          boardEl.append(button);
        })
      );
      view.draw(grid, selected, hinted, matching, phase, chain, falls);
    }
    function select(p: Point, fromLaya = false) {
      if (paused || (isLayaControlling() && !fromLaya) || phase !== 'playing')
        return;
      hinted = [];
      if (!selected) selected = p;
      else if (p.x === selected.x && p.y === selected.y) selected = null;
      else if (isNeighbor(selected, p)) {
        const a = selected;
        selected = null;
        swap(grid, a, p);
        matching = findMatches(grid);
        view.swap(a, p, matching.length > 0);
        if (!matching.length) {
          swap(grid, a, p);
          status.textContent =
            'Make a line of 3 or more. That swap costs no move.';
        } else {
          moves--;
          chain = 1;
          phase = 'clearing';
          timer = GEM_TIMING.swap + GEM_TIMING.clear + 0.02;
        }
      } else selected = p;
      render();
    }
    function finish() {
      if (score >= target()) {
        phase = 'won';
        status.textContent = `Level cleared! ${moves >= 15 ? '★★★' : moves >= 6 ? '★★' : '★'} · ${moves} moves to spare`;
      } else if (moves === 0) {
        phase = 'over';
        status.textContent = `So close! ${target() - score} points from the target. Try another route.`;
      } else {
        phase = 'playing';
        if (!hasMove(grid)) {
          grid = createBoard();
          status.textContent =
            'Fresh gems! No available swaps, so the board was shuffled for free.';
        }
      }
      persist();
      render();
    }
    const loop = new GameLoop(
      (dt) => {
        if (paused || document.hidden) return;
        if (phase !== 'clearing' && phase !== 'falling') return;
        timer -= dt;
        if (timer > 0) return;
        if (phase === 'clearing') {
          const gained = matching.length * 10 * chain;
          score += gained;
          best = Math.max(best, score);
          storage.save('best', best);
          status.textContent = `${chain > 1 ? `Cascade ×${chain}!` : matching.length >= 4 ? 'Big match!' : 'Nice match!'} +${gained}`;
          matching.forEach(({ x, y }) => {
            grid[y][x] = -1;
          });
          const falls = applyGravityWithMoves(grid);
          phase = 'falling';
          timer = GEM_TIMING.fall + 0.02;
          render(falls);
        } else {
          matching = findMatches(grid);
          if (matching.length) {
            chain++;
            phase = 'clearing';
            timer = GEM_TIMING.clear + 0.02;
            render();
          } else finish();
        }
      },
      0.05,
      (dt) => view.tick(paused ? 0 : dt)
    );
    finish();
    loop.start();
    const stateKey = () =>
      `${level}:${moves}:${score}:${phase}:${grid.flat().join('')}`;
    const options = () => match3Moves(grid).slice(0, 8);
    const offLaya = registerLayaGame({
      game: 'match3',
      observe: () => {
        if (paused || phase !== 'playing') return null;
        const candidates = options();
        if (!candidates.length) return null;
        return {
          key: stateKey(),
          context: `Match-3. Need ${Math.max(0, target() - score)} points in ${moves} moves. Gem types 1-5.\n${grid.map((row) => row.map((value) => value + 1).join('')).join('\n')}\n${candidates.map((c, i) => `Option ${i}: r${c.a.y + 1}c${c.a.x + 1} with r${c.b.y + 1}c${c.b.x + 1}; clears ${c.count} gems.`).join('\n')}`,
          question: 'Which legal swap clears the most gems immediately?',
          choices: Object.fromEntries(
            candidates.map((c, i) => [
              String(i),
              `Swap r${c.a.y + 1}c${c.a.x + 1} with r${c.b.y + 1}c${c.b.x + 1}`
            ])
          )
        };
      },
      act: (choice, key) => {
        if (paused || phase !== 'playing' || key !== stateKey()) return false;
        const candidate = options()[Number(choice)];
        if (!candidate || String(Number(choice)) !== choice) return false;
        selected = candidate.a;
        select(candidate.b, true);
        return phase !== 'playing';
      },
      start: () => {
        paused = false;
        if (phase === 'won' || phase === 'over') restartLevel();
      },
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
      isFinished: () => phase === 'won' || phase === 'over',
      isPaused: () => paused,
      intervalMs: 400,
      assistance: 'Move planning'
    });
    const off = exposeGame(
      () => ({
        game: 'match3',
        mode: paused ? 'paused' : phase,
        visual: view.snapshot(),
        grid,
        selected,
        hinted,
        score,
        moves,
        level,
        target: target(),
        chain
      }),
      (ms) => loop.advance(ms)
    );
    return () => {
      offLaya();
      loop.stop();
      view.dispose();
      off();
    };
  }
};

function createBoard(): Cell[][] {
  let grid: Cell[][];
  do {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const choices = [0, 1, 2, 3, 4].filter(
          (v) =>
            !(x >= 2 && grid[y][x - 1] === v && grid[y][x - 2] === v) &&
            !(y >= 2 && grid[y - 1][x] === v && grid[y - 2][x] === v)
        );
        grid[y][x] = choices[Math.floor(Math.random() * choices.length)];
      }
  } while (!hasMove(grid));
  return grid;
}
function findMove(grid: Cell[][]): Point[] | null {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      for (const n of [
        { x: x + 1, y },
        { x, y: y + 1 }
      ]) {
        if (n.x >= SIZE || n.y >= SIZE) continue;
        const p = { x, y };
        swap(grid, p, n);
        const found = findMatches(grid).length > 0;
        swap(grid, p, n);
        if (found) return [p, n];
      }
    }
  return null;
}
function isNeighbor(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy === 1;
}

function swap(
  grid: Cell[][],
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const tmp = grid[a.y][a.x];
  grid[a.y][a.x] = grid[b.y][b.x];
  grid[b.y][b.x] = tmp;
}

function findMatches(grid: Cell[][]): { x: number; y: number }[] {
  const found: { x: number; y: number }[] = [];
  // rows
  for (let y = 0; y < SIZE; y++) {
    let run = 1;
    for (let x = 1; x <= SIZE; x++) {
      if (x < SIZE && grid[y][x] === grid[y][x - 1]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) found.push({ x: x - 1 - k, y });
        }
        run = 1;
      }
    }
  }
  // cols
  for (let x = 0; x < SIZE; x++) {
    let run = 1;
    for (let y = 1; y <= SIZE; y++) {
      if (y < SIZE && grid[y][x] === grid[y - 1][x]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) found.push({ x, y: y - 1 - k });
        }
        run = 1;
      }
    }
  }
  return [...new Map(found.map((p) => [`${p.x}-${p.y}`, p])).values()];
}

function applyGravityWithMoves(
  grid: Cell[][]
): { x: number; from: number; to: number; isNew: boolean }[] {
  const moves: { x: number; from: number; to: number; isNew: boolean }[] = [];

  for (let x = 0; x < SIZE; x++) {
    const column: Cell[] = Array(SIZE).fill(-1);
    let write = SIZE - 1;

    for (let y = SIZE - 1; y >= 0; y--) {
      if (grid[y][x] !== -1) {
        column[write] = grid[y][x];
        if (write !== y) {
          moves.push({ x, from: y, to: write, isNew: false });
        }
        write--;
      }
    }

    for (let y = write; y >= 0; y--) {
      column[y] = Math.floor(Math.random() * COLORS.length);
      moves.push({ x, from: -1, to: y, isNew: true });
    }

    for (let y = 0; y < SIZE; y++) {
      grid[y][x] = column[y];
    }
  }

  return moves;
}

function hasMove(grid: Cell[][]): boolean {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const current = { x, y };
      const neighbors = [
        { x: x + 1, y },
        { x, y: y + 1 }
      ];
      for (const n of neighbors) {
        if (n.x >= SIZE || n.y >= SIZE) continue;
        swap(grid, current, n);
        const matches = findMatches(grid);
        swap(grid, current, n);
        if (matches.length) return true;
      }
    }
  }
  return false;
}

export function match3Moves(grid: Cell[][]) {
  const result: { a: Point; b: Point; count: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const a = { x, y };
      for (const b of [
        { x: x + 1, y },
        { x, y: y + 1 }
      ]) {
        if (b.x >= SIZE || b.y >= SIZE) continue;
        swap(grid, a, b);
        const count = findMatches(grid).length;
        swap(grid, a, b);
        if (count) result.push({ a, b, count });
      }
    }
  }
  return result.sort((a, b) => b.count - a.count);
}

export default match3;
