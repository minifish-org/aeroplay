import { type GameModule } from "./gameTypes";
import { namespace } from "../core/storage";
import { isLayaControlling } from "../core/laya-bridge";
import { type Mode } from "../core/play";
import { mountPocket } from "../core/phaser/pocket";
import { FlightView } from "./views/arcade";

type Pipe = { x: number; gapY: number; gap: number; scored: boolean };
const W = 360,
  H = 480,
  X = 82,
  R = 12,
  PIPE_W = 54;
const flappy: GameModule = {
  id: "flappy",
  name: "Flappy Bird",
  icon: "🐤",
  description: "Small wings, sunny skies. Fly through the golden rings!",
  mount(root, back, signal) {
    return mountPocket(
      root,
      back,
      {
        id: "flappy",
        title: "Flappy Bird",
        subtitle: "Small wings. A big, sunny adventure.",
        width: W,
        height: H,
        theme: "sky",
      },
      (scene) => {
        const store = namespace("flappy"),
          view = new FlightView(scene);
        let y = H / 2,
          velocity = 0,
          score = 0,
          passed = 0,
          distance = 0,
          time = 0,
          revision = 0;
        let pipes: Pipe[] = [],
          mode: Mode = "ready",
          gentle = true;
        let best = store.load("best", 0);
        const flapButton = scene.button("Take flight", flap, true);
        const pauseButton = scene.button("Pause", () => {
          if (mode === "playing") pause();
          else if (mode === "paused") {
            mode = "playing";
            draw();
          }
        });
        const difficulty = scene.button("Mode: Gentle", () => {
          gentle = !gentle;
          difficulty.textContent = gentle ? "Mode: Gentle" : "Mode: Classic";
          reset();
          draw();
        });
        const gravity = () => (gentle ? 540 : 650);
        const impulse = () => (gentle ? 220 : 235);
        function reset() {
          revision++;
          y = H / 2;
          velocity = 0;
          score = 0;
          passed = 0;
          distance = 0;
          time = 0;
          pipes = [];
          mode = "ready";
        }
        function spawn() {
          const gap = Math.max(
            gentle ? 166 : 142,
            (gentle ? 220 : 200) - passed * 3,
          );
          const previous = pipes.at(-1)?.gapY ?? (H - gap) / 2;
          const gapY = Math.max(
            40,
            Math.min(H - 28 - gap - 40, previous + (Math.random() - 0.5) * 110),
          );
          pipes.push({ x: W + 28, gapY, gap, scored: false });
        }
        function flap() {
          if (mode === "paused") return;
          if (mode === "over") {
            reset();
            draw();
            return;
          }
          if (mode === "ready") {
            mode = "playing";
            spawn();
          }
          velocity = -impulse();
          scene.cue("move");
          draw();
        }
        function pause() {
          if (mode === "playing") mode = "paused";
          draw();
        }
        function draw() {
          scene.stats({ Score: score, Best: best, Gates: passed });
          flapButton.textContent =
            mode === "ready"
              ? "Take flight"
              : mode === "over"
                ? "Try again"
                : "Flap";
          flapButton.disabled = mode === "paused";
          pauseButton.disabled = mode !== "playing" && mode !== "paused";
          pauseButton.textContent = mode === "paused" ? "Resume" : "Pause";
          scene.help("Tap the sky or press Space. Aim for the golden center!");
          view.render(y, velocity, distance, pipes, mode === "playing");
          scene.banner(
            mode === "playing"
              ? ""
              : mode === "ready"
                ? "Ready, little aviator?"
                : mode === "paused"
                  ? "Cloud break!"
                  : `${passed >= 20 ? "Gold medal!" : passed >= 10 ? "Silver medal!" : passed >= 5 ? "Bronze medal!" : "Keep those wings going!"}`,
            mode === "over"
              ? `${score} points · Tap to get ready again`
              : mode === "paused"
                ? "Press Resume to continue"
                : "Tap the sky to take flight",
          );
        }
        function step(dt: number) {
          if (mode !== "playing") return;
          if (isLayaControlling()) dt *= 0.18;
          time += dt;
          const speed = Math.min(170, (gentle ? 90 : 110) + passed * 2);
          distance += speed * dt;
          velocity += gravity() * dt;
          y += velocity * dt;
          pipes.forEach((p) => (p.x -= speed * dt));
          if (!pipes.length || pipes.at(-1)!.x < W - 190) spawn();
          let crashed = y - R < 0 || y + R > H - 28;
          for (const p of pipes) {
            if (
              X + R > p.x - 4 &&
              X - R < p.x + PIPE_W + 4 &&
              (y - R < p.gapY || y + R > p.gapY + p.gap)
            )
              crashed = true;
            if (!p.scored && p.x + PIPE_W + 4 < X - R && !crashed) {
              p.scored = true;
              passed++;
              const perfect = Math.abs(y - (p.gapY + p.gap / 2)) < 24;
              score += perfect ? 2 : 1;
              best = Math.max(best, score);
              store.save("best", best);
              scene.burst(X, y, perfect ? 0xffcf70 : 0xffffff);
              scene.cue("collect");
              scene.toast(perfect ? "Perfect! +2" : "Lovely! +1", 180, 65);
            }
          }
          pipes = pipes.filter((p) => p.x > -PIPE_W - 10);
          if (crashed) {
            mode = "over";
            scene.cue("hit");
          }
          draw();
        }
        const decisionKey = () => `${revision}:${Math.floor(time / 0.12)}`;
        draw();
        return {
          read: () => ({
            game: "flappy",
            mode,
            bird: { x: X, y, radius: R, velocity },
            pipes,
            score,
            passed,
            gentle,
          }),
          step,
          tap: flap,
          key: (e) => {
            if (e.code === "Space" && !e.repeat) flap();
            if (e.key.toLowerCase() === "p" && !e.repeat) pauseButton.click();
          },
          hidden: pause,
          bridge: {
            game: "flappy",
            observe: () => {
              if (mode !== "playing") return null;
              const pipe = pipes.find((p) => p.x + PIPE_W + 4 >= X - R),
                target = pipe ? pipe.gapY + pipe.gap / 2 : H / 2;
              return {
                key: decisionKey(),
                context: `Bird y=${Math.round(y)}, velocity=${Math.round(velocity)} (positive falls). Ceiling 12; ground 440; target y=${Math.round(target)}. ${pipe ? `Gap top ${Math.round(pipe.gapY + R)}, bottom ${Math.round(pipe.gapY + pipe.gap - R)}, distance ${Math.round(pipe.x - X)}.` : ""} In .12s: wait y=${Math.round(y + velocity * 0.12 + (gravity() / 2) * 0.12 ** 2)}, flap y=${Math.round(y - impulse() * 0.12 + (gravity() / 2) * 0.12 ** 2)}. Smaller y is higher.`,
                question:
                  "Should the bird flap or wait to stay near the gap center?",
                choices: {
                  "0": "Flap upward now",
                  "1": "Wait and keep flying",
                },
              };
            },
            act: (choice, key) => {
              if (mode !== "playing" || key !== decisionKey()) return false;
              if (choice === "0") flap();
              else if (choice !== "1") return false;
              return true;
            },
            start: () => {
              if (mode === "over") reset();
              if (mode === "paused") mode = "playing";
              else if (mode === "ready") flap();
              draw();
            },
            pause,
            resume: () => {
              if (mode === "paused") mode = "playing";
              draw();
            },
            isFinished: () => mode === "over",
            isPaused: () => mode === "paused",
            intervalMs: 40,
            assistance:
              "Watch mode flies at 18% speed. Laya chooses flap or wait.",
          },
        };
      },
      signal,
    );
  },
};
export default flappy;
