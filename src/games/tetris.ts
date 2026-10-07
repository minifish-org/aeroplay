import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling, type LayaGameBridge } from "../core/laya-bridge";
import { type Mode } from "../core/play";
import { mountPocket } from "../core/phaser/pocket";
import { TetrisView } from "./views/arcade";
import {
  SHAPES,
  createBoard,
  collides,
  rotatedPiece,
  merge,
  clearLines,
  boardHeights,
  findLandings,
  type Piece,
  type Landing,
} from "./models/tetris";

const tetris: GameModule = {
  id: "tetris",
  name: "Tetris",
  icon: "🧱",
  description: "Build a rainbow. Make room for one more lovely block.",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "tetris",
        title: "Tetris",
        subtitle: "Build a rainbow, one little block at a time.",
        width: 336,
        height: 480,
        theme: "berry",
      },
      (scene) => {
        const storage = namespace("tetris"),
          view = new TetrisView(scene);
        let board = createBoard();
        let bag: number[] = [],
          next: number[] = [];
        let current = 0,
          held: number | null = null,
          heldThisTurn = false;
        let piece: Piece = { matrix: [], x: 3, y: 0 };
        let score = 0,
          lines = 0,
          combo = -1,
          dropTimer = 0,
          lockTimer = 0,
          lockResets = 0;
        let best = storage.load("best", 0),
          mode: Mode = "ready";
        let pieceVersion = 0;
        let landingCache: { key: string; landings: Landing[] } | null = null;

        function toggle() {
          if (mode === "over") reset();
          mode = mode === "playing" ? "paused" : "playing";
          draw();
        }
        const start = scene.button("Start", toggle, true);
        scene.button("◀", () => move(-1));
        scene.button("⟳", rotate);
        scene.button("▶", () => move(1));
        scene.button("Drop", drop);
        scene.button("Hold", hold);
        function take() {
          if (!bag.length) {
            bag = [0, 1, 2, 3, 4, 5, 6];
            for (let i = bag.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [bag[i], bag[j]] = [bag[j], bag[i]];
            }
          }
          return bag.pop()!;
        }
        function spawn(id: number) {
          pieceVersion++;
          current = id;
          piece = { matrix: SHAPES[id].map((r) => [...r]), x: 3, y: 0 };
          lockTimer = 0;
          dropTimer = 0;
          lockResets = 0;
          if (collides(board, piece)) mode = "over";
        }
        function nextPiece() {
          const id = next.shift()!;
          next.push(take());
          spawn(id);
        }
        function reset() {
          board = createBoard();
          bag = [];
          next = [take(), take(), take()];
          held = null;
          heldThisTurn = false;
          score = 0;
          lines = 0;
          combo = -1;
          mode = "ready";
          nextPiece();
          scene.help(
            "Arrows move and rotate · Space drops · C holds · P pauses",
          );
        }
        function lock() {
          merge(board, piece);
          const cleared = clearLines(board);
          combo = cleared ? combo + 1 : -1;
          if (cleared) {
            view.clearFeedback(cleared);
            scene.cue("collect");
            score +=
              ([0, 100, 300, 500, 800][cleared] + Math.max(0, combo) * 50) *
              (1 + Math.floor(lines / 10));
            lines += cleared;
            scene.help(
              `${["", "Single", "Double!", "Triple!", "TETRIS!"][cleared]}${combo > 0 ? ` · Combo ×${combo + 1}` : ""}`,
            );
          }
          best = Math.max(best, score);
          storage.save("best", best);
          heldThisTurn = false;
          nextPiece();
        }
        function shiftLock(grounded: boolean) {
          if (grounded && lockResets < 15) {
            lockTimer = 0;
            lockResets++;
          }
        }
        function move(dx: number) {
          if (mode !== "playing") return;
          const grounded = collides(board, { ...piece, y: piece.y + 1 });
          if (!collides(board, { ...piece, x: piece.x + dx })) {
            piece.x += dx;
            shiftLock(grounded);
          }
          draw();
        }
        function rotate() {
          if (mode !== "playing") return;
          const grounded = collides(board, { ...piece, y: piece.y + 1 });
          const candidate = rotatedPiece(board, piece);
          if (candidate) {
            piece = candidate;
            shiftLock(grounded);
          }
          draw();
        }
        function hold() {
          if (mode !== "playing" || heldThisTurn) return;
          const old = held;
          held = current;
          if (old === null) nextPiece();
          else spawn(old);
          heldThisTurn = true;
          draw();
        }
        function drop() {
          if (mode !== "playing") return;
          while (!collides(board, { ...piece, y: piece.y + 1 })) {
            piece.y++;
            score += 2;
          }
          lock();
          draw();
        }

        function draw() {
          scene.stats({
            Score: score,
            Best: best,
            Lines: lines,
            Level: 1 + Math.floor(lines / 10),
          });
          start.textContent =
            mode === "playing"
              ? "Pause"
              : mode === "paused"
                ? "Resume"
                : mode === "over"
                  ? "Play again"
                  : "Start";
          view.render(board, piece, held, next);
          scene.banner(
            mode === "playing"
              ? ""
              : mode === "ready"
                ? "Build a little rainbow!"
                : mode === "paused"
                  ? "A little break"
                  : `${score} points!`,
            mode === "ready"
              ? "Start · the ghost shows your landing"
              : mode === "paused"
                ? "Press Resume"
                : "Your best is saved. Try another stack!",
          );
        }
        function step(dt: number) {
          if (mode !== "playing") return;
          const version = pieceVersion,
            row = piece.y;
          if (isLayaControlling()) dt *= 0.18;
          dropTimer += dt;
          const speed = Math.max(
            0.09,
            0.9 * Math.pow(0.8, Math.floor(lines / 10)),
          );
          if (dropTimer >= speed) {
            dropTimer = 0;
            if (!collides(board, { ...piece, y: piece.y + 1 })) piece.y++;
          }
          if (collides(board, { ...piece, y: piece.y + 1 })) {
            lockTimer += dt;
            if (lockTimer >= 0.45) lock();
          } else lockTimer = 0;
          if (pieceVersion !== version || piece.y !== row) draw();
        }
        const placementKey = () =>
          `${pieceVersion}:${piece.x}:${piece.y}:${piece.matrix.flat().join("")}`;
        function placements() {
          const key = placementKey();
          if (landingCache?.key !== key)
            landingCache = { key, landings: findLandings(board, piece) };
          return landingCache.landings;
        }
        const bridge: LayaGameBridge = {
          game: "tetris",
          observe: () => {
            if (mode !== "playing") return null;
            const landings = placements();
            if (!landings.length) return null;
            const shapeNames = ["I", "J", "L", "O", "S", "T", "Z"];
            const heights = boardHeights(board);
            return {
              key: placementKey(),
              context: `Tetris: board width 10, height 20. Current piece ${shapeNames[current]}; next ${next.map((id) => shapeNames[id]).join(",")}. Column heights left to right: ${heights.join(",")}. Reachable placements are shortlisted using visible board outcomes. A hole is an empty cell below a block. Roughness is the sum of adjacent height differences.`,
              question:
                "Which landing clears lines while keeping holes, height and roughness low?",
              choices: Object.fromEntries(
                landings.map((landing, index) => [
                  String(index),
                  `rotation ${landing.rotation * 90}, x ${landing.piece.x}: lines ${landing.lines}, holes ${landing.holes}, height ${landing.height}, roughness ${landing.roughness}`,
                ]),
              ),
            };
          },
          act: (choice, key) => {
            if (
              mode !== "playing" ||
              key !== placementKey() ||
              !/^\d+$/.test(choice)
            )
              return false;
            const landing = placements()[Number(choice)];
            if (!landing) return false;
            for (const action of landing.path) {
              if (action === "rotate") rotate();
              else move(action === "left" ? -1 : 1);
            }
            if (
              piece.x !== landing.piece.x ||
              piece.matrix.flat().join("") !==
                landing.piece.matrix.flat().join("")
            )
              return false;
            let y = piece.y;
            while (!collides(board, { ...piece, y: y + 1 })) y++;
            if (y !== landing.piece.y) return false;
            drop();
            return true;
          },
          start: () => {
            if (mode === "over") reset();
            mode = "playing";
            draw();
          },
          pause: () => {
            if (mode === "playing") mode = "paused";
            draw();
          },
          resume: () => {
            if (mode === "paused") mode = "playing";
            draw();
          },
          isFinished: () => mode === "over",
          isPaused: () => mode === "paused",
          intervalMs: 500,
          assistance:
            "Reachable landings are calculated and shortlisted by board features. Laya chooses the placement. Watch gravity runs at 18% speed.",
        };

        reset();
        draw();
        return {
          read: () => ({
            game: "tetris",
            mode,
            board,
            piece,
            current,
            next,
            held,
            heldThisTurn,
            score,
            lines,
          }),
          step,
          bridge,
          hidden: bridge.pause,
          key: (e) => {
            if (e.key === "ArrowLeft") move(-1);
            if (e.key === "ArrowRight") move(1);
            if (e.key === "ArrowUp" && !e.repeat) rotate();
            if (
              e.key === "ArrowDown" &&
              mode === "playing" &&
              !collides(board, { ...piece, y: piece.y + 1 })
            ) {
              piece.y++;
              score++;
              draw();
            }
            if (e.code === "Space" && !e.repeat) {
              if (mode === "ready" || mode === "over") toggle();
              else if (mode === "playing") drop();
            }
            if (e.key.toLowerCase() === "c" && !e.repeat) hold();
            if (e.key.toLowerCase() === "p" && !e.repeat) toggle();
          },
        };
      },
      signal,
    );
  },
};
export default tetris;
