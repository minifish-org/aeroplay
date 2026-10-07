import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling } from "../core/laya-bridge";
import {
  mountPocket,
  arrowDirection,
  type Phaser,
} from "../core/phaser/pocket";
import { BoardView } from "../core/phaser/board";
import {
  createGrid,
  preview2048Move,
  type Grid,
  type MoveDirection,
} from "./models/game2048";

const PALETTE = [
  0xf7ead0, 0xf9d9a7, 0xffbd90, 0xff9d90, 0xe894b1, 0xc79ad9, 0xa1b5ef,
  0x7bcdcf, 0x8bd4ab, 0xb5d993, 0xffd06b,
];
const color = (value: number) =>
  value
    ? PALETTE[Math.min(PALETTE.length - 1, Math.log2(value) - 1)]
    : 0xcadfd7;
type Snapshot = { grid: Grid; score: number; moves: number };
const game2048: GameModule = {
  id: "2048",
  name: "2048",
  icon: "🧮",
  description: "Slide, pop and grow a rainbow of numbers.",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "2048",
        title: "2048",
        subtitle: "Two little numbers. One big rainbow.",
        theme: "honey",
      },
      (scene) => {
        const store = namespace("game2048"),
          view = new BoardView(scene, 4);
        const saved = store.load<Snapshot | null>("state", null);
        const valid =
          saved &&
          saved.grid?.length === 4 &&
          saved.grid.every(
            (row) =>
              row.length === 4 &&
              row.every(
                (v) =>
                  Number.isInteger(v) &&
                  (v === 0 || (v >= 2 && Number.isInteger(Math.log2(v)))),
              ),
          );
        let grid = valid ? saved.grid : createGrid(),
          score = valid ? saved.score : 0,
          moves = valid ? saved.moves : 0;
        let best = store.load("best", 0),
          paused = false,
          animation = 0,
          revision = 0;
        let flying: Phaser.GameObjects.Container[] = [];
        const history: Snapshot[] = [];
        const undo = scene.button("Undo", undoMove);
        scene.button("Restart", restart);
        scene.directions((x, y) =>
          move(x < 0 ? "left" : x > 0 ? "right" : y < 0 ? "up" : "down"),
        );
        function canMove() {
          return grid.some((row, y) =>
            row.some(
              (v, x) => !v || v === row[x + 1] || v === grid[y + 1]?.[x],
            ),
          );
        }
        function persist() {
          store.save("state", { grid, score, moves });
        }
        function spawn() {
          const empty = grid.flatMap((row, y) =>
            row.flatMap((v, x) => (v ? [] : [{ x, y }])),
          );
          const p = empty[Math.floor(Math.random() * empty.length)];
          if (p) grid[p.y][p.x] = Math.random() < 0.9 ? 2 : 4;
        }
        function settle() {
          animation = 0;
          flying.forEach((tile) => {
            scene.tweens.killTweensOf(tile);
            tile.destroy();
          });
          flying = [];
          view.tiles.forEach((tile) => tile.setVisible(true));
          view.reset();
        }
        function draw() {
          const highest = Math.max(...grid.flat());
          scene.stats({
            Score: score,
            Best: best,
            Next: Math.max(128, 2 ** (Math.floor(Math.log2(highest || 2)) + 1)),
          });
          undo.disabled = !history.length;
          view.render(
            grid
              .flat()
              .map((v) => ({ color: color(v), label: v ? String(v) : "" })),
            [],
            -1,
            false,
          );
          scene.help(
            `Swipe or use arrows to merge twins. ${moves} moves · Undo lets you try another path.`,
          );
          scene.banner(
            !canMove() ? "A lovely rainbow!" : paused ? "Taking a break" : "",
            !canMove()
              ? `${score} points · Undo or start a fresh board`
              : "Resume when you are ready",
          );
        }
        function restart() {
          settle();
          revision++;
          grid = createGrid();
          score = 0;
          moves = 0;
          history.length = 0;
          spawn();
          spawn();
          draw();
          persist();
        }
        function undoMove() {
          const old = history.pop();
          if (!old || paused) return;
          settle();
          revision++;
          grid = old.grid;
          score = old.score;
          moves = old.moves;
          draw();
          persist();
          scene.cue("move");
        }
        function move(direction: MoveDirection, fromLaya = false) {
          if (
            paused ||
            animation ||
            (isLayaControlling() && !fromLaya) ||
            !canMove()
          )
            return;
          const result = preview2048Move(grid, direction);
          if (!result.changed) return;
          history.push({ grid: grid.map((row) => [...row]), score, moves });
          if (history.length > 20) history.shift();
          const highest = Math.max(...grid.flat());
          grid = result.grid;
          score += result.gained;
          moves++;
          revision++;
          best = Math.max(best, score);
          store.save("best", best);
          spawn();
          persist();
          draw();
          if (!scene.reducedMotion) {
            view.tiles.forEach((tile) => tile.setVisible(false));
            for (const slide of result.slides) {
              const from = view.center(slide.from.y * 4 + slide.from.x),
                to = view.center(slide.to.y * 4 + slide.to.x);
              const image = scene.add
                .image(0, 0, "tile")
                .setDisplaySize(view.cell - 7, view.cell - 7)
                .setTint(color(slide.value));
              const text = scene.text(
                0,
                -1,
                String(slide.value),
                slide.value >= 1024 ? 26 : 32,
              );
              const tile = scene.add
                .container(from.x, from.y, [image, text])
                .setDepth(10);
              flying.push(tile);
              scene.tweens.add({
                targets: tile,
                x: to.x,
                y: to.y,
                duration: 150,
                ease: "Sine.easeOut",
              });
            }
            animation = 0.16;
          }
          scene.cue(result.gained ? "collect" : "move");
          for (const slide of result.slides.filter((s) => s.merged)) {
            const p = view.center(slide.to.y * 4 + slide.to.x);
            scene.burst(p.x, p.y, color(slide.value * 2), 5);
          }
          if (
            Math.max(...grid.flat()) > highest &&
            Math.max(...grid.flat()) >= 128
          )
            scene.celebrate(`${Math.max(...grid.flat())}!`);
        }
        const key = () => `${revision}:${moves}:${grid.flat().join(",")}`;
        const candidates = () =>
          (["left", "right", "up", "down"] as MoveDirection[])
            .map((direction) => ({
              direction,
              ...preview2048Move(grid, direction),
            }))
            .filter((c) => c.changed);
        if (!valid) restart();
        else draw();
        return {
          read: () => ({
            game: "2048",
            mode: !canMove() ? "over" : paused ? "paused" : "playing",
            grid,
            score,
            moves,
            undoCount: history.length,
            animating: animation > 0,
          }),
          step: (dt) => {
            if (!paused && animation && (animation -= dt) <= 0) {
              settle();
              draw();
            }
          },
          swipe: (direction) => move(direction),
          key: (e) => {
            const dir = arrowDirection(e.key);
            if (dir) move(dir);
            if (e.key.toLowerCase() === "z") undoMove();
          },
          dispose: persist,
          bridge: {
            game: "2048",
            observe: () => {
              if (paused || animation || !canMove()) return null;
              const options = candidates();
              return {
                key: key(),
                context: `2048. Rows top to bottom; 0 is empty.\n${grid.map((r) => r.join(" ")).join("\n")}\n${options.map((c, i) => `Option ${i}: ${c.direction}, points ${c.gained}, empty ${c.empty}`).join("\n")}`,
                question:
                  "Which slide combines twins while keeping empty space?",
                choices: Object.fromEntries(
                  options.map((c, i) => [String(i), c.direction]),
                ),
              };
            },
            act: (choice, observed) => {
              if (paused || animation || observed !== key()) return false;
              const c = candidates()[Number(choice)];
              if (!c || String(Number(choice)) !== choice) return false;
              move(c.direction, true);
              return true;
            },
            start: () => {
              paused = false;
              if (!canMove()) restart();
              draw();
            },
            pause: () => {
              paused = true;
              draw();
            },
            resume: () => {
              paused = false;
              draw();
            },
            isFinished: () => !canMove(),
            isPaused: () => paused,
            intervalMs: 450,
            assistance: "Move planning",
          },
        };
      },
      signal,
    );
  },
};
export default game2048;
