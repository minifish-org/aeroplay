import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling, type LayaGameBridge } from "../core/laya-bridge";
import {
  mountPocket,
  DIRECTIONS,
  arrowDirection,
  type Point,
} from "../core/phaser/pocket";
import { MazeView } from "./views/arcade";
import { generateMaze, mazeLayaTargets, type Cell } from "./models/maze";

const maze: GameModule = {
  id: "maze",
  name: "Maze Escape",
  icon: "🧭",
  description: "Collect three stars and lead a little explorer home.",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "maze",
        title: "Maze Escape",
        subtitle: "A tiny explorer. A winding way home.",
        theme: "garden",
      },
      (scene) => {
        const storage = namespace("maze"),
          view = new MazeView(scene);
        let level = Math.max(1, storage.load("level", 1));
        let size = 8,
          grid: Cell[][] = [],
          player = { x: 0, y: 0 };
        let stars: Point[] = [],
          collected = 0,
          steps = 0,
          elapsed = 0,
          finished = false,
          hints = 3;
        let paused = false,
          revision = 0,
          routeTimer = 0;
        let planned: Point[] = [];
        let trail = new Set<string>(),
          path: Point[] = [],
          showTrail = true;

        const hint = scene.button("Hint · 3", () => {
          if (!hints || finished || paused) return;
          hints--;
          path = route(player, { x: size - 1, y: size - 1 }).slice(1, 6);
          scene.help("Follow the blue dots toward home.");
          draw();
        });
        const trailButton = scene.button("Trail: On", () => {
          showTrail = !showTrail;
          trailButton.textContent = `Trail: ${showTrail ? "On" : "Off"}`;
          draw();
        });
        const next = scene.button(
          "New maze",
          () => {
            if (finished) {
              level++;
              storage.save("level", level);
            }
            reset();
          },
          true,
        );
        scene.directions(move);
        function neighbors(p: Point) {
          const w = grid[p.y][p.x].walls;
          return [
            { x: p.x, y: p.y - 1, wall: w.top },
            { x: p.x + 1, y: p.y, wall: w.right },
            { x: p.x, y: p.y + 1, wall: w.bottom },
            { x: p.x - 1, y: p.y, wall: w.left },
          ].filter((n) => !n.wall);
        }
        function route(from: Point, to: Point): Point[] {
          const queue: Point[][] = [[from]],
            seen = new Set([`${from.x},${from.y}`]);
          for (let i = 0; i < queue.length; i++) {
            const way = queue[i],
              p = way.at(-1)!;
            if (p.x === to.x && p.y === to.y) return way;
            for (const n of neighbors(p)) {
              const key = `${n.x},${n.y}`;
              if (!seen.has(key)) {
                seen.add(key);
                queue.push([...way, { x: n.x, y: n.y }]);
              }
            }
          }
          return [];
        }
        function reset() {
          revision++;
          planned = [];
          size = Math.min(16, 8 + Math.floor((level - 1) / 2) * 2);
          grid = generateMaze(size);
          player = { x: 0, y: 0 };
          collected = 0;
          steps = 0;
          elapsed = 0;
          finished = false;
          hints = 3;
          path = [];
          trail = new Set(["0,0"]);
          const candidates: Point[] = [];
          for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++)
              if (x + y > 2 && (x !== size - 1 || y !== size - 1))
                candidates.push({ x, y });
          stars = [];
          for (let i = 0; i < 3; i++)
            stars.push(
              candidates.splice(
                Math.floor(Math.random() * candidates.length),
                1,
              )[0],
            );
          scene.help("Find the green exit. Take a detour for the three stars.");
          view.reset(size, grid);
          draw(false);
        }

        function draw(animate = true) {
          scene.stats({
            Expedition: level,
            Stars: `${collected}/3`,
            Steps: steps,
            Time: `${Math.floor(elapsed)}s`,
          });
          hint.textContent = `Hint · ${hints}`;
          hint.disabled = !hints || finished;
          next.textContent = finished ? "Next expedition →" : "New maze";
          view.render(
            player,
            stars,
            showTrail ? trail : new Set(),
            path,
            animate,
          );
          scene.banner(
            paused ? "Explorer break!" : "",
            "Resume when you are ready",
          );
        }
        function move(dx: number, dy: number, fromLaya = false) {
          if (paused || (isLayaControlling() && !fromLaya) || finished) return;
          const n = neighbors(player).find(
            (p) => p.x === player.x + dx && p.y === player.y + dy,
          );
          if (!n) return;
          player = { x: n.x, y: n.y };
          steps++;
          trail.add(`${player.x},${player.y}`);
          const i = stars.findIndex(
            (p) => p.x === player.x && p.y === player.y,
          );
          if (i >= 0) {
            stars.splice(i, 1);
            collected++;
            const at = view.center(player);
            scene.burst(at.x, at.y);
            scene.cue("collect");
            scene.help(`Star found! ${collected}/3 collected.`);
          }
          if (player.x === size - 1 && player.y === size - 1) {
            finished = true;
            scene.celebrate("Home sweet home!");
            scene.help(
              `Escaped! ${"★".repeat(collected)}${"☆".repeat(3 - collected)} · ${elapsed.toFixed(1)}s · Ready for a bigger adventure?`,
            );
            storage.save(
              "completed",
              Math.max(level, storage.load("completed", 0)),
            );
          }
          draw();
        }
        const stateKey = () =>
          `${revision}:${steps}:${player.x},${player.y}:${stars.map((p) => `${p.x},${p.y}`).join(";")}`;
        const targets = () =>
          mazeLayaTargets(stars, { x: size - 1, y: size - 1 }, (target) =>
            route(player, target).slice(1),
          );
        const bridge: LayaGameBridge = {
          game: "maze",
          observe: () => {
            if (paused || finished || planned.length) return null;
            const candidates = targets();
            if (!candidates.length) return null;
            return {
              key: stateKey(),
              context: `Maze ${size} by ${size}. Player row ${player.y + 1}, column ${player.x + 1}. Stars collected ${collected}/3. Routes use the visible maze walls. The exit ends the round, so stars beyond it are unavailable.\n${candidates.map((c, i) => `Option ${i}: ${c.kind} at row ${c.target.y + 1}, column ${c.target.x + 1}, route length ${c.way.length}.`).join("\n")}`,
              question:
                candidates[0].kind === "star"
                  ? "Which remaining star has the shortest route?"
                  : "Which route reaches the exit?",
              choices: Object.fromEntries(
                candidates.map((c, i) => [
                  String(i),
                  `${c.kind === "star" ? "Star" : "Exit"} at row ${c.target.y + 1}, column ${c.target.x + 1}`,
                ]),
              ),
            };
          },
          act: (choice, key) => {
            if (paused || finished || planned.length || key !== stateKey())
              return false;
            const candidate = targets()[Number(choice)];
            if (!candidate || String(Number(choice)) !== choice) return false;
            planned = candidate.way;
            routeTimer = 0;
            return true;
          },
          start: () => {
            paused = false;
            if (finished) reset();
          },
          pause: () => {
            paused = true;
            planned = [];
            draw();
          },
          resume: () => {
            paused = false;
            draw();
          },
          isFinished: () => finished,
          isPaused: () => paused,
          intervalMs: 300,
          assistance: "Move planning",
        };

        reset();
        return {
          read: () => ({
            game: "maze",
            mode: finished ? "won" : paused ? "paused" : "playing",
            size,
            player,
            stars,
            collected,
            grid: grid.map((r) => r.map((c) => c.walls)),
            hints,
            path,
            planned,
            steps,
            elapsed,
            level,
          }),
          bridge,
          step: (dt) => {
            if (paused || document.hidden) return;
            if (planned.length && !isLayaControlling()) planned = [];
            if (planned.length && !finished && (routeTimer -= dt) <= 0) {
              const next = planned.shift()!,
                before = steps;
              move(next.x - player.x, next.y - player.y, true);
              if (before === steps) planned = [];
              routeTimer = 0.15;
            }
            if (steps && !finished) {
              elapsed += dt;
              scene.stats({
                Expedition: level,
                Stars: `${collected}/3`,
                Steps: steps,
                Time: `${Math.floor(elapsed)}s`,
              });
            }
          },
          swipe: (dir) => {
            const p = DIRECTIONS[dir];
            move(p.x, p.y);
          },
          key: (e) => {
            const dir = arrowDirection(e.key);
            if (dir) {
              const p = DIRECTIONS[dir];
              move(p.x, p.y);
            }
          },
        };
      },
      signal,
    );
  },
};
export default maze;
