import assert from "node:assert/strict";
import { build } from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
await build({
  entryPoints: [
    "game2048",
    "match3",
    "maze",
    "sudoku",
    "lightsout",
    "tetris",
  ].map((name) => `src/games/models/${name}.ts`),
  outdir: "output/puzzle-models",
  bundle: true,
  format: "esm",
  platform: "node",
  outExtension: { ".js": ".mjs" },
  logLevel: "silent",
});
const model = (name) =>
  import(pathToFileURL(path.resolve(`output/puzzle-models/${name}.mjs`)));
const tiles = await model("game2048");
const initial = [
    [2, 2, 2, 2],
    [4, 4, 8, 8],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  copy = structuredClone(initial);
const slide = tiles.preview2048Move(initial, "left");
assert.deepEqual(slide.grid[0], [4, 4, 0, 0]);
assert.deepEqual(slide.grid[1], [8, 16, 0, 0]);
assert.equal(slide.gained, 32);
assert.equal(slide.slides.length, 8);
assert.deepEqual(initial, copy);
console.log(
  "PASS 2048: single merges, scores, source-to-target animation records and immutable preview",
);
const gems = await model("match3");
for (let i = 0; i < 100; i++) {
  const board = gems.createBoard();
  assert.equal(gems.findMatches(board).length, 0);
  assert(gems.match3Moves(board).length);
}
const cross = Array.from({ length: 8 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => (x + y) % 5),
);
for (const [x, y] of [
  [3, 2],
  [2, 3],
  [3, 3],
  [4, 3],
  [3, 4],
])
  cross[y][x] = 0;
const matches = gems.findMatches(cross);
assert.equal(new Set(matches.map((p) => `${p.x},${p.y}`)).size, matches.length);
console.log(
  "PASS Match-3: 100 playable boards without initial matches, intersecting matches counted once",
);
const mazes = await model("maze");
for (const size of [8, 10, 16])
  for (let i = 0; i < 10; i++) {
    const board = mazes.generateMaze(size),
      queue = [{ x: 0, y: 0 }],
      seen = new Set(["0,0"]);
    let edges = 0;
    for (let n = 0; n < queue.length; n++) {
      const { x, y } = queue[n],
        walls = board[y][x].walls;
      for (const [dx, dy, side, opposite] of [
        [0, -1, "top", "bottom"],
        [1, 0, "right", "left"],
        [0, 1, "bottom", "top"],
        [-1, 0, "left", "right"],
      ]) {
        if (walls[side]) continue;
        const nx = x + dx,
          ny = y + dy;
        assert(nx >= 0 && ny >= 0 && nx < size && ny < size);
        assert.equal(board[ny][nx].walls[opposite], false);
        edges++;
        const key = `${nx},${ny}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    assert.equal(seen.size, size * size);
    assert.equal(edges / 2, size * size - 1);
  }
console.log(
  "PASS Maze: 30 connected perfect mazes with reciprocal walls and reachable exits",
);
const sudoku = await model("sudoku");
function countSolutions(board) {
  const cells = [...board];
  let count = 0;
  function visit() {
    let chosen = -1,
      options;
    for (let i = 0; i < 81; i++)
      if (!cells[i]) {
        const candidates = Array.from({ length: 9 }, (_, n) => n + 1).filter(
          (n) => !sudoku.hasConflict(cells, i, n),
        );
        if (!candidates.length) return;
        if (!options || candidates.length < options.length) {
          chosen = i;
          options = candidates;
        }
        if (options.length === 1) break;
      }
    if (chosen < 0) {
      count++;
      return;
    }
    for (const n of options) {
      cells[chosen] = n;
      visit();
      if (count > 1) break;
    }
    cells[chosen] = 0;
  }
  visit();
  return count;
}
for (let i = 0; i < 30; i++)
  for (const starter of [false, true]) {
    const { puzzle, solution } = sudoku.createPuzzle(i, starter);
    assert(puzzle.every((v, index) => !v || v === solution[index]));
    assert(
      solution.every((v, index) => !sudoku.hasConflict(solution, index, v)),
    );
    if (starter) assert.equal(puzzle.filter(Boolean).length, 52);
    assert.equal(countSolutions(puzzle), 1);
  }
console.log(
  "PASS Sudoku: 60 transformed Starter/Classic puzzles each have exactly one valid solution",
);
const lights = await model("lightsout");
for (let sample = 0; sample < 100; sample++) {
  const board = Array(25).fill(0);
  for (let i = 0; i < 12; i++) {
    const index = Math.floor(Math.random() * 25);
    lights.applyToggle(board, index % 5, Math.floor(index / 5));
  }
  const solution = lights.solveLights(board),
    solved = [...board];
  for (const i of solution)
    lights.applyToggle(solved, i % 5, Math.floor(i / 5));
  assert(lights.isSolved(solved));
  let minimum = Infinity;
  for (let mask = 0; mask < 32; mask++) {
    const next = [...board];
    let taps = 0;
    for (let x = 0; x < 5; x++)
      if (mask & (1 << x)) {
        lights.applyToggle(next, x, 0);
        taps++;
      }
    for (let y = 1; y < 5; y++)
      for (let x = 0; x < 5; x++)
        if (next[(y - 1) * 5 + x]) {
          lights.applyToggle(next, x, y);
          taps++;
        }
    if (lights.isSolved(next)) minimum = Math.min(minimum, taps);
  }
  assert.equal(solution.length, minimum);
}
console.log(
  "PASS Lights Out: 100 boards solved with independently verified minimum tap counts",
);
const blocks = await model("tetris");
for (let shape = 0; shape < 7; shape++) {
  const board = blocks.createBoard(),
    initial = { matrix: blocks.SHAPES[shape], x: 3, y: 0 };
  const landings = blocks.findLandings(board, initial);
  assert(landings.length);
  for (const landing of landings) {
    let piece = structuredClone(initial);
    for (const action of landing.path) {
      if (action === "rotate") piece = blocks.rotatedPiece(board, piece);
      else piece.x += action === "left" ? -1 : 1;
      assert(piece && !blocks.collides(board, piece));
    }
    while (!blocks.collides(board, { ...piece, y: piece.y + 1 })) piece.y++;
    assert.deepEqual(piece, landing.piece);
  }
}
console.log(
  "PASS Tetris: every offered Laya landing follows legal moves and reaches its advertised position",
);
