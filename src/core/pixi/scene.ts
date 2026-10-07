// Pixi's CSP adapter replaces generated functions with static implementations.
import 'pixi.js/unsafe-eval';
import {
  Application,
  Container,
  EventSystem,
  Graphics,
  Particle,
  ParticleContainer,
  RendererType,
  Rectangle,
  Sprite,
  Text,
  Texture,
  Ticker
} from 'pixi.js';
import { extensions } from 'pixi.js';
import { GlowFilter, ShockwaveFilter } from 'pixi-filters';

type Tween = {
  target: Container;
  from: Record<string, number>;
  to: Record<string, number>;
  age: number;
  duration: number;
  done?: () => void;
};
type Spark = {
  particle: Particle;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
};
export const PALETTE = [0xff596a, 0x49d8ff, 0xad83ff, 0x47e0a2, 0xffca54];

// Native controls own all input; skip Pixi's pointer listeners.
extensions.remove(EventSystem);
let sharedCanvas: HTMLCanvasElement | undefined;
let sharedApp: Application | undefined;
let rendererPending: Promise<Application> | undefined;
let owner: PixiScene | undefined;

export function createGameCanvas(width: number, height = width) {
  sharedCanvas ??= document.createElement('canvas');
  for (const attribute of Array.from(sharedCanvas.attributes)) {
    if (attribute.name !== 'width' && attribute.name !== 'height')
      sharedCanvas.removeAttribute(attribute.name);
  }
  if (!sharedApp) {
    sharedCanvas.width = width;
    sharedCanvas.height = height;
  }
  return sharedCanvas;
}

function renderer(canvas: HTMLCanvasElement, width: number, height: number) {
  if (!rendererPending) {
    const app = new Application();
    rendererPending = app
      .init({
        canvas,
        width,
        height,
        preference: 'webgl',
        autoStart: false,
        sharedTicker: false,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        backgroundColor: 0x0b1226,
        preserveDrawingBuffer: import.meta.env.DEV
      })
      .then(() => {
        sharedApp = app;
        Ticker.system.stop();
        return app;
      })
      .catch((error) => {
        rendererPending = undefined;
        throw error;
      });
  }
  return rendererPending;
}

window.addEventListener('pagehide', (event) => {
  Ticker.system.stop();
  if (!event.persisted && sharedApp) {
    sharedApp.destroy({ removeView: false }, { children: true });
    sharedApp = undefined;
    rendererPending = undefined;
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && owner) {
    Ticker.system.start();
    owner.invalidate();
  }
});

