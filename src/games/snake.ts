import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling } from "../core/laya-bridge";
import { type Mode } from "../core/play";
import {
  mountPocket,
  DIRECTIONS,
  arrowDirection,
  type Point,
} from "../core/phaser/pocket";
import { SnakeView } from "./views/arcade";

const SIZE = 20;
const snake: GameModule = {
  id: "snake",
  name: "Snake",
  icon: "🐍",
  description: "A happy garden, juicy apples and a golden-star surprise.",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "snake",
        title: "Snake",
        subtitle: "Grow a little garden friend.",
        theme: "garden",
      },
      (scene) => {
        const storage = namespace("snake"),
          view = new SnakeView(scene, SIZE);
        let segments: Point[] = [],
          dir: Point = { x: 1, y: 0 },
          queue: Point[] = [];
        let food: Point | null = null,
          bonus: Point | null = null;
        let bonusTime = 0,
          eaten = 0,
          score = 0,
          acc = 0,
          revision = 0;
        let mode: Mode = "ready",
          relaxed = true;
        let best = storage.load("best-relaxed", 0);
        const start = scene.button("Start", toggle, true);
        const difficulty = scene.button("Mode: Relaxed", () => {
          relaxed = !relaxed;
          difficulty.textContent = relaxed ? "Mode: Relaxed" : "Mode: Classic";
          best = storage.load(relaxed ? "best-relaxed" : "best", 0);
          reset();
          draw();
        });
        scene.directions(turn);
        function emptyCell(): Point | null {
          const occupied = new Set(segments.map((p) => `${p.x},${p.y}`));
          if (food) occupied.add(`${food.x},${food.y}`);
          if (bonus) occupied.add(`${bonus.x},${bonus.y}`);
          const cells: Point[] = [];
          for (let y = 0; y < SIZE; y++)
            for (let x = 0; x < SIZE; x++)
              if (!occupied.has(`${x},${y}`)) cells.push({ x, y });
          return cells[Math.floor(Math.random() * cells.length)] ?? null;
        }
        function reset() {
          revision++;
          segments = [
            { x: 8, y: 10 },
            { x: 9, y: 10 },
            { x: 10, y: 10 },
          ];
          dir = { x: 1, y: 0 };
          queue = [];
          score = 0;
          eaten = 0;
          acc = 0;
          food = null;
          bonus = null;
          bonusTime = 0;
          food = emptyCell();
          mode = "ready";
        }
        function toggle() {
          if (mode === "over" || mode === "won") reset();
          mode = mode === "playing" ? "paused" : "playing";
          draw();
        }
        function turn(x: number, y: number) {
          if (mode === "over" || mode === "won" || mode === "paused") return;
          if (mode === "ready") mode = "playing";
          const last = queue.at(-1) ?? dir;
          if (
            (last.x === x && last.y === y) ||
            (last.x === -x && last.y === -y) ||
            queue.length >= 2
          )
            return;
          queue.push({ x, y });
          draw();
        }
        function nextPoint(direction: Point) {
          const head = segments.at(-1)!;
          const p = { x: head.x + direction.x, y: head.y + direction.y };
          if (relaxed) {
            p.x = (p.x + SIZE) % SIZE;
            p.y = (p.y + SIZE) % SIZE;
          }
          return p;
        }
        function grows(p: Point) {
          return (
            (p.x === food?.x && p.y === food?.y) ||
            (p.x === bonus?.x && p.y === bonus?.y)
          );
        }
        function safe(p: Point) {
          return (
            p.x >= 0 &&
            p.y >= 0 &&
            p.x < SIZE &&
            p.y < SIZE &&
            !(grows(p) ? segments : segments.slice(1)).some(
              (b) => b.x === p.x && b.y === p.y,
            )
          );
        }
        function step() {
          revision++;
          dir = queue.shift() ?? dir;
          const p = nextPoint(dir);
          if (!safe(p)) {
            mode = "over";
            scene.cue("hit");
            return;
          }
          const golden = p.x === bonus?.x && p.y === bonus?.y,
            eating = p.x === food?.x && p.y === food?.y;
          segments.push(p);
          if (eating || golden) {
            score += golden ? 30 : 10;
            const at = view.point(p);
            scene.burst(at.x, at.y, golden ? 0xffcf70 : 0xff907d);
            scene.cue("collect");
            if (golden) {
              bonus = null;
              bonusTime = 0;
              scene.toast("+30 STAR!", at.x, at.y);
            }
            if (eating) {
              eaten++;
              food = null;
              food = emptyCell();
              if (eaten % 4 === 0) {
                bonus = emptyCell();
                bonusTime = 8;
              }
            }
            best = Math.max(best, score);
            storage.save(relaxed ? "best-relaxed" : "best", best);
            if (segments.length === SIZE * SIZE) {
              mode = "won";
              scene.celebrate("Garden complete!");
            }
          } else segments.shift();
        }
        function draw() {
          scene.stats({ Apples: eaten, Score: score, Best: best });
          start.textContent =
            mode === "playing"
              ? "Pause"
              : mode === "paused"
                ? "Resume"
                : mode === "over" || mode === "won"
                  ? "Play again"
                  : "Start";
          scene.help(
            bonus
              ? `Golden star! ${Math.ceil(bonusTime)}s · +30 points`
              : relaxed
                ? "Swipe or use arrows. Cross the edges; watch your tail!"
                : "Swipe or use arrows. Keep away from the garden walls.",
          );
          view.render(segments, dir, food, bonus);
          scene.banner(
            mode === "playing"
              ? ""
              : mode === "ready"
                ? "Hello, little gardener!"
                : mode === "paused"
                  ? "Take a little break"
                  : mode === "won"
                    ? "Garden complete!"
                    : `You grew ${eaten} apples!`,
            mode === "ready"
              ? "Press Start or swipe to explore"
              : mode === "paused"
                ? "Press Resume when you are ready"
                : `${score} points · Your best is saved`,
          );
        }
        const available = () =>
          Object.entries(DIRECTIONS).flatMap(([name, direction]) => {
            if (direction.x === -dir.x && direction.y === -dir.y) return [];
            const next = nextPoint(direction);
            return safe(next) ? [{ name, direction, next }] : [];
          });
        const pause = () => {
          if (mode === "playing") mode = "paused";
          draw();
        };
        reset();
        draw();
        return {
          read: () => ({
            game: "snake",
            mode,
            size: SIZE,
            segments,
            food,
            bonus,
            bonusTime,
            score,
            relaxed,
            direction: dir,
          }),
          step: (dt) => {
            if (mode !== "playing") return;
            const before = revision,
              bonusSeconds = Math.ceil(bonusTime);
            const speed = relaxed
              ? 0.24
              : Math.max(0.09, 0.23 - Math.floor(eaten / 5) * 0.02);
            if (isLayaControlling()) dt *= speed / 0.9;
            if (bonus && (bonusTime -= dt) <= 0) bonus = null;
            acc += dt;
            while (acc >= speed && mode === "playing") {
              acc -= speed;
              step();
            }
            if (revision !== before || Math.ceil(bonusTime) !== bonusSeconds)
              draw();
          },
          swipe: (direction) => {
            const p = DIRECTIONS[direction];
            turn(p.x, p.y);
          },
          key: (e) => {
            const direction = arrowDirection(e.key);
            if (direction) {
              const p = DIRECTIONS[direction];
              turn(p.x, p.y);
            }
            if (
              (e.code === "Space" || e.key.toLowerCase() === "p") &&
              !e.repeat
            )
              toggle();
          },
          hidden: pause,
          bridge: {
            game: "snake",
            observe: () => {
              if (mode !== "playing") return null;
              const moves = available();
              if (!moves.length) return null;
              const head = segments.at(-1)!;
              return {
                key: String(revision),
                context: `Snake on ${SIZE} by ${SIZE}. Head (${head.x},${head.y}); fruit ${food ? `(${food.x},${food.y})` : "none"}; star ${bonus ? `(${bonus.x},${bonus.y})` : "none"}. Body length ${segments.length}. ${relaxed ? "Edges wrap." : "Edges are walls."} Only collision-free next moves are offered.`,
                question:
                  "Which direction approaches fruit while avoiding collision?",
                choices: Object.fromEntries(
                  moves.map(({ name, next }) => [
                    name,
                    `Move ${name} to (${next.x},${next.y}); fruit distance ${food ? Math.abs(food.x - next.x) + Math.abs(food.y - next.y) : 0}`,
                  ]),
                ),
              };
            },
            act: (choice, key) => {
              if (mode !== "playing" || key !== String(revision)) return false;
              const move = available().find((m) => m.name === choice);
              if (!move) return false;
              queue = [move.direction];
              return true;
            },
            start: () => {
              if (mode === "over" || mode === "won") reset();
              queue = [];
              mode = "playing";
              draw();
            },
            pause,
            resume: () => {
              if (mode === "paused") mode = "playing";
              draw();
            },
            isFinished: () => mode === "over" || mode === "won",
            isPaused: () => mode === "paused",
            intervalMs: 50,
            assistance:
              "Watch mode moves one cell every 0.9 seconds. Laya chooses a collision-free direction.",
          },
        };
      },
      signal,
    );
  },
};
export default snake;
