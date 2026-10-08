import { Container, Graphics, Sprite } from 'pixi.js';
import { gemTextures, tileTexture } from '../../core/pixi/materials';
import { GameOverlay } from '../../core/pixi/overlay';
import { panel, PixiScene } from '../../core/pixi/scene';
type Point = { x: number; y: number };

export class SnakeView {
  readonly scene: PixiScene;
  private readonly body: Sprite[] = [];
  private readonly bodyTexture;
  private readonly food: Sprite;
  private readonly bonus: Sprite;
  private readonly head = new Container();
  private readonly overlay: GameOverlay;
  private signature = '';
  private score = 0;
  private direction = '';
  private foodPosition = ['', ''];
  constructor(canvas: HTMLCanvasElement) {
    this.scene = new PixiScene(canvas, 360, 360, true);
    panel(this.scene, 1, 1, 0);
    const grid = new Graphics();
    for (let i = 0; i <= 20; i++)
      grid
        .moveTo(i * 18, 0)
        .lineTo(i * 18, 360)
        .moveTo(0, i * 18)
        .lineTo(360, i * 18);
    grid.stroke({ color: 0x43728c, alpha: 0.2, width: 0.6 });
    this.scene.world.addChild(grid);
    this.bodyTexture = tileTexture(this.scene, 0x34cfa4, 35);
    const gems = gemTextures(this.scene);
    this.food = new Sprite(gems[0]);
    this.bonus = new Sprite(gems[4]);
    for (const item of [this.food, this.bonus]) {
      item.anchor.set(0.5);
      item.scale.set(18 / 128);
      this.scene.world.addChild(item);
    }
    this.head.addChild(
      new Graphics()
        .roundRect(-8, -7, 16, 14, 6)
        .fill(0xaeffe3)
        .stroke({ color: 0xeafff7, width: 1 })
    );
    this.head.addChild(
      new Graphics()
        .roundRect(0, -5, 5, 3, 1)
        .roundRect(0, 2, 5, 3, 1)
        .fill(0x0b2736)
    );
    this.scene.world.addChild(this.head);
    this.overlay = new GameOverlay(this.scene);
  }
  draw(
    segments: Point[],
    direction: Point,
    food: Point | null,
    bonus: Point | null,
    mode: string,
    score: number,
    cadence = 0.21
  ) {
    const signature = segments.map((p) => `${p.x},${p.y}`).join(';');
    if (signature !== this.signature) {
      for (let i = 0; i < segments.length; i++) {
        let sprite = this.body[i];
        if (!sprite) {
          sprite = new Sprite(this.bodyTexture);
          sprite.anchor.set(0.5);
          sprite.scale.set(18 / 128);
          this.scene.world.addChildAt(sprite, 2);
          this.body.push(sprite);
          sprite.position.set(segments[i].x * 18 + 9, segments[i].y * 18 + 9);
        }
        const x = segments[i].x * 18 + 9,
          y = segments[i].y * 18 + 9;
        sprite.visible = i !== segments.length - 1;
        sprite.alpha = 0.5 + (i / segments.length) * 0.5;
        const jump = Math.abs(sprite.x - x) + Math.abs(sprite.y - y) > 36;
        this.scene.tween(
          sprite,
          { x, y },
          jump ? 0 : Math.min(0.2, cadence * 0.88),
          { ease: 'linear' }
        );
      }
      this.body.slice(segments.length).forEach((sprite) => {
        sprite.visible = false;
      });
      const point = segments.at(-1)!;
      const x = point.x * 18 + 9,
        y = point.y * 18 + 9;
      this.scene.tween(
        this.head,
        { x, y },
        this.signature &&
          Math.abs(this.head.x - x) + Math.abs(this.head.y - y) < 36
          ? Math.min(0.2, cadence * 0.88)
          : 0,
        { ease: 'linear' }
      );
      this.signature = signature;
    }
    const facing = `${direction.x},${direction.y}`;
    if (facing !== this.direction) {
      const target = Math.atan2(direction.y, direction.x);
      const rotation =
        this.head.rotation +
        Math.atan2(
          Math.sin(target - this.head.rotation),
          Math.cos(target - this.head.rotation)
        );
      this.scene.tween(this.head, { rotation }, this.direction ? 0.12 : 0, {
        ease: 'smooth'
      });
      this.direction = facing;
    }
    let index = 0;
    for (const [sprite, point] of [
      [this.food, food],
      [this.bonus, bonus]
    ] as const) {
      sprite.visible = !!point;
      const position = point ? `${point.x},${point.y}` : '';
      if (point) {
        sprite.position.set(point.x * 18 + 9, point.y * 18 + 9);
        if (position !== this.foodPosition[index]) {
          sprite.scale.set(8 / 128);
          this.scene.tween(
            sprite,
            { scaleX: 18 / 128, scaleY: 18 / 128 },
            0.24,
            { ease: 'back' }
          );
        }
      }
      this.foodPosition[index++] = position;
    }
    if (score > this.score) {
      this.scene.burst(
        this.head.x,
        this.head.y,
        bonus ? 0xffcd55 : 0x55efb6,
        18
      );
      this.scene.popup(
        `+${score - this.score}`,
        this.head.x,
        Math.max(30, this.head.y - 12),
        0x9affd2
      );
    }
    this.score = score;
    this.overlay.set(
      mode === 'playing'
        ? ''
        : mode === 'ready'
          ? 'NEON SNAKE'
          : mode === 'paused'
            ? 'PAUSED'
            : mode === 'won'
              ? 'GRID COMPLETE'
              : `${score} POINTS`,
      mode === 'ready'
        ? 'Swipe or press Start. Chase the crystals.'
        : mode === 'paused'
          ? 'Press Resume to continue'
          : 'Your record is saved. Go again.'
    );
    this.scene.invalidate();
  }
  tick(dt: number) {
    this.scene.tick(dt);
  }
  snapshot() {
    return {
      x: +this.head.x.toFixed(2),
      y: +this.head.y.toFixed(2),
      rotation: +this.head.rotation.toFixed(3)
    };
  }
  dispose() {
    this.scene.dispose();
  }
}