/** Owns a scene's resources; the page reuses one renderer to avoid WebKit context exhaustion. */
export class PixiScene {
  private app?: Application;
  private readonly stage = new Container();
  readonly world = new Container();
  readonly effects = new Container();
  readonly hud = new Container();
  readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;
  readonly textures: Texture[] = [];
  ready = false;
  disposed = false;
  time = 0;
  private dirty = true;
  private raf = 0;
  private last = 0;
  private manual = false;
  private shaders = true;
  private seed = 0x6d2b79f5;
  private tweens: Tween[] = [];
  private sparks: Spark[] = [];
  private readonly particles: ParticleContainer;
  private readonly glow = new GlowFilter({
    distance: 9,
    outerStrength: 1.3,
    quality: 0.15,
    color: 0x8ee6ff
  });
  private readonly wave = new ShockwaveFilter({
    amplitude: 8,
    wavelength: 65,
    speed: 350,
    brightness: 1.12,
    radius: 260
  });
  private waveAge = 1;
  private resourcesDestroyed = false;
  private popups: { text: Text; age: number; y: number }[] = [];
  onFrame?: (dt: number) => void;
  afterFrame?: () => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
    private readonly driven = false
  ) {
    canvas.dataset.renderer = 'pixi';
    this.world.filterArea = new Rectangle(0, 0, width, height);
    this.effects.filterArea = new Rectangle(0, 0, width, height);
    this.stage.addChild(this.world, this.effects, this.hud);
    const sparkTexture = this.texture((ctx, size) => {
      const gradient = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.22, '#ffffff');
      gradient.addColorStop(0.5, '#ffffff99');
      gradient.addColorStop(1, '#ffffff00');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }, 32);
    this.particles = new ParticleContainer({
      texture: sparkTexture,
      dynamicProperties: {
        position: true,
        color: true,
        vertex: true,
        rotation: true
      }
    });
    this.effects.addChild(this.particles);
    document.addEventListener('visibilitychange', this.visibility);
    void this.initialize();
  }

  private async initialize() {
    try {
      const app = await renderer(this.canvas, this.width, this.height);
      if (this.disposed) return;
      this.app = app;
      owner = this;
      this.shaders = app.renderer.type !== RendererType.CANVAS;
      if (!this.shaders) this.world.filters = [];
      app.renderer.resize(this.width, this.height);
      app.stage.addChild(this.stage);
      Ticker.system.start();
      this.ready = true;
      this.dirty = true;
      this.canvas.dataset.ready = 'true';
      this.canvas.closest('.pixi-board')?.classList.add('pixi-ready');
      this.tick(0);
      this.wake();
    } catch (error) {
      if (!this.disposed) {
        this.canvas.dataset.error = 'true';
        console.error('Game renderer initialization failed', error);
      }
    }
  }

  texture(
    paint: (ctx: CanvasRenderingContext2D, size: number) => void,
    size = 128
  ) {
    const source = document.createElement('canvas');
    source.width = source.height = size;
    paint(source.getContext('2d')!, size);
    const texture = Texture.from(source);
    this.textures.push(texture);
    return texture;
  }
  random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 0x100000000;
  }
  invalidate() {
    this.dirty = true;
    this.wake();
  }
  cancel(target: Container) {
    this.tweens = this.tweens.filter((item) => item.target !== target);
  }

  tween(
    target: Container,
    to: Record<string, number>,
    duration = 0.2,
    done?: () => void
  ) {
    this.tweens = this.tweens.filter(
      (item) =>
        item.target !== target || !Object.keys(to).some((key) => key in item.to)
    );
    const from: Record<string, number> = {};
    for (const key of Object.keys(to)) from[key] = this.property(target, key);
    if (this.reducedMotion || duration === 0) {
      for (const [key, value] of Object.entries(to))
        this.setProperty(target, key, value);
      done?.();
    } else this.tweens.push({ target, from, to, age: 0, duration, done });
    this.invalidate();
  }
  private property(target: Container, key: string) {
    return key === 'scaleX'
      ? target.scale.x
      : key === 'scaleY'
        ? target.scale.y
        : Number((target as unknown as Record<string, number>)[key]);
  }
  private setProperty(target: Container, key: string, value: number) {
    if (key === 'scaleX') target.scale.x = value;
    else if (key === 'scaleY') target.scale.y = value;
    else (target as unknown as Record<string, number>)[key] = value;
  }

  burst(x: number, y: number, color = 0x69dbff, count = 16) {
    if (this.reducedMotion) return;
    for (let i = 0; i < count && this.sparks.length < 180; i++) {
      const angle = this.random() * Math.PI * 2,
        speed = 35 + this.random() * 110,
        size = 0.13 + this.random() * 0.15;
      const particle = new Particle({
        texture: this.particles.texture!,
        x,
        y,
        tint: color,
        scaleX: size,
        scaleY: size,
        anchorX: 0.5,
        anchorY: 0.5
      });
      this.particles.addParticle(particle);
      this.sparks.push({
        particle,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 0.35 + this.random() * 0.3,
        size
      });
    }
    this.invalidate();
  }
  ripple(x: number, y: number) {
    if (this.reducedMotion || !this.shaders) return;
    this.wave.center = { x, y };
    this.waveAge = this.wave.time = 0;
    this.world.filters = [this.wave];
    this.invalidate();
  }
  popup(label: string, x: number, y: number, color = 0xffffff) {
    const text = new Text({
      text: label,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 22,
        fontWeight: '800',
        fill: color,
        stroke: { color: 0x091126, width: 4 }
      }
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    this.hud.addChild(text);
    this.popups.push({ text, age: 0, y });
    this.invalidate();
  }

  tick(dt: number) {
    if (this.disposed || document.hidden) return;
    this.time += dt;
    this.onFrame?.(dt);
    const active =
      this.tweens.length ||
      this.sparks.length ||
      this.popups.length ||
      this.waveAge < 0.65;
    const pending = this.tweens;
    this.tweens = [];
    for (const item of pending) {
      item.age += dt;
      const t = Math.min(1, item.age / item.duration),
        eased = 1 - (1 - t) ** 3;
      for (const [key, value] of Object.entries(item.to))
        this.setProperty(
          item.target,
          key,
          item.from[key] + (value - item.from[key]) * eased
        );
      if (t === 1) item.done?.();
      else this.tweens.push(item);
    }
    this.sparks = this.sparks.filter((spark) => {
      spark.age += dt;
      spark.particle.x += spark.vx * dt;
      spark.particle.y += spark.vy * dt;
      spark.vy += 110 * dt;
      const fade = Math.max(0, 1 - spark.age / spark.life);
      spark.particle.alpha = fade;
      spark.particle.scaleX = spark.particle.scaleY =
        spark.size * (0.3 + fade * 0.7);
      if (fade === 0) this.particles.removeParticle(spark.particle);
      return fade > 0;
    });
    this.popups = this.popups.filter((popup) => {
      popup.age += dt;
      popup.text.y = popup.y - (this.reducedMotion ? 0 : popup.age * 30);
      popup.text.alpha = Math.min(1, Math.max(0, (0.8 - popup.age) * 4));
      if (popup.age >= 0.8) popup.text.destroy();
      return popup.age < 0.8;
    });
    if (this.waveAge < 0.65) {
      this.wave.time = this.waveAge += dt;
      if (this.waveAge >= 0.65) this.world.filters = [];
    }
    this.effects.filters =
      this.shaders && this.sparks.length ? [this.glow] : [];
    this.afterFrame?.();
    if (this.ready && (this.dirty || (active && dt > 0))) {
      this.app?.render();
      this.dirty = false;
    }
  }
  advance(ms: number) {
    this.manual = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (ms === 0) this.tick(0);
    for (let remaining = ms / 1000; remaining > 0; remaining -= 1 / 60)
      this.tick(Math.min(remaining, 1 / 60));
  }
  private wake() {
    if (
      this.driven ||
      this.manual ||
      !this.ready ||
      this.disposed ||
      this.raf ||
      document.hidden
    )
      return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.raf = 0;
    this.tick(Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    if (
      this.tweens.length ||
      this.sparks.length ||
      this.popups.length ||
      this.waveAge < 0.65
    )
      this.wake();
  };
  private visibility = () => {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!document.hidden) {
      Ticker.system.start();
      this.invalidate();
      this.wake();
    } else if (owner === this) Ticker.system.stop();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.visibility);
    this.tweens = [];
    this.sparks = [];
    this.popups = [];
    this.destroyResources();
    if (owner === this) {
      owner = undefined;
      Ticker.system.stop();
    }
  }
  private destroyResources() {
    if (this.resourcesDestroyed) return;
    this.resourcesDestroyed = true;
    this.stage.removeFromParent();
    this.stage.destroy({ children: true });
    this.app = undefined;
    this.textures.forEach((texture) => texture.destroy(true));
    this.glow.destroy();
    this.wave.destroy();
  }
}

