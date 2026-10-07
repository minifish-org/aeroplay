import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling } from "../core/laya-bridge";
import { mountPocket } from "../core/phaser/pocket";
import { SudokuView } from "./views/sudoku";
import { createPuzzle } from "./models/sudoku";
import { sudokuLayaMoves } from "./laya-puzzles";

type Saved = {
  puzzleIndex: number;
  starter: boolean;
  puzzle: number[];
  solution: number[];
  board: number[];
  notes: number[][];
  hints: number;
  mistakes: number;
  elapsed: number;
};
const sudoku: GameModule = {
  id: "sudoku",
  name: "Sudoku",
  icon: "🔢",
  description:
    "A friendly number garden, with starter puzzles and pencil notes.",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "sudoku",
        title: "Sudoku",
        subtitle: "A quiet little garden for curious minds.",
        theme: "garden",
      },
      (scene) => {
        const store = namespace("sudoku"),
          view = new SudokuView(scene);
        let puzzleIndex = 0,
          starter = true,
          puzzle: number[] = [],
          solution: number[] = [],
          board: number[] = [],
          givens = new Set<number>();
        let notes: number[][] = [],
          selected: number | null = null,
          noteMode = false,
          hints = 3,
          mistakes = 0,
          elapsed = 0,
          paused = false,
          revision = 0;
        let lastSavedSecond = 0;
        const history: { board: number[]; notes: number[][] }[] = [];
        const keypad = document.createElement("div");
        keypad.className = "pocket-keypad";
        scene.area.insertBefore(keypad, scene.controls);
        for (let n = 1; n <= 9; n++) {
          const b = scene.button(String(n), () => setValue(n));
          keypad.append(b);
        }
        keypad.append(scene.button("Erase", () => setValue(0)));
        const noteButton = scene.button("Notes: Off", () => {
          noteMode = !noteMode;
          render();
        });
        const undoButton = scene.button("Undo", undo);
        const hintButton = scene.button("Hint · 3", hint);
        scene.button(
          "New puzzle",
          () => {
            puzzleIndex++;
            newPuzzle();
          },
          true,
        );
        const difficulty = scene.button("Mode: Starter", () => {
          starter = !starter;
          newPuzzle();
        });
        const pauseButton = scene.button("Pause", () => {
          paused = !paused;
          render();
          persist();
        });
        function solved() {
          return board.every((value, i) => value === solution[i]);
        }
        function persist() {
          store.save<Saved>("state-v3", {
            puzzleIndex,
            starter,
            puzzle,
            solution,
            board,
            notes,
            hints,
            mistakes,
            elapsed,
          });
        }
        function newPuzzle() {
          ({ puzzle, solution } = createPuzzle(puzzleIndex, starter));
          givens = new Set(puzzle.flatMap((v, i) => (v ? [i] : [])));
          board = [...puzzle];
          notes = Array.from({ length: 81 }, () => []);
          selected = null;
          noteMode = false;
          hints = 3;
          mistakes = 0;
          elapsed = 0;
          lastSavedSecond = 0;
          paused = false;
          revision++;
          history.length = 0;
          render();
          persist();
        }
        function render() {
          scene.stats({
            Puzzle: puzzleIndex + 1,
            Filled: `${board.filter(Boolean).length}/81`,
            Time: `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`,
            Hints: hints,
          });
          noteButton.textContent = `Notes: ${noteMode ? "On" : "Off"}`;
          noteButton.setAttribute("aria-pressed", String(noteMode));
          hintButton.textContent = `Hint · ${hints}`;
          hintButton.disabled = !hints || solved();
          undoButton.disabled = !history.length || solved();
          difficulty.textContent = starter ? "Mode: Starter" : "Mode: Classic";
          pauseButton.textContent = paused ? "Resume" : "Pause";
          pauseButton.disabled = solved();
          view.draw(board, givens, selected, notes, solution);
          scene.help(
            solved()
              ? "Beautiful work! Your number garden is complete."
              : noteMode
                ? "Notes mode: pencil small numbers into an empty cell."
                : selected !== null && givens.has(selected)
                  ? "This number is a clue. Choose an empty cell to fill."
                  : "Choose a cell, then a number. Every row, column and box needs 1–9.",
          );
          scene.banner(
            paused ? "A quiet little break" : "",
            "Press Resume when you are ready",
          );
        }
        function remember() {
          history.push({ board: [...board], notes: notes.map((n) => [...n]) });
          if (history.length > 100) history.shift();
        }
        function setValue(value: number, fromLaya = false) {
          if (
            paused ||
            (isLayaControlling() && !fromLaya) ||
            selected === null ||
            givens.has(selected) ||
            solved()
          )
            return;
          if (noteMode && value && !board[selected]) {
            remember();
            notes[selected] = notes[selected].includes(value)
              ? notes[selected].filter((v) => v !== value)
              : [...notes[selected], value];
            revision++;
            render();
            persist();
            return;
          }
          if (board[selected] === value && (value || !notes[selected].length))
            return;
          remember();
          notes[selected] = [];
          board[selected] = value;
          revision++;
          const correct = value === solution[selected];
          if (value && !correct) mistakes++;
          render();
          persist();
          if (correct) {
            const p = view.center(selected);
            scene.burst(p.x, p.y, 0x79d7ac, 6);
            scene.cue("collect");
          } else if (value) {
            scene.cue("hit");
            scene.help(
              "That number needs another look. Try its row, column and box.",
            );
          }
          if (solved()) {
            scene.celebrate("Number garden complete!");
            const best = store.load<number | null>("bestSeconds", null);
            if (best === null || elapsed < best)
              store.save("bestSeconds", Math.floor(elapsed));
          }
        }
        function undo() {
          if (paused || solved()) return;
          const old = history.pop();
          if (!old) return;
          board = old.board;
          notes = old.notes;
          revision++;
          render();
          persist();
        }
        function hint() {
          if (!hints || paused || solved()) return;
          if (
            selected === null ||
            givens.has(selected) ||
            board[selected] === solution[selected]
          )
            selected = board.findIndex((v, i) => v !== solution[i]);
          hints--;
          noteMode = false;
          setValue(solution[selected]);
        }
        const saved = store.load<Saved | null>("state-v3", null);
        if (
          saved &&
          [saved.puzzle, saved.solution, saved.board].every(
            (b) =>
              b?.length === 81 &&
              b.every((v) => Number.isInteger(v) && v >= 0 && v <= 9),
          ) &&
          saved.notes?.length === 81
        ) {
          ({
            puzzleIndex,
            starter,
            puzzle,
            solution,
            board,
            notes,
            hints,
            mistakes,
            elapsed,
          } = saved);
          givens = new Set(puzzle.flatMap((v, i) => (v ? [i] : [])));
          render();
        } else newPuzzle();
        const stateKey = () => `${revision}:${puzzleIndex}:${board.join("")}`;
        let candidateKey = "",
          candidates: ReturnType<typeof sudokuLayaMoves> = [];
        function options() {
          const key = stateKey();
          if (key !== candidateKey) {
            candidateKey = key;
            candidates = sudokuLayaMoves(board, givens).slice(0, 8);
          }
          return candidates;
        }
        const pause = () => {
          paused = true;
          render();
          persist();
        };
        return {
          read: () => ({
            game: "sudoku",
            mode: solved() ? "won" : paused ? "paused" : "playing",
            board,
            givens: [...givens],
            selected,
            notes,
            noteMode,
            hints,
            mistakes,
            puzzleIndex,
            starter,
            elapsed: Math.floor(elapsed),
          }),
          tap: (x, y) => {
            if (paused || solved()) return;
            selected = view.indexAt(x, y);
            render();
          },
          key: (e) => {
            if (paused || solved()) return;
            if (/^[1-9]$/.test(e.key)) setValue(Number(e.key));
            if (e.key === "Backspace" || e.key === "Delete") setValue(0);
            if (e.key.toLowerCase() === "n" && !e.repeat) {
              noteMode = !noteMode;
              render();
            }
            if (e.key.toLowerCase() === "z" && !e.repeat) undo();
            const delta = (
              {
                ArrowLeft: -1,
                ArrowRight: 1,
                ArrowUp: -9,
                ArrowDown: 9,
              } as Record<string, number>
            )[e.key];
            if (delta) {
              selected = Math.max(0, Math.min(80, (selected ?? 0) + delta));
              render();
            }
          },
          step: (dt) => {
            if (paused || document.hidden || solved()) return;
            const second = Math.floor(elapsed);
            elapsed += dt;
            if (Math.floor(elapsed) !== second) render();
            if (elapsed - lastSavedSecond >= 5) {
              persist();
              lastSavedSecond = elapsed;
            }
          },
          hidden: pause,
          dispose: persist,
          bridge: {
            game: "sudoku",
            observe: () => {
              if (paused || solved()) return null;
              const choices = options();
              if (!choices.length) return null;
              return {
                key: stateKey(),
                context: `Sudoku. Rows top to bottom; 0 is empty.\n${Array.from({ length: 9 }, (_, row) => board.slice(row * 9, (row + 1) * 9).join("")).join("\n")}\nConstraint assistance uses only this visible board and its clues; no answer sheet.`,
                question: choices[0].value
                  ? "Which assisted placement should be filled next?"
                  : "Which editable number should be erased to repair the board?",
                choices: Object.fromEntries(
                  choices.map((c, i) => [
                    String(i),
                    `${c.value ? `Fill ${c.value} in` : "Erase"} r${Math.floor(c.index / 9) + 1}c${(c.index % 9) + 1}`,
                  ]),
                ),
              };
            },
            act: (choice, key) => {
              if (paused || solved() || key !== stateKey()) return false;
              const c = options()[Number(choice)];
              if (
                !c ||
                String(Number(choice)) !== choice ||
                givens.has(c.index)
              )
                return false;
              selected = c.index;
              noteMode = false;
              const before = stateKey();
              setValue(c.value, true);
              return before !== stateKey();
            },
            start: () => {
              paused = false;
              if (solved()) {
                puzzleIndex++;
                newPuzzle();
              } else render();
            },
            pause,
            resume: () => {
              paused = false;
              render();
            },
            isFinished: solved,
            isPaused: () => paused,
            intervalMs: 500,
            assistance: "Constraint assistance",
          },
        };
      },
      signal,
    );
  },
};
export default sudoku;
