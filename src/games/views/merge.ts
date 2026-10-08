import { Container, Sprite, Text } from 'pixi.js';
import { tileTexture } from '../../core/pixi/materials';
import { gridCanvas, panel, PixiScene } from '../../core/pixi/scene';

type Point = { x: number; y: number };
export type MergeAnimation = {
  sources?: Point[];
  merged?: boolean;
  spawned?: boolean;
};
type Frame = { grid: number[][]; animations: Record<string, MergeAnimation> };
type Tile = { root: Container; sprite: Sprite; label: Text; value: number };
const COLORS = [
  0x385f89, 0x3c7da6, 0x249cae, 0x318ebd, 0x6276cd, 0x9863d2, 0xba5ec4,
  0xc96978, 0xe28e47, 0xf1b842, 0xf3d65a
];

export class MergeView {
  readonly scene: PixiScene;
  private readonly pool: Tile[] = [];
  private readonly materials;
  private occupied = new Map<string, Tile>();
  private readonly queue: Frame[] = [];
  private phase: 'idle' | 'slide' | 'merge' = 'idle';
  private cancelPhase = () => {};

  constructor(board: HTMLElement) {
    this.scene = new PixiScene(gridCanvas(board, 400, 'merge'), 400, 400);
    panel(this.scene, 4);
    this.materials = COLORS.map((color) => tileTexture(this.scene, color, 16));
    // Moving source tiles survive until contact; their numbers never change in flight.
    for (let i = 0; i < 32; i++) {
      const root = new Container();
      root.visible = false;
      const sprite = new Sprite(this.materials[0]);
      sprite.anchor.set(0.5);
      sprite.width = sprite.height = 91;
      const label = new Text({
        text: '',
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 34,
          fontWeight: '800',
          fill: 0xffffff,
          dropShadow: { color: 0x071423, alpha: 0.4, blur: 2, distance: 2 }
        }
      });
      label.anchor.set(0.5);
      root.addChild(sprite);
      this.scene.world.addChild(root);
      this.scene.hud.addChild(label);
      this.pool.push({ root, sprite, label, value: 0 });
    }
    this.scene.afterFrame = () => {
      for (const { root, label } of this.pool) {
        label.visible = root.visible;
        label.alpha = root.alpha;
        label.position.set(root.x, root.y - 3 * root.scale.y);
        label.scale.copyFrom(root.scale);
      }
    };
  }

  private tile(value: number, x: number, y: number) {
    const tile = this.pool.find((item) => !item.root.visible)!;
    this.scene.cancel(tile.root);
    tile.root.visible = true;
    tile.root.alpha = 1;
    tile.root.scale.set(1);
    tile.root.position.set(59 + x * 94, 59 + y * 94);
    this.setValue(tile, value);
    return tile;
  }
  private setValue(tile: Tile, value: number) {
    const index = Math.min(
      COLORS.length - 1,
      Math.max(0, Math.log2(value) - 1)
    );
    tile.value = value;
    tile.sprite.texture = this.materials[index];
    tile.label.text = String(value);
    tile.label.style.fontSize = value >= 10000 ? 24 : value >= 1000 ? 29 : 34;
    tile.label.style.fill = index >= 9 ? 0x172133 : 0xffffff;
  }

  draw(grid: number[][], animations: Record<string, MergeAnimation>) {
    const moving = Object.values(animations).some(
      (animation) => animation.sources?.length
    );
    if (!moving || this.scene.reducedMotion) {
      this.cancelPhase();
      this.queue.length = 0;
      this.phase = 'idle';
      for (const tile of this.pool) {
        this.scene.cancel(tile.root);
        tile.root.visible = false;
      }
      this.occupied.clear();
      grid.forEach((row, y) =>
        row.forEach((value, x) => {
          if (!value) return;
          const tile = this.tile(value, x, y);
          this.occupied.set(`${x}-${y}`, tile);
          if (animations[`${x}-${y}`]?.spawned && !this.scene.reducedMotion) {
            tile.root.scale.set(0.2);
            this.scene.tween(tile.root, { scaleX: 1, scaleY: 1 }, 0.2, {
              ease: 'back'
            });
          }
        })
      );
      this.scene.afterFrame?.();
      this.scene.invalidate();
      return;
    }
    this.queue.push({ grid: grid.map((row) => [...row]), animations });
    if (this.phase === 'idle') this.slide();
  }

  private slide() {
    const frame = this.queue.shift();
    if (!frame) {
      this.phase = 'idle';
      return;
    }
    this.phase = 'slide';
    const incoming = new Map<string, Tile>();
    const joins: {
      tile: Tile;
      consumed: Tile[];
      x: number;
      y: number;
      value: number;
    }[] = [];
    const duration = Math.max(0.07, 0.22 / (1 + this.queue.length * 0.25));
    for (const [key, animation] of Object.entries(frame.animations)) {
      if (!animation.sources?.length) continue;
      const [x, y] = key.split('-').map(Number);
      const sources = animation.sources.map((point) =>
        this.occupied.get(`${point.x}-${point.y}`)!
      );
      for (const tile of sources) {
        this.scene.cancel(tile.root);
        tile.root.scale.set(1);
        tile.root.alpha = 1;
        this.scene.tween(
          tile.root,
          { x: 59 + x * 94, y: 59 + y * 94 },
          duration,
          { ease: 'smooth' }
        );
      }
      incoming.set(key, sources[0]);
      if (animation.merged)
        joins.push({
          tile: sources[0],
          consumed: sources.slice(1),
          x,
          y,
          value: frame.grid[y][x]
        });
    }
    this.cancelPhase = this.scene.after(duration, () => {
      this.phase = 'merge';
      for (const { tile, consumed, x, y, value } of joins) {
        consumed.forEach((other) => {
          other.root.visible = false;
        });
        this.setValue(tile, value);
        tile.root.scale.set(0.88);
        this.scene.tween(tile.root, { scaleX: 1, scaleY: 1 }, 0.2, {
          ease: 'back'
        });
        const color = COLORS[Math.min(COLORS.length - 1, Math.log2(value) - 1)];
        this.scene.burst(59 + x * 94, 59 + y * 94, color, 18);
        if (value >= 128)
          this.scene.popup(String(value), 59 + x * 94, 40 + y * 94, 0xffdb79);
      }
      for (const [key, animation] of Object.entries(frame.animations)) {
        if (!animation.spawned) continue;
        const [x, y] = key.split('-').map(Number);
        const tile = this.tile(frame.grid[y][x], x, y);
        incoming.set(key, tile);
        tile.root.scale.set(0.15);
        tile.root.alpha = 0;
        this.scene.tween(tile.root, { alpha: 1 }, 0.18, {
          delay: 0.025,
          ease: 'smooth'
        });
        this.scene.tween(tile.root, { scaleX: 1, scaleY: 1 }, 0.18, {
          delay: 0.025,
          ease: 'back'
        });
      }
      this.occupied = incoming;
      this.scene.invalidate();
      this.cancelPhase = this.scene.after(
        Math.max(0.045, 0.22 / (1 + this.queue.length * 0.5)),
        () => this.slide()
      );
    });
    this.scene.invalidate();
  }

  snapshot() {
    return {
      phase: this.phase,
      queued: this.queue.length,
      tiles: this.pool
        .filter(({ root }) => root.visible)
        .map(({ root, value }) => ({
          value,
          x: +root.x.toFixed(2),
          y: +root.y.toFixed(2),
          scale: +root.scale.x.toFixed(3),
          alpha: +root.alpha.toFixed(3)
        }))
    };
  }
  dispose() {
    this.cancelPhase();
    this.queue.length = 0;
    this.scene.dispose();
  }
}
