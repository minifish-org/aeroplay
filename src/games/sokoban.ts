import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton, bindSwipe } from '../core/ui';
import { namespace } from '../core/storage';

type BaseTile = '#' | '.' | 'X';

interface LevelState {
  base: BaseTile[][];
  boxes: Set<string>;
  player: { x: number; y: number };
}

const storage = namespace('sokoban');

const LEVELS: string[] = [
  `
#######
#.X P#
#. B #
#.   #
#######
`,
  `
#######
#  X ##
# BB P#
#  .  #
#######
`
];

const sokoban: GameModule = {
  id: 'sokoban',
  name: 'Sokoban',
  description: 'Push crates onto targets with touch arrows.',
  icon: '📦',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Sokoban', goBack);
    const info = document.createElement('div');
    info.className = 'info-row';
    const levelEl = document.createElement('div');
    const statusEl = document.createElement('div');
    info.append(levelEl, statusEl);
    area.appendChild(info);

    const boardEl = document.createElement('div');
    boardEl.className = 'sokoban-board';
    area.appendChild(boardEl);

    const controls = document.createElement('div');
    controls.className = 'control-grid';
    const up = createTouchButton('▲', () => move(0, -1));
    const down = createTouchButton('▼', () => move(0, 1));
    const left = createTouchButton('◀', () => move(-1, 0));
    const right = createTouchButton('▶', () => move(1, 0));
    controls.append(
      document.createElement('span'),
      up,
      document.createElement('span'),
      left,
      document.createElement('span'),
      right,
      document.createElement('span'),
      down,
      document.createElement('span')
    );
    area.appendChild(controls);

    let levelIndex = storage.load('level', 0) % LEVELS.length;
    let state = parseLevel(LEVELS[levelIndex]);

    const swipeOff = bindSwipe(area, (dir) => {
      if (dir === 'up') move(0, -1);
      if (dir === 'down') move(0, 1);
      if (dir === 'left') move(-1, 0);
      if (dir === 'right') move(1, 0);
    });

    function render() {
      levelEl.textContent = `Level ${levelIndex + 1}/${LEVELS.length}`;
      boardEl.innerHTML = '';
      state.base.forEach((row, y) => {
        row.forEach((tile, x) => {
          const cell = document.createElement('div');
          cell.className = 'soko-cell';
          if (tile === '#') cell.classList.add('wall');
          if (tile === 'X') cell.classList.add('goal');
          if (state.boxes.has(key(x, y))) cell.classList.add('box');
          if (state.player.x === x && state.player.y === y) cell.classList.add('player');
          boardEl.appendChild(cell);
        });
      });
      statusEl.textContent = isComplete(state) ? 'Solved!' : '';
    }

    function move(dx: number, dy: number) {
      const nx = state.player.x + dx;
      const ny = state.player.y + dy;
      if (isWall(state, nx, ny)) return;
      if (state.boxes.has(key(nx, ny))) {
        const bx = nx + dx;
        const by = ny + dy;
        if (isWall(state, bx, by) || state.boxes.has(key(bx, by))) return;
        state.boxes.delete(key(nx, ny));
        state.boxes.add(key(bx, by));
      }
      state.player = { x: nx, y: ny };
      render();
      if (isComplete(state)) {
        levelIndex = (levelIndex + 1) % LEVELS.length;
        storage.save('level', levelIndex);
        state = parseLevel(LEVELS[levelIndex]);
        render();
      }
    }

    render();

    return () => {
      swipeOff();
    };
  }
};

function parseLevel(str: string): LevelState {
  const base: BaseTile[][] = [];
  const boxes = new Set<string>();
  let player = { x: 0, y: 0 };
  const rows = str
    .trim()
    .split('\n')
    .map((row) => row.split(''));
  rows.forEach((row, y) => {
    const baseRow: BaseTile[] = [];
    row.forEach((ch, x) => {
      if (ch === '#') {
        baseRow.push('#');
      } else if (ch === 'X') {
        baseRow.push('X');
      } else {
        baseRow.push('.');
      }
      if (ch === 'B') boxes.add(key(x, y));
      if (ch === 'P') player = { x, y };
    });
    base.push(baseRow);
  });
  return { base, boxes, player };
}

function isWall(state: LevelState, x: number, y: number) {
  return state.base[y]?.[x] === '#';
}

function isComplete(state: LevelState) {
  for (let y = 0; y < state.base.length; y++) {
    for (let x = 0; x < state.base[y].length; x++) {
      if (state.base[y][x] === 'X' && !state.boxes.has(key(x, y))) return false;
    }
  }
  return true;
}

function key(x: number, y: number) {
  return `${x},${y}`;
}

export default sokoban;