/** The native grid remains the input and accessibility surface above the scene. */
export function gridCanvas(board: HTMLElement, size: number, kind: string) {
  const frame = document.createElement('div');
  frame.className = `pixi-board pixi-${kind}`;
  const canvas = createGameCanvas(size);
  canvas.setAttribute('aria-hidden', 'true');
  board.before(frame);
  frame.append(canvas, board);
  return canvas;
}
export function panel(
  scene: PixiScene,
  columns: number,
  rows = columns,
  inset = 12
) {
  const bg = new Sprite(
    scene.texture((ctx, size) => {
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#20304f');
      gradient.addColorStop(0.5, '#101a32');
      gradient.addColorStop(1, '#0a1022');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      const light = ctx.createRadialGradient(
        size * 0.2,
        0,
        0,
        size * 0.2,
        0,
        size
      );
      light.addColorStop(0, '#5b92cf28');
      light.addColorStop(1, '#5b92cf00');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, size, size);
    })
  );
  bg.width = scene.width;
  bg.height = scene.height;
  scene.world.addChild(bg);
  const grid = new Graphics(),
    w = (scene.width - inset * 2) / columns,
    h = (scene.height - inset * 2) / rows;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      grid
        .roundRect(
          inset + x * w + 2,
          inset + y * h + 2,
          w - 4,
          h - 4,
          Math.min(9, w * 0.15)
        )
        .fill({ color: 0x070e20, alpha: 0.6 })
        .stroke({ color: 0x516785, alpha: 0.22, width: 1 });
    }
  scene.world.addChild(grid);
  return { w, h, inset };
}
