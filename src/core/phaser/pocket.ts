import Phaser from "phaser";
import { createGameShell, createTouchButton, type SwipeDirection } from "../ui";
import { exposeGame } from "../play";
import { load, save } from "../storage";
import {
  isLayaControlling,
  registerLayaGame,
  type LayaGameBridge,
} from "../laya-bridge";
import "../../../styles/pocket.css";

export { Phaser };
export const INK = "#29475b";
export const COLORS = [0xff907d, 0x67c9ec, 0xb49aef, 0x79d7ac, 0xffcf70];
export type Point = { x: number; y: number };
export const DIRECTIONS: Record<SwipeDirection, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
export const arrowDirection = (key: string) =>
  (
    ({
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    }) as const
  )[key as "ArrowUp"];

type Cue = "collect" | "move" | "win" | "hit";
export interface PocketRuntime {
  read: () => object;
  bridge: LayaGameBridge;
  step?: (dt: number) => void;
  key?: (event: KeyboardEvent) => void;
  swipe?: (direction: SwipeDirection, x: number, y: number) => void;
  tap?: (x: number, y: number) => void;
  hidden?: () => void;
  dispose?: () => void;
}
interface PocketOptions {
  id: string;
  title: string;
  subtitle: string;
  width?: number;
  height?: number;
  theme: string;
}

/** One scene owns input, animations and resources for the active 2D game. */
export class PocketScene extends Phaser.Scene {
  readonly controls = document.createElement("div");
  readonly info = document.createElement("div");
  readonly status = document.createElement("div");
  readonly reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  runtime?: PocketRuntime;
  private soundEnabled = load("sound-enabled", false);
  private overlay?: Phaser.GameObjects.Container;
  private toastText?: Phaser.GameObjects.Text;
  private overlayKey = "";
  private statsKey = "";
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private manualTime = 0;
  private manualDelta = 0;
  private manual = false;

  constructor(
    readonly options: PocketOptions,
    readonly area: HTMLElement,
    private readonly setup: (scene: PocketScene) => PocketRuntime,
    private readonly ready: () => void,
    private readonly failed: (error: unknown) => void,
  ) {
    super(`pocket-${options.id}`);
  }

  preload() {
    for (const cue of ["collect", "move", "win", "hit"])
      this.load.audio(cue, `/assets/sounds/${cue}.wav`);
  }

