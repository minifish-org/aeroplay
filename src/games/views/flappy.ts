import { Container, Graphics, Sprite } from 'pixi.js';
import { GameOverlay } from '../../core/pixi/overlay';
import { PixiScene } from '../../core/pixi/scene';
type Pipe = { x: number; gapY: number; gap: number; scored: boolean };

export class FlappyView {
  readonly scene: PixiScene;
  private readonly bird = new Container();
  private readonly wing: Graphics;
  private readonly mountains = new Container();
  private readonly skyline = new Container();
  private readonly clouds: Sprite[] = [];
  private readonly gates: {
    root: Container;
    top: Sprite;
    bottom: Sprite;
    trim: Graphics;
  }[] = [];
  private readonly pipeTexture;
  private readonly overlay: GameOverlay;
  private score = 0;
  private mode = 'ready';
  private trailTime = 0;
  constructor(canvas: HTMLCanvasElement) {
    this.scene = new PixiScene(canvas, 360, 480, true);
    const sky = new Sprite(
      this.scene.texture((ctx, size) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0, '#192544');
        gradient.addColorStop(0.48, '#67486b');
        gradient.addColorStop(0.78, '#df8a84');
        gradient.addColorStop(1, '#ffd7a1');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
      })
    );
    sky.width = 360;
    sky.height = 480;
    this.scene.world.addChild(sky);
    const sun = new Sprite(
      this.scene.texture((ctx, size) => {
        const glow = ctx.createRadialGradient(64, 64, 17, 64, 64, 64);
        glow.addColorStop(0, '#fff0b8');
        glow.addColorStop(0.33, '#ffe9bddd');
        glow.addColorStop(0.37, '#f6a89a55');
        glow.addColorStop(1, '#f6a89a00');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, size, size);
      })
    );
    sun.width = sun.height = 180;
    sun.position.set(154, 156);
    this.scene.world.addChild(sun);
    const stars = new Graphics();
    for (let i = 0; i < 45; i++)
      stars
        .circle(
          this.scene.random() * 360,
          this.scene.random() * 175,
          0.5 + this.scene.random()
        )
        .fill({ color: 0xf5deed, alpha: 0.2 + this.scene.random() * 0.5 });
    this.scene.world.addChild(stars);
    for (let repeat = 0; repeat < 2; repeat++) {
      const hills = new Graphics()
        .poly([
          repeat * 420,
          375,
          repeat * 420 + 60,
          312,
          repeat * 420 + 100,
          343,
          repeat * 420 + 158,
          279,
          repeat * 420 + 238,
          342,
          repeat * 420 + 300,
          301,
          repeat * 420 + 420,
          361,
          repeat * 420 + 420,
          480,
          repeat * 420,
          480
        ])
        .fill(0x584467);
      this.mountains.addChild(hills);
      const buildings = new Graphics();
      for (let i = 0; i < 20; i++) {
        const height = 30 + this.scene.random() * 60,
          x = repeat * 420 + i * 21;
        buildings.rect(x, 440 - height, 17, height).fill(0x27334f);
        for (let y = 448 - height; y < 433; y += 13)
          buildings
            .rect(x + 4, y, 2, 3)
            .rect(x + 11, y, 2, 3)
            .fill({ color: 0xffd19a, alpha: 0.55 });
      }
      this.skyline.addChild(buildings);
    }
    this.scene.world.addChild(this.mountains, this.skyline);
    const cloudTexture = this.scene.texture((ctx) => {
      const gradient = ctx.createLinearGradient(0, 25, 0, 80);
      gradient.addColorStop(0, '#fce0ef66');
      gradient.addColorStop(1, '#ceabd800');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(64, 60, 57, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    for (let i = 0; i < 5; i++) {
      const cloud = new Sprite(cloudTexture);
      cloud.width = 110;
      cloud.height = 80;
      cloud.y = 55 + (i % 3) * 65;
      this.clouds.push(cloud);
      this.scene.world.addChild(cloud);
    }
    this.pipeTexture = this.scene.texture((ctx, size) => {
      const gradient = ctx.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, '#142c45');
      gradient.addColorStop(0.13, '#5cbdbd');
      gradient.addColorStop(0.23, '#a2eadb');
      gradient.addColorStop(0.38, '#3e8794');
      gradient.addColorStop(0.86, '#1c475f');
      gradient.addColorStop(1, '#0f243b');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#ffffff0a';
      for (let y = 0; y < size; y += 16) ctx.fillRect(0, y, size, 2);
    });
    const ground = new Graphics()
      .rect(0, 452, 360, 28)
      .fill(0x0d1b32)
      .rect(0, 452, 360, 2)
      .fill(0x8ae3dc);
    this.scene.world.addChild(ground);
    const body = new Sprite(
      this.scene.texture((ctx) => {
        ctx.save();
        ctx.translate(64, 64);
        ctx.scale(3, 3);
        const gradient = ctx.createLinearGradient(-10, -10, 8, 10);
        gradient.addColorStop(0, '#fff5c5');
        gradient.addColorStop(0.5, '#ffc85b');
        gradient.addColorStop(1, '#cc7038');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 9, -0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#efaf55';
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-19, -5);
        ctx.lineTo(-15, 7);
        ctx.lineTo(-7, 5);
        ctx.fill();
        ctx.fillStyle = '#f2f5ed';
        ctx.beginPath();
        ctx.ellipse(5, -1, 6, 5, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c2944';
        ctx.beginPath();
        ctx.arc(7, -3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef9461';
        ctx.beginPath();
        ctx.moveTo(11, -1);
        ctx.lineTo(19, 2);
        ctx.lineTo(11, 4);
        ctx.fill();
        ctx.restore();
      })
    );
    body.anchor.set(0.5);
    body.width = body.height = 40;
    this.bird.addChild(body);
    this.wing = new Graphics()
      .poly([-9, 0, -4, -11, 3, 2, -4, 6])
      .fill(0xffdb7c)
      .stroke({ color: 0xffefba, width: 0.7 });
    this.bird.addChild(this.wing);
    this.bird.x = 82;
    this.scene.world.addChild(this.bird);
    this.overlay = new GameOverlay(this.scene);
    this.scene.onFrame = (dt) => {
      if (this.mode !== 'playing' || this.scene.reducedMotion) return;
      this.wing.scale.y = 0.55 + Math.sin(this.scene.time * 22) * 0.45;
      this.trailTime += dt;
      if (this.trailTime > 0.07) {
        this.trailTime = 0;
        this.scene.burst(68, this.bird.y + 3, 0xffe2a1, 1);
      }
      this.scene.invalidate();
    };
  }
  draw(
    y: number,
    velocity: number,
    pipes: Pipe[],
    distance: number,
    mode: string,
    score: number,
    perfect: boolean
  ) {
    const previousMode = this.mode;
    this.mode = mode;
    this.bird.y = y;
    this.bird.rotation = Math.max(-0.4, Math.min(0.8, velocity / 500));
    this.mountains.x = -((distance * 0.1) % 420);
    this.skyline.x = -((distance * 0.26) % 420);
    this.clouds.forEach((cloud, i) => {
      cloud.x = ((((i * 115 - distance * 0.08) % 575) + 575) % 575) - 110;
    });
    pipes.forEach((pipe, i) => {
      let gate = this.gates[i];
      if (!gate) {
        gate = {
          root: new Container(),
          top: new Sprite(this.pipeTexture),
          bottom: new Sprite(this.pipeTexture),
          trim: new Graphics()
        };
        gate.root.addChild(gate.top, gate.bottom, gate.trim);
        this.scene.world.addChildAt(
          gate.root,
          this.scene.world.children.length - 1
        );
        this.gates.push(gate);
      }
      gate.root.visible = true;
      gate.root.x = pipe.x;
      gate.top.width = gate.bottom.width = 54;
      gate.top.height = pipe.gapY;
      gate.bottom.y = pipe.gapY + pipe.gap;
      gate.bottom.height = 480 - gate.bottom.y;
      gate.trim.clear();
      for (const edge of [pipe.gapY - 16, pipe.gapY + pipe.gap]) {
        gate.trim
          .roundRect(-4, edge, 62, 16, 3)
          .fill(0x1a485e)
          .stroke({ color: 0x8de2d5, width: 1 });
        gate.trim.rect(-2, edge + 3, 58, 3).fill(0x75d9cf);
      }
      if (!pipe.scored)
        for (let x = 4; x < 54; x += 9)
          gate.trim
            .circle(x, pipe.gapY + pipe.gap / 2, 1.5)
            .fill({ color: 0xffe0b0, alpha: 0.7 });
    });
    this.gates.slice(pipes.length).forEach((gate) => {
      gate.root.visible = false;
    });
    if (score > this.score) {
      this.scene.burst(82, y, perfect ? 0xffd465 : 0x80eddf, 24);
      this.scene.popup(
        perfect ? 'PERFECT +2' : '+1',
        140,
        Math.max(50, y - 20),
        perfect ? 0xffdf87 : 0xffffff
      );
    }
    if (mode === 'over' && previousMode !== mode)
      this.scene.burst(82, y, 0xffa092, 24);
    this.score = score;
    this.overlay.set(
      mode === 'playing'
        ? ''
        : mode === 'ready'
          ? 'SUNSET FLIGHT'
          : mode === 'paused'
            ? 'PAUSED'
            : `${score} POINTS`,
      mode === 'ready'
        ? 'Tap to fly. Thread the glowing gates.'
        : mode === 'paused'
          ? 'Press Resume to continue'
          : 'Tap to get ready for another flight'
    );
    this.scene.invalidate();
  }
  tick(dt: number) {
    this.scene.tick(dt);
  }
  dispose() {
    this.scene.dispose();
  }
}
