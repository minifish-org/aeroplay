import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling, type LayaGameBridge } from "../core/laya-bridge";
import {
  mountPocket,
  COLORS,
  DIRECTIONS,
  type Point,
} from "../core/phaser/pocket";
import { BoardView } from "../core/phaser/board";
import {
  createBoard,
  findMatches,
  findMove,
  hasMove,
  swap,
  isNeighbor,
  applyGravityWithMoves,
  match3Moves,
} from "./models/match3";

const SIZE = 8,
  SYMBOLS = ["◆", "●", "✦", "⬟", "▲"];
const match3: GameModule = {
  id: "match3",
  name: "Match-3",
  icon: "💎",
  description: "A pocketful of candy gems. Make a sparkling chain!",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "match3",
        title: "Match-3",
        subtitle: "A pocketful of candy-colored treasure.",
        theme: "berry",
      },
      (scene) => {
        const storage = namespace("match3"),
          view = new BoardView(scene, SIZE);
        let grid = createBoard(),
          score = 0,
          moves = 30,
          level = 1,
          best = storage.load("best", 0);
        let selected: Point | null = null,
          hinted: Point[] = [],
          matching: Point[] = [];
        let phase:
          "playing" | "swapping" | "clearing" | "falling" | "won" | "over" =
          "playing";
        let afterSwap: "playing" | "clearing" = "playing",
          timer = 0,
          chain = 0,
          paused = false;
        const saved = storage.load<{
          grid: number[][];
          score: number;
          moves: number;
          level: number;
        } | null>("run", null);
        if (
          saved &&
          saved.grid?.length === SIZE &&
          saved.grid.every(
            (r) =>
              r.length === SIZE &&
              r.every((v) => Number.isInteger(v) && v >= 0 && v < 5),
          ) &&
          !findMatches(saved.grid).length
        )
          ({ grid, score, moves, level } = saved);
        const progress = document.createElement("progress");
        progress.className = "goal-progress";
        progress.setAttribute("aria-label", "Level score target");
        scene.area.insertBefore(progress, scene.controls);
        const hint = scene.button("Hint", () => {
          if (phase !== "playing" || paused) return;
          hinted = findMove(grid) ?? [];
          selected = null;
          scene.help("Swap the two outlined gems. Hints cost no moves.");
          render();
        });
        const next = scene.button("Restart level", restartLevel, true);
        function target() {
          return 1000 + (level - 1) * 350;
        }
        function persist() {
          if (phase === "playing" || phase === "won" || phase === "over")
            storage.save("run", { grid, score, moves, level });
        }
        function restartLevel() {
          if (["clearing", "falling", "swapping"].includes(phase)) return;
          if (phase === "won") level++;
          grid = createBoard();
          score = 0;
          moves = 30;
          chain = 0;
          selected = null;
          hinted = [];
          phase = "playing";
          scene.help("Tap two neighbors or swipe a gem. Make a line of three!");
          view.reset();
          render();
          persist();
        }
        function render(falls: { x: number; from: number; to: number }[] = []) {
          scene.stats({
            Level: level,
            Score: `${score}/${target()}`,
            Moves: moves,
          });
          progress.max = target();
          progress.value = score;
          hint.disabled = phase !== "playing";
          next.disabled = ["clearing", "falling", "swapping"].includes(phase);
          next.textContent =
            phase === "won"
              ? "Next level →"
              : phase === "over"
                ? "Try again"
                : "Restart level";
          if (phase !== "swapping") {
            view.reset();
            view.render(
              grid
                .flat()
                .map((v) => ({
                  color: COLORS[v] ?? 0xddebe5,
                  label: SYMBOLS[v] ?? "",
                  ink: "#ffffff",
                })),
              hinted.map((p) => p.y * SIZE + p.x),
              selected ? selected.y * SIZE + selected.x : -1,
              false,
            );
            if (falls.length) view.fall(falls);
            if (phase === "clearing")
              view.clear(matching.map((p) => p.y * SIZE + p.x));
          }
          scene.banner(
            paused
              ? "Treasure break!"
              : phase === "won"
                ? "Treasure collected!"
                : phase === "over"
                  ? "Another treasure hunt?"
                  : "",
            paused
              ? "Resume when you are ready"
              : phase === "won"
                ? `${score} points · Next island unlocked`
                : `${score} points · Try a fresh board`,
          );
        }
        function select(p: Point, fromLaya = false) {
          if (
            paused ||
            (isLayaControlling() && !fromLaya) ||
            phase !== "playing"
          )
            return;
          hinted = [];
          if (!selected) selected = p;
          else if (p.x === selected.x && p.y === selected.y) selected = null;
          else if (isNeighbor(selected, p)) {
            const a = selected;
            selected = null;
            swap(grid, a, p);
            matching = findMatches(grid);
            const valid = matching.length > 0;
            if (!valid) {
              swap(grid, a, p);
              scene.help(
                "Try making a line of three. That swap costs no move.",
              );
            } else {
              moves--;
              chain = 1;
              scene.cue("move");
            }
            view.swap(a.y * SIZE + a.x, p.y * SIZE + p.x, valid);
            afterSwap = valid ? "clearing" : "playing";
            phase = "swapping";
            timer = valid ? 0.17 : 0.32;
          } else selected = p;
          render();
        }
        function finish() {
          if (score >= target()) {
            phase = "won";
            scene.help(
              `Level cleared! ${moves >= 15 ? "★★★" : moves >= 6 ? "★★" : "★"} · ${moves} moves to spare`,
            );
            scene.celebrate("Treasure collected!");
          } else if (moves === 0) {
            phase = "over";
            scene.help(
              `Only ${target() - score} points to go. Try another route!`,
            );
          } else {
            phase = "playing";
            if (!hasMove(grid)) {
              grid = createBoard();
              scene.help("Fresh gems! A free shuffle gives you more matches.");
            }
          }
          render();
          persist();
        }
        function step(dt: number) {
          if (
            paused ||
            document.hidden ||
            !["swapping", "clearing", "falling"].includes(phase)
          )
            return;
          timer -= dt;
          if (timer > 0) return;
          if (phase === "swapping") {
            phase = afterSwap;
            timer = 0.16;
            render();
          } else if (phase === "clearing") {
            const gained = matching.length * 10 * chain;
            score += gained;
            best = Math.max(best, score);
            storage.save("best", best);
            scene.help(
              `${chain > 1 ? `Cascade ×${chain}!` : "Lovely match!"} +${gained}`,
            );
            scene.toast(
              chain > 1 ? `Cascade ×${chain}!` : `+${gained}`,
              200,
              40,
            );
            scene.cue("collect");
            matching.forEach(({ x, y }) => (grid[y][x] = -1));
            const falls = applyGravityWithMoves(grid);
            phase = "falling";
            timer = 0.24;
            render(falls);
          } else {
            matching = findMatches(grid);
            if (matching.length) {
              chain++;
              phase = "clearing";
              timer = 0.16;
              render();
            } else finish();
          }
        }
        scene.help(
          "Tap two neighbors or swipe a gem. Cascades make a sparkling chain!",
        );
        finish();
        const stateKey = () =>
          `${level}:${moves}:${score}:${phase}:${grid.flat().join("")}`;
        const options = () => match3Moves(grid).slice(0, 8);
        const bridge: LayaGameBridge = {
          game: "match3",
          observe: () => {
            if (paused || phase !== "playing") return null;
            const candidates = options();
            if (!candidates.length) return null;
            return {
              key: stateKey(),
              context: `Match-3. Need ${Math.max(0, target() - score)} points in ${moves} moves. Gem types 1-5.\n${grid.map((row) => row.map((value) => value + 1).join("")).join("\n")}\n${candidates.map((c, i) => `Option ${i}: r${c.a.y + 1}c${c.a.x + 1} with r${c.b.y + 1}c${c.b.x + 1}; clears ${c.count} gems.`).join("\n")}`,
              question: "Which legal swap clears the most gems immediately?",
              choices: Object.fromEntries(
                candidates.map((c, i) => [
                  String(i),
                  `Swap r${c.a.y + 1}c${c.a.x + 1} with r${c.b.y + 1}c${c.b.x + 1}`,
                ]),
              ),
            };
          },
          act: (choice, key) => {
            if (paused || phase !== "playing" || key !== stateKey())
              return false;
            const candidate = options()[Number(choice)];
            if (!candidate || String(Number(choice)) !== choice) return false;
            selected = candidate.a;
            select(candidate.b, true);
            return phase !== "playing";
          },
          start: () => {
            paused = false;
            if (phase === "won" || phase === "over") restartLevel();
          },
          pause: () => {
            paused = true;
            render();
          },
          resume: () => {
            paused = false;
            render();
          },
          isFinished: () => phase === "won" || phase === "over",
          isPaused: () => paused,
          intervalMs: 400,
          assistance: "Move planning",
        };

        return {
          read: () => ({
            game: "match3",
            mode: paused ? "paused" : phase,
            grid,
            selected,
            hinted,
            score,
            moves,
            level,
            target: target(),
            chain,
          }),
          step,
          bridge,
          dispose: persist,
          tap: (x, y) => {
            const index = view.indexAt(x, y);
            if (index !== null)
              select({ x: index % SIZE, y: Math.floor(index / SIZE) });
          },
          swipe: (direction, x, y) => {
            const index = view.indexAt(x, y);
            if (index === null || phase !== "playing") return;
            const a = { x: index % SIZE, y: Math.floor(index / SIZE) },
              d = DIRECTIONS[direction],
              b = { x: a.x + d.x, y: a.y + d.y };
            if (b.x < 0 || b.x >= SIZE || b.y < 0 || b.y >= SIZE) return;
            selected = a;
            select(b);
          },
        };
      },
      signal,
    );
  },
};
export default match3;
