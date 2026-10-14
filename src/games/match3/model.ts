export type GemPoint = {
  x: number;
  y: number;
};
export type GemGrid = number[][];
export const GEM_SIZE = 8;
export const GEM_COLORS = 5;
const copyGrid = (grid: GemGrid) => grid.map(row => [...row]);
const same = (a: GemPoint, b: GemPoint) => a.x === b.x && a.y === b.y;
const neighbors = (a: GemPoint, b: GemPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
function exchange(grid: GemGrid, a: GemPoint, b: GemPoint) {
  [grid[a.y][a.x], grid[b.y][b.x]] = [grid[b.y][b.x], grid[a.y][a.x]];
}
export function findMatches(grid: GemGrid): GemPoint[] {
  const found = new Map<number, GemPoint>();
  for (let axis = 0; axis < 2; axis++)
    for (let fixed = 0; fixed < GEM_SIZE; fixed++) {
      let start = 0;
      for (let cursor = 1; cursor <= GEM_SIZE; cursor++) {
        const cell = (position: number) => axis ? grid[position][fixed] : grid[fixed][position];
        if (cursor < GEM_SIZE && cell(cursor) === cell(start))
          continue;
        if (cell(start) >= 0 && cursor - start >= 3)
          for (let index = start; index < cursor; index++) {
            const point = axis ? { x: fixed, y: index } : { x: index, y: fixed };
            found.set(point.y * GEM_SIZE + point.x, point);
          }
        start = cursor;
      }
    }
  return [...found.values()];
}
export function match3Moves(grid: GemGrid) {
  const legal: {
    a: GemPoint;
    b: GemPoint;
    count: number;
  }[] = [];
  for (let y = 0; y < GEM_SIZE; y++)
    for (let x = 0; x < GEM_SIZE; x++) {
      const a = { x, y };
      for (const b of [{ x: x + 1, y }, { x, y: y + 1 }]) {
        if (b.x >= GEM_SIZE || b.y >= GEM_SIZE)
          continue;
        exchange(grid, a, b);
        const count = findMatches(grid).length;
        exchange(grid, a, b);
        if (count)
          legal.push({ a, b, count });
      }
    }
  return legal.sort((a, b) => b.count - a.count);
}
export function createMatchBoard(random = Math.random): GemGrid {
  for (;;) {
    const grid = Array.from({ length: GEM_SIZE }, () => Array<number>(GEM_SIZE).fill(-1));
    for (let y = 0; y < GEM_SIZE; y++)
      for (let x = 0; x < GEM_SIZE; x++) {
        const choices = Array.from({ length: GEM_COLORS }, (_, color) => color).filter(color => !(x >= 2 && grid[y][x - 1] === color && grid[y][x - 2] === color) &&
          !(y >= 2 && grid[y - 1][x] === color && grid[y - 2][x] === color));
        grid[y][x] = choices[Math.floor(random() * choices.length)];
      }
    if (match3Moves(grid).length)
      return grid;
  }
}
export type GemFall = {
  x: number;
  from: number;
  to: number;
  isNew: boolean;
};
export function refillGems(grid: GemGrid, random = Math.random): GemFall[] {
  const falls: GemFall[] = [];
  for (let x = 0; x < GEM_SIZE; x++) {
    const kept = grid.map(row => row[x]).flatMap((value, y) => value >= 0 ? [{ value, y }] : []);
    const blanks = GEM_SIZE - kept.length;
    for (let y = 0; y < GEM_SIZE; y++) {
      const source = kept[y - blanks];
      grid[y][x] = source ? source.value : Math.floor(random() * GEM_COLORS);
      if (!source || source.y !== y)
        falls.push({ x, from: source?.y ?? y - blanks, to: y, isNew: !source });
    }
  }
  return falls;
}
export type MatchSave = {
  grid: GemGrid;
  score: number;
  moves: number;
  level: number;
};
export function validMatchSave(value: unknown): value is MatchSave {
  if (!value || typeof value !== 'object')
    return false;
  const save = value as MatchSave;
  return Array.isArray(save.grid) && save.grid.length === GEM_SIZE && save.grid.every(row => Array.isArray(row) && row.length === GEM_SIZE && row.every(cell => Number.isInteger(cell) && cell >= 0 && cell < GEM_COLORS)) &&
    Number.isFinite(save.score) && save.score >= 0 && Number.isInteger(save.moves) && save.moves >= 0 && save.moves <= 30 &&
    Number.isInteger(save.level) && save.level >= 1 && !findMatches(save.grid).length;
}
export function createMatch3Model(saved: unknown = null, best = 0, random = Math.random) {
  const model = {
    mode: 'playing' as 'playing' | 'paused' | 'won' | 'over',
    phase: 'playing' as 'playing' | 'clearing' | 'falling' | 'won' | 'over',
    grid: [] as GemGrid, selected: null as GemPoint | null, hinted: [] as GemPoint[], matching: [] as GemPoint[],
    falls: [] as GemFall[], score: 0, moves: 30, level: 1, best: Math.max(0, best),
    chain: 0, timer: 0, clock: 0, epoch: 0, serial: 0, shuffled: false,
    target() { return 1000 + (model.level - 1) * 350; },
    reset(advance?: boolean) {
      if (advance ?? model.phase === 'won')
        model.level++;
      model.grid = createMatchBoard(random);
      model.score = 0;
      model.moves = 30;
      model.mode = 'playing';
      model.phase = 'playing';
      model.selected = null;
      model.hinted = [];
      model.matching = [];
      model.falls = [];
      model.chain = 0;
      model.timer = 0;
      model.clock = 0;
      model.epoch++;
      model.serial++;
      model.shuffled = false;
    },
    finish() {
      model.shuffled = false;
      if (model.score >= model.target()) {
        model.mode = 'won';
        model.phase = 'won';
      }
      else if (!model.moves) {
        model.mode = 'over';
        model.phase = 'over';
      }
      else {
        model.mode = 'playing';
        model.phase = 'playing';
        if (!match3Moves(model.grid).length) {
          model.grid = createMatchBoard(random);
          model.shuffled = true;
          model.serial++;
        }
      }
    },
    hint() {
      if (model.mode !== 'playing' || model.phase !== 'playing')
        return false;
      const move = match3Moves(model.grid)[0];
      model.hinted = move ? [move.a, move.b] : [];
      model.selected = null;
      return !!move;
    },
    act(input: unknown) {
      if (input === 'hint')
        return model.hint();
      if (input === 'retry' || input === 'restart' || input === 'next') {
        if (model.phase === 'clearing' || model.phase === 'falling')
          return false;
        model.reset();
        return true;
      }
      if (model.mode !== 'playing' || model.phase !== 'playing')
        return false;
      const point = typeof input === 'number' ? { x: input % GEM_SIZE, y: Math.floor(input / GEM_SIZE) } : input as GemPoint;
      if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y) ||
        point.x < 0 || point.x >= GEM_SIZE || point.y < 0 || point.y >= GEM_SIZE)
        return false;
      model.hinted = [];
      model.shuffled = false;
      if (!model.selected)
        model.selected = { ...point };
      else if (same(model.selected, point))
        model.selected = null;
      else if (!neighbors(model.selected, point))
        model.selected = { ...point };
      else {
        const previous = model.selected;
        model.selected = null;
        exchange(model.grid, previous, point);
        model.matching = findMatches(model.grid);
        model.serial++;
        if (!model.matching.length)
          exchange(model.grid, previous, point);
        else {
          model.moves--;
          model.chain = 1;
          model.phase = 'clearing';
          model.timer = 0.28;
        }
      }
      return true;
    },
    step(dt: number) {
      if (model.mode !== 'playing')
        return;
      model.clock += Math.max(0, dt);
      if (model.phase !== 'clearing' && model.phase !== 'falling')
        return;
      model.timer -= Math.max(0, dt);
      if (model.timer > 0)
        return;
      if (model.phase === 'clearing') {
        model.score += model.matching.length * 10 * model.chain;
        model.best = Math.max(model.best, model.score);
        for (const point of model.matching)
          model.grid[point.y][point.x] = -1;
        model.falls = refillGems(model.grid, random);
        model.phase = 'falling';
        model.timer = 0.24;
        model.serial++;
      }
      else {
        model.matching = findMatches(model.grid);
        if (model.matching.length) {
          model.chain++;
          model.phase = 'clearing';
          model.timer = 0.18;
          model.serial++;
        }
        else
          model.finish();
      }
    },
    pause() { if (model.mode === 'playing')
      model.mode = 'paused'; },
    resume() { if (model.mode === 'paused')
      model.mode = 'playing'; },
    saved(): MatchSave { return { grid: copyGrid(model.grid), score: model.score, moves: model.moves, level: model.level }; },
    snapshot() {
      return { game: 'match3', mode: model.mode === 'paused' ? 'paused' : model.phase, ...model.saved(), best: model.best,
        selected: model.selected ? { ...model.selected } : null, hinted: model.hinted.map(point => ({ ...point })),
        matching: model.matching.map(point => ({ ...point })), target: model.target(), chain: model.chain, epoch: model.epoch };
    },
    planning() {
      return model.mode === 'playing' && model.phase === 'playing' ? { game: 'match3' as const, epoch: String(model.epoch),
        board: copyGrid(model.grid), selected: model.selected ? { ...model.selected } : null } : null;
    },
    summary() {
      return { score: model.score, best: model.best, moves: model.moves, level: model.level,
        target: model.target(), chain: model.chain, shuffled: model.shuffled,
        stars: model.mode === 'won' ? model.moves >= 15 ? 3 : model.moves >= 6 ? 2 : 1 : 0 };
    }
  };
  if (validMatchSave(saved)) {
    model.grid = copyGrid(saved.grid);
    model.score = saved.score;
    model.moves = saved.moves;
    model.level = saved.level;
    model.best = Math.max(model.best, model.score);
    model.finish();
  }
  else
    model.reset(false);
  return model;
}
export type Match3Model = ReturnType<typeof createMatch3Model>;