  create() {
    if (this.disposed) return;
    this.makeTextures();
    try {
      this.runtime = this.setup(this);
    } catch (error) {
      this.failed(error);
      return;
    }
    const soundButton = createTouchButton(
      this.soundEnabled ? "Sound: On" : "Sound: Off",
      () => {
        this.soundEnabled = !this.soundEnabled;
        save("sound-enabled", this.soundEnabled);
        soundButton.textContent = this.soundEnabled
          ? "Sound: On"
          : "Sound: Off";
        soundButton.setAttribute("aria-pressed", String(this.soundEnabled));
        this.cue("collect");
      },
    );
    soundButton.classList.add("pocket-sound");
    soundButton.setAttribute("aria-pressed", String(this.soundEnabled));
    this.controls.append(soundButton);
    const canvas = this.game.canvas;
    // Native controls above the canvas can change its position without a resize.
    const refreshBounds = () => this.scale.updateBounds();
    canvas.addEventListener("touchstart", refreshBounds, {
      capture: true,
      passive: true,
    });
    canvas.addEventListener("mousedown", refreshBounds, true);
    canvas.setAttribute(
      "aria-label",
      `${this.options.title} game board. ${this.options.subtitle}`,
    );
    canvas.setAttribute("role", "img");
    const key = (event: KeyboardEvent) => {
      if (
        isLayaControlling() ||
        (event.target instanceof HTMLElement &&
          event.target.closest("dialog,input,textarea,select"))
      )
        return;
      if (event.key.startsWith("Arrow") || event.code === "Space")
        event.preventDefault();
      this.runtime?.key?.(event);
      this.paintFrame();
    };
    const hidden = () => {
      if (document.hidden) this.runtime?.hidden?.();
    };
    const pageHide = () => this.runtime?.hidden?.();
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pageHide);
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (
        isLayaControlling() ||
        this.area.inert ||
        !pointer.downElement ||
        pointer.downElement !== canvas
      )
        return;
      const dx = pointer.x - pointer.downX,
        dy = pointer.y - pointer.downY;
      if (this.runtime?.swipe && Math.max(Math.abs(dx), Math.abs(dy)) >= 18) {
        this.runtime.swipe(
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up",
          pointer.downX,
          pointer.downY,
        );
      } else this.runtime?.tap?.(pointer.x, pointer.y);
      this.paintFrame();
    });
    this.cleanup.push(
      registerLayaGame(this.runtime.bridge),
      exposeGame(
        () => ({ renderer: "phaser", ...this.runtime!.read() }),
        (ms) => this.advance(ms),
      ),
      () => window.removeEventListener("keydown", key),
      () => document.removeEventListener("visibilitychange", hidden),
      () => window.removeEventListener("pagehide", pageHide),
      () => canvas.removeEventListener("touchstart", refreshBounds, true),
      () => canvas.removeEventListener("mousedown", refreshBounds, true),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.disposeRuntime(),
    );
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.disposeRuntime());
    queueMicrotask(() => {
      if (this.disposed) return;
      // The scene becomes renderable after create returns, including with a stopped loop.
      this.game.step(0, 0);
      this.ready();
    });
  }

  update(_time: number, delta: number) {
    this.runtime?.step?.(Math.min(delta / 1000, 0.05));
  }

  advance(ms: number) {
    if (this.disposed || !Number.isFinite(ms) || ms < 0) return;
    this.game.loop.sleep();
    if (!this.manual) {
      this.manual = true;
      // Phaser tweens use wall time by default; inspection must advance them with the same fixed clock.
      this.tweens.getDelta = () => {
        this.tweens.time += this.manualDelta / 1000;
        return this.manualDelta;
      };
    }
    for (let remaining = ms; remaining > 0; remaining -= 1000 / 60) {
      const dt = Math.min(remaining, 1000 / 60);
      this.manualDelta = dt;
      this.manualTime += dt;
      this.game.step(this.manualTime, dt);
    }
    this.manualDelta = 0;
    this.paintFrame();
  }

  paintFrame() {
    if (!this.disposed && this.game.isRunning && this.manual)
      this.game.step(this.manualTime, 0);
  }

  disposeRuntime() {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime?.dispose?.();
    for (const dispose of this.cleanup.splice(0)) dispose();
  }

  button(label: string, action: () => void, primary = false) {
    const button = createTouchButton(label, () => {
      if (isLayaControlling()) return;
      action();
      this.paintFrame();
    });
    if (primary) button.classList.add("pocket-primary");
    this.controls.append(button);
    return button;
  }

  directions(move: (x: number, y: number) => void) {
    const row = document.createElement("div");
    row.className = "pocket-directions";
    for (const [name, label] of [
      ["left", "←"],
      ["up", "↑"],
      ["down", "↓"],
      ["right", "→"],
    ] as const) {
      const button = createTouchButton(label, () => {
        if (isLayaControlling()) return;
        const point = DIRECTIONS[name];
        move(point.x, point.y);
        this.paintFrame();
      });
      button.setAttribute("aria-label", name[0].toUpperCase() + name.slice(1));
      row.append(button);
    }
    this.area.append(row);
  }

  stats(values: Record<string, string | number>) {
    const key = JSON.stringify(values);
    if (key === this.statsKey) return;
    this.statsKey = key;
    this.info.replaceChildren(
      ...Object.entries(values).map(([label, value]) => {
        const item = document.createElement("div");
        const caption = document.createElement("span");
        caption.textContent = label;
        const number = document.createElement("strong");
        number.textContent = String(value);
        item.append(caption, number);
        return item;
      }),
    );
  }

  help(value: string) {
    if (this.status.textContent !== value) this.status.textContent = value;
  }

  text(x: number, y: number, value: string, size = 20, color = INK) {
    return this.add
      .text(x, y, value, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: `${size}px`,
        fontStyle: "bold",
        color,
        resolution: 2,
      })
      .setOrigin(0.5);
  }

  cue(cue: Cue) {
    if (this.soundEnabled && this.cache.audio.exists(cue))
      this.sound.play(cue, { volume: 0.28 });
  }

  burst(x: number, y: number, tint = 0xffcf70, quantity = 14) {
    if (this.reducedMotion) return;
    const emitter = this.add
      .particles(x, y, "spark", {
        speed: { min: 35, max: 130 },
        angle: { min: 0, max: 360 },
        lifespan: 550,
        gravityY: 160,
        scale: { start: 0.8, end: 0 },
        alpha: { start: 1, end: 0 },
        tint,
        emitting: false,
      })
      .setDepth(40);
    emitter.explode(quantity);
    emitter.once(Phaser.GameObjects.Particles.Events.COMPLETE, () =>
      emitter.destroy(),
    );
  }

  toast(value: string, x = this.scale.width / 2, y = 65, color = INK) {
    if (this.toastText) {
      this.tweens.killTweensOf(this.toastText);
      this.toastText.destroy();
    }
    const text = this.text(x, y, value, 23, color).setDepth(45);
    this.toastText = text;
    this.tweens.add({
      targets: text,
      y: y - (this.reducedMotion ? 0 : 28),
      alpha: 0,
      duration: 1100,
      ease: "Sine.easeOut",
      onComplete: () => {
        text.destroy();
        if (this.toastText === text) this.toastText = undefined;
      },
    });
  }

  celebrate(value: string) {
    this.cue("win");
    for (let i = 0; i < 5; i++)
      this.burst(
        (this.scale.width * (i + 1)) / 6,
        this.scale.height / 3,
        COLORS[i],
        22,
      );
    this.toast(value, this.scale.width / 2, this.scale.height / 2);
  }

  banner(title = "", subtitle = "") {
    const key = `${title}:${subtitle}`;
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    this.overlay?.destroy();
    this.overlay = undefined;
    if (!title) return;
    const w = this.scale.width,
      h = this.scale.height;
    const veil = this.add.rectangle(w / 2, h / 2, w, h, 0xeef8f7, 0.6);
    const card = this.add
      .graphics()
      .fillStyle(0xffffff, 0.96)
      .fillRoundedRect(18, h / 2 - 65, w - 36, 130, 24);
    const heading = this.text(w / 2, h / 2 - 17, title, Math.min(24, w / 14));
    const copy = this.text(w / 2, h / 2 + 22, subtitle, 12);
    this.overlay = this.add
      .container(0, 0, [veil, card, heading, copy])
      .setDepth(30);
  }

  private makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillCircle(5, 5, 5).generateTexture("spark", 10, 10);
    g.clear()
      .fillStyle(0xffffff)
      .fillRoundedRect(1, 1, 46, 46, 11)
      .fillStyle(0xffffff, 0.4)
      .fillRoundedRect(5, 4, 38, 9, 4)
      .generateTexture("tile", 48, 48);
    g.destroy();
  }
}

