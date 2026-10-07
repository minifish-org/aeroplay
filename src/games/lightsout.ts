import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling, type LayaGameBridge } from "../core/laya-bridge";
import { mountPocket } from "../core/phaser/pocket";
import { BoardView } from "../core/phaser/board";
import { applyToggle, isSolved, solveLights } from "./models/lightsout";

const SIZE = 5;
type SaveState = {
  board: number[];
  initial: number[];
  moves: number;
  level: number;
  hintsUsed: number;
};
const lightsOut: GameModule = {
  id: "lightsout",
  name: "Lights Out",
  icon: "💡",
  description: "Tuck the little stars in. One tap makes a ripple!",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "lightsout",
        title: "Lights Out",
        subtitle: "Help the little stars fall asleep.",
        theme: "honey",
      },
      (scene) => {
        const storage = namespace("lightsout"),
          view = new BoardView(scene, SIZE);
        let board: number[] = [],
          initial: number[] = [],
          moves = 0,
          level = 1,
          hintsUsed = 0,
          hinted = -1,
          paused = false;
        const history: number[][] = [];
        const undo = scene.button("Undo", () => {
          const old = history.pop();
          if (!old || paused) return;
          board = old;
          moves--;
          hinted = -1;
          render();
        });
        const hint = scene.button("Hint", () => {
          if (isSolved(board) || paused) return;
          hinted = solveLights(board)[0] ?? -1;
          hintsUsed++;
          render();
        });
        scene.button("Retry", () => {
          board = [...initial];
          moves = 0;
          hintsUsed = 0;
          hinted = -1;
          history.length = 0;
          render();
        });
        const next = scene.button(
          "Next puzzle →",
          () => {
            if (!isSolved(board)) return;
            level++;
            newBoard();
            render();
          },
          true,
        );
        function newBoard() {
          board = Array(25).fill(0);
          const cells = Array.from({ length: 25 }, (_, i) => i);
          for (let i = 0; i < Math.min(12, 2 + level); i++) {
            const index = cells.splice(
              Math.floor(Math.random() * cells.length),
              1,
            )[0];
            applyToggle(board, index % SIZE, Math.floor(index / SIZE));
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
          scene.stats({
            Puzzle: level,
            Moves: moves,
            Perfect: par,
            Awake: board.filter(Boolean).length,
          });
          view.render(
            board.map((v) => ({
              color: v ? 0xffd675 : 0xc9dcdf,
              label: v ? "✦" : "·",
              ink: v ? "#ac753a" : "#7c9da8",
            })),
            hinted >= 0 ? [hinted] : [],
          );
          undo.disabled = !history.length;
          hint.disabled = solved;
          next.disabled = !solved;
          scene.help(
            solved
              ? `${moves <= par && !hintsUsed ? "★★★ Perfect!" : moves <= par + 3 ? "★★ Lovely!" : "★ Solved!"} All stars asleep. Next puzzle unlocked!`
              : hinted >= 0
                ? "Try the outlined star. Its cross flips together."
                : "Tap a star and its four neighbors flip. Put them all to sleep.",
          );
          scene.banner(
            paused ? "Taking a little break" : "",
            "Resume when you are ready",
          );
          storage.save<SaveState>("state-v2", {
            board,
            initial,
            moves,
            level,
            hintsUsed,
          });
        }
        function press(index: number, fromLaya = false) {
          if (
            paused ||
            (isLayaControlling() && !fromLaya) ||
            isSolved(board) ||
            index < 0 ||
            index >= 25
          )
            return;
          history.push([...board]);
          moves++;
          hinted = -1;
          applyToggle(board, index % SIZE, Math.floor(index / SIZE));
          const p = view.center(index);
          scene.burst(p.x, p.y, 0xffcf70, 8);
          scene.cue("move");
          render();
          if (isSolved(board)) scene.celebrate("Sweet dreams, stars!");
        }
        const saved = storage.load<SaveState | null>("state-v2", null);
        if (
          saved &&
          [saved.board, saved.initial].every(
            (b) => b?.length === 25 && b.every((v) => v === 0 || v === 1),
          )
        )
          ({ board, initial, moves, level, hintsUsed } = saved);
        else newBoard();
        render();
        const stateKey = () => `${level}:${moves}:${board.join("")}`;
        const options = () =>
          solveLights(board)
            .slice(0, 16)
            .map((index) => {
              const next = [...board];
              applyToggle(next, index % SIZE, Math.floor(index / SIZE));
              return { index, lit: next.filter(Boolean).length };
            });
        const bridge: LayaGameBridge = {
          game: "lightsout",
          observe: () => {
            if (paused || isSolved(board)) return null;
            const candidates = options();
            if (!candidates.length) return null;
            return {
              key: stateKey(),
              context: `Lights Out 5 by 5; 1 is on.\n${Array.from({ length: SIZE }, (_, row) => board.slice(row * SIZE, (row + 1) * SIZE).join("")).join("\n")}\nConstraint assistance supplies taps from a solution of this visible board. Each tap flips itself and four neighbors.\n${candidates.map((c, i) => `Option ${i}: ${c.lit} lights remain on.`).join("\n")}`,
              question: "Which assisted tap leaves the fewest lights on?",
              choices: Object.fromEntries(
                candidates.map((c, i) => [
                  String(i),
                  `Tap r${Math.floor(c.index / SIZE) + 1}c${(c.index % SIZE) + 1}`,
                ]),
              ),
            };
          },
          act: (choice, key) => {
            if (paused || isSolved(board) || key !== stateKey()) return false;
            const candidate = options()[Number(choice)];
            if (!candidate || String(Number(choice)) !== choice) return false;
            press(candidate.index, true);
            return true;
          },
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
            render();
          },
          resume: () => {
            paused = false;
            render();
          },
          isFinished: () => isSolved(board),
          isPaused: () => paused,
          intervalMs: 500,
          assistance: "Constraint assistance",
        };

        return {
          read: () => ({
            game: "lightsout",
            mode: isSolved(board) ? "won" : paused ? "paused" : "playing",
            board,
            initial,
            moves,
            level,
            hinted,
            hintsUsed,
            par: solveLights(initial).length,
          }),
          tap: (x, y) => {
            const index = view.indexAt(x, y);
            if (index !== null) press(index);
          },
          bridge,
        };
      },
      signal,
    );
  },
};
export default lightsOut;
