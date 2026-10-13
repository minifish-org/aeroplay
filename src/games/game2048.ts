import { compressAndMerge, gridToString, preview2048Move } from './mergeLogic';
export { preview2048Move } from './mergeLogic';
import { GameModule } from './gameTypes';
import { MergeView, type MergeAnimation } from './views/merge';
import { createGameShell, bindSwipe, createTouchButton, wrapSurface, surfaceActions } from '../core/ui';
import { namespace } from '../core/storage';
import { exposeGame, message } from '../core/play';

const SIZE = 4;

type Grid = number[][];

type MoveDirection = 'left' | 'right' | 'up' | 'down';

type AnimationMeta = MergeAnimation & {
  dir?: MoveDirection;
  shift?: number;
  merged?: boolean;
  spawned?: boolean;
};

const game2048: GameModule = {
  id: '2048',
  name: '2048',
  description: 'Build your next milestone. Undo a move and try another path.',
  icon: '🧮',
  mount(root, goBack, player) {
    const storage = namespace('game2048');
    const { area } = createGameShell(root, '2048', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const scoreEl = document.createElement('div');
    const bestEl = document.createElement('div');
    const restart = document.createElement('button');
    restart.className = 'touch-btn';
    restart.textContent = 'Restart';
    info.append(scoreEl, bestEl);

    const gridEl = document.createElement('div');
    gridEl.className = 'grid-2048';
    const surface = wrapSurface(gridEl, 'surface-board');
    area.append(info, surface);
    const actions = surfaceActions(surface);
    actions.append(restart);
    const view = new MergeView(gridEl);

    type Snapshot = { grid: Grid; score: number; moves: number };
    const saved = storage.load<Snapshot | null>('state', null);
    const validSave =
      saved &&
      saved.grid?.length === 4 &&
      saved.grid.every(
        (row) =>
          row.length === 4 &&
          row.every(
            (v) =>
              Number.isInteger(v) &&
              v >= 0 &&
              (v === 0 || (v >= 2 && Number.isInteger(Math.log2(v))))
          )
      );
    let grid = validSave ? saved.grid : createGrid();
    let score = validSave ? saved.score : 0;
    let moves = validSave ? saved.moves : 0;
    const history: Snapshot[] = [];
    const status = message(area, 'Swipe the board to combine matching tiles.');
    const undo = createTouchButton('Undo', () => {
      const previous = history.pop();
      if (!previous) return;
      grid = previous.grid;
      score = previous.score;
      moves = previous.moves;
      animations = {};
      render();
    });
    actions.append(undo);
    function canMove() {
      return grid.some((row, y) =>
        row.some((v, x) => !v || v === grid[y][x + 1] || v === grid[y + 1]?.[x])
      );
    }
    let best = storage.load('best', 0);
    let animations: Record<string, AnimationMeta> = {};
    let paused = false;

    const render = () => {
      gridEl.innerHTML = '';
      grid.forEach((row, y) => {
        row.forEach((val, x) => {
          const cell = document.createElement('div');
          cell.className = `tile tile-${val || 'empty'}`;
          cell.textContent = val ? String(val) : '';

          const anim = animations[`${x}-${y}`];
          if (anim) {
            if (anim.shift && anim.dir) {
              cell.style.setProperty('--shift', String(anim.shift));
              cell.classList.add(`slide-${anim.dir}`);
            }
            if (anim.merged) cell.classList.add('tile-merged');
            if (anim.spawned) cell.classList.add('tile-new');
          }

          gridEl.appendChild(cell);
        });
      });
      scoreEl.textContent = `Score: ${score}`;
      bestEl.textContent = `Best: ${best}`;
      undo.disabled = !history.length;
      const highest = Math.max(...grid.flat());
      const target = Math.max(
        128,
        2 ** (Math.floor(Math.log2(highest || 2)) + 1)
      );
      status.textContent = !canMove()
        ? 'No moves left. Undo to try another route, or start again.'
        : highest >= 2048
          ? `2048 reached! Keep going for ${target}. · Moves ${moves}`
          : `Next milestone: ${target} · Moves ${moves}${history.length ? ' · Undo available' : ''}`;
      storage.save('state', { grid, score, moves });

      view.draw(grid, animations);
      animations = {};
    };

    const spawn = (markNew = false) => {
      const empties: { x: number; y: number }[] = [];
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (!grid[y][x]) empties.push({ x, y });
        }
      }
      if (!empties.length) return false;
      const { x, y } = empties[Math.floor(Math.random() * empties.length)];
      grid[y][x] = Math.random() < 0.9 ? 2 : 4;
      if (markNew) {
        animations[`${x}-${y}`] = {
          ...(animations[`${x}-${y}`] || {}),
          spawned: true
        };
      }
      return true;
    };

    const restartGame = () => {
      animations = {};
      grid = createGrid();
      score = 0;
      moves = 0;
      history.length = 0;
      spawn(true);
      spawn(true);
      render();
    };

    const move = (dir: MoveDirection) => {
      if (paused || !canMove()) return;
      const snapshot = { grid: grid.map((row) => [...row]), score, moves };
      const before = gridToString(grid);
      animations = {};
      if (dir === 'left' || dir === 'right') {
        for (let y = 0; y < SIZE; y++) {
          const row = grid[y];
          const merged = compressAndMerge(row, dir === 'left');
          grid[y] = merged.newRow;
          score += merged.gained;
          merged.moves.forEach((record) => {
            const shift = Math.max(
              ...record.sources.map((s) => Math.abs(s - record.target))
            );
            animations[`${record.target}-${y}`] = {
              dir,
              shift,
              sources: record.sources.map((x) => ({ x, y })),
              merged: record.merged || undefined
            };
          });
        }
      } else {
        for (let x = 0; x < SIZE; x++) {
          const col = grid.map((row) => row[x]);
          const merged = compressAndMerge(col, dir === 'up');
          for (let y = 0; y < SIZE; y++) grid[y][x] = merged.newRow[y];
          score += merged.gained;
          merged.moves.forEach((record) => {
            const shift = Math.max(
              ...record.sources.map((s) => Math.abs(s - record.target))
            );
            animations[`${x}-${record.target}`] = {
              dir,
              shift,
              sources: record.sources.map((y) => ({ x, y })),
              merged: record.merged || undefined
            };
          });
        }
      }
      const after = gridToString(grid);
      if (before !== after) {
        history.push(snapshot);
        if (history.length > 20) history.shift();
        moves++;
        best = Math.max(best, score);
        storage.save('best', best);
        spawn(true);
        render();
      }
    };

    const swipeOff = bindSwipe(gridEl, (dir) => input.human(dir));
    restart.addEventListener('click', restartGame);
    const keyHandler = (e: KeyboardEvent) => {
      if (paused) return;
      if (e.key.startsWith('Arrow')) e.preventDefault();
      if (e.key.toLowerCase() === 'z') undo.click();
      if (e.key === 'ArrowLeft') input.human('left');
      if (e.key === 'ArrowRight') input.human('right');
      if (e.key === 'ArrowUp') input.human('up');
      if (e.key === 'ArrowDown') input.human('down');
    };
    window.addEventListener('keydown', keyHandler);

    if (validSave) render();
    else restartGame();
    const stateKey = () => `${moves}:${gridToString(grid)}`;
    const candidates = () =>
      (['left', 'right', 'up', 'down'] as MoveDirection[])
        .map((direction) => ({
          direction,
          ...preview2048Move(grid, direction)
        }))
        .filter((candidate) => candidate.changed);
    const input = player.connect<MoveDirection>({
      game: '2048',
      planning: () => !paused && canMove() ? { game: '2048', epoch: 'board', board: grid } : null,
      observe: () => {
        if (paused || !canMove()) return null;
        const options = candidates();
        if (!options.length) return null;
        return {
          key: stateKey(),
          context: `2048. Rows top to bottom; 0 is empty.\n${grid.map((row) => row.join(' ')).join('\n')}\n${options.map((c, i) => `Option ${i}: ${c.direction}, merge points ${c.gained}, empty cells ${c.empty}.`).join('\n')}`,
          question:
            'Which legal slide best combines matching tiles while keeping empty space?',
          inputs: Object.fromEntries(options.map((c, i) => [String(i), c.direction])),
          choices: Object.fromEntries(
            options.map((c, i) => [String(i), c.direction])
          )
        };
      },
      isCurrent: key => key === stateKey(),
      apply: direction => { const before = stateKey(); move(direction); return before !== stateKey(); },
      start: () => {
        paused = false;
        if (!canMove()) restartGame();
      },
      pause: () => {
        paused = true;
      },
      resume: () => {
        paused = false;
      },
      isFinished: () => !canMove(),
      isPaused: () => paused,
    });
    const off = exposeGame(
      () => ({
        game: '2048',
        mode: !canMove() ? 'over' : paused ? 'paused' : 'playing',
        grid,
        score,
        moves,
        undoCount: history.length,
        visual: view.snapshot()
      }),
      (ms) => view.scene.advance(ms)
    );

    return () => {
      input.dispose();
      off();
      view.dispose();
      swipeOff();
      window.removeEventListener('keydown', keyHandler);
    };
  }
};

function createGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export default game2048;