export function mountPocket(
  root: HTMLElement,
  goBack: () => void,
  options: PocketOptions,
  setup: (scene: PocketScene) => PocketRuntime,
  signal?: AbortSignal,
): Promise<() => void> {
  const { area } = createGameShell(root, options.title, goBack);
  const shell = root.querySelector<HTMLElement>(".game-shell")!;
  shell.classList.add("pocket-shell");
  shell.dataset.theme = options.theme;
  const subtitle = document.createElement("p");
  subtitle.className = "pocket-subtitle";
  subtitle.textContent = options.subtitle;
  shell.insertBefore(subtitle, area);
  const parent = document.createElement("div");
  parent.className = `pocket-stage pocket-${options.id}`;
  parent.style.aspectRatio = `${options.width ?? 400} / ${options.height ?? 400}`;
  let game: Phaser.Game;
  let disposed = false;
  let destroyed = false;
  return new Promise((resolve, reject) => {
    const flushDestroy = (instance: Phaser.Game) => {
      // Let boot and the current frame finish before processing deferred destruction.
      queueMicrotask(() => {
        if (!destroyed) instance.step(0, 0);
      });
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      signal?.removeEventListener("abort", aborted);
      scene.disposeRuntime();
      game.destroy(true, false);
      // isBooted precedes system-scene creation; only a started game can be destroyed.
      if (game.isRunning) flushDestroy(game);
    };
    const aborted = () => {
      dispose();
      resolve(() => {});
    };
    const scene = new PocketScene(
      options,
      area,
      setup,
      () => resolve(dispose),
      (error) => {
        dispose();
        reject(error);
      },
    );
    scene.info.className = "pocket-stats";
    scene.controls.className = "control-row pocket-controls";
    scene.status.className = "game-message pocket-help";
    scene.status.setAttribute("role", "status");
    area.append(scene.info, parent, scene.controls, scene.status);
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: options.width ?? 400,
      height: options.height ?? 400,
      backgroundColor: "#eff8f5",
      scene: [scene],
      banner: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false,
        preserveDrawingBuffer: import.meta.env.DEV,
      },
      input: { activePointers: 2, keyboard: false },
      fps: { target: 60 },
      callbacks: {
        postBoot: (instance) => {
          if (disposed) {
            instance.destroy(true, false);
            flushDestroy(instance);
          } else instance.step(0, 0);
        },
      },
    });
    game.events.once(Phaser.Core.Events.DESTROY, () => {
      destroyed = true;
    });
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}
