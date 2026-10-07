import { Graphics, Sprite } from 'pixi.js';
import { gemTextures } from '../../core/pixi/materials';
import { gridCanvas, panel, PALETTE, PixiScene } from '../../core/pixi/scene';
type Point = { x: number; y: number };
type Fall = { x: number; from: number; to: number; isNew: boolean };

export class GemView {
  readonly scene: PixiScene;
  private readonly gems: Sprite[] = [];
  private readonly selection = new Graphics();
  private readonly materials;
  private phase = '';
  private signature = '';
  private swapPending?: { a: Point; b: Point; valid: boolean };
  constructor(board: HTMLElement) {
    this.scene = new PixiScene(gridCanvas(board, 400, 'gems'), 400, 400, true);
    panel(this.scene, 8);
    this.materials = gemTextures(this.scene);
    for (let i = 0; i < 64; i++) {
      const gem = new Sprite(this.materials[0]);
      gem.anchor.set(0.5);
      gem.scale.set(41 / 128);
      gem.position.set(35.5 + (i % 8) * 47, 35.5 + Math.floor(i / 8) * 47);
      this.scene.world.addChild(gem);
      this.gems.push(gem);
    }
    this.scene.effects.addChild(this.selection);
  }
  draw(
    grid: number[][],
    selected: Point | null,
    hinted: Point[],
    matching: Point[],
    phase: string,
    chain: number,
    falls: Fall[]
  ) {
    const signature = grid.flat().join('');
    const changed = this.phase !== phase || this.signature !== signature;
    if (changed)
      grid.forEach((row, y) =>
        row.forEach((value, x) => {
          const gem = this.gems[y * 8 + x];
          gem.texture = this.materials[Math.max(0, value)];
          this.scene.cancel(gem);
          gem.visible = value >= 0;
          gem.alpha = 1;
          gem.scale.set(41 / 128);
          const fall = falls.find((item) => item.x === x && item.to === y);
          gem.position.set(35.5 + x * 47, 35.5 + (fall?.from ?? y) * 47);
          if (fall) this.scene.tween(gem, { y: 35.5 + y * 47 }, 0.23);
        })
      );
    if (this.swapPending) {
      const { a, b, valid } = this.swapPending;
      for (const [from, to] of [
        [a, b],
        [b, a]
      ]) {
        const gem = this.gems[to.y * 8 + to.x];
        if (valid) {
          gem.position.set(35.5 + from.x * 47, 35.5 + from.y * 47);
          this.scene.tween(
            gem,
            { x: 35.5 + to.x * 47, y: 35.5 + to.y * 47 },
            0.09
          );
        } else {
          this.scene.tween(
            gem,
            { x: gem.x + (from.x - to.x) * 9, y: gem.y + (from.y - to.y) * 9 },
            0.07,
            () =>
              this.scene.tween(
                gem,
                { x: 35.5 + to.x * 47, y: 35.5 + to.y * 47 },
                0.07
              )
          );
        }
      }
      this.swapPending = undefined;
    }
    if (phase === 'clearing' && changed) {
      const center = matching.reduce(
        (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
        { x: 0, y: 0 }
      );
      for (const { x, y } of matching) {
        const gem = this.gems[y * 8 + x];
        this.scene.burst(gem.x, gem.y, PALETTE[grid[y][x]], 12);
        this.scene.tween(gem, { scaleX: 0.09, scaleY: 0.09, alpha: 0 }, 0.16);
      }
      if (matching.length) {
        const x = 35.5 + (center.x / matching.length) * 47,
          y = 35.5 + (center.y / matching.length) * 47;
        this.scene.ripple(x, y);
        this.scene.popup(
          chain > 1 ? `CASCADE ×${chain}` : `+${matching.length * 10}`,
          x,
          y
        );
      }
    }
    if (phase === 'won' && this.phase !== 'won') {
      this.scene.burst(200, 180, 0xffd15e, 80);
      this.scene.popup('LEVEL CLEAR', 200, 180, 0xffd15e);
    }
    this.selection.clear();
    for (const p of [...hinted, ...(selected ? [selected] : [])]) {
      this.selection
        .roundRect(13 + p.x * 47, 13 + p.y * 47, 45, 45, 10)
        .stroke({ color: selected === p ? 0xffffff : 0xffd15e, width: 2 });
    }
    this.phase = phase;
    this.signature = signature;
    this.scene.invalidate();
  }
  tick(dt: number) {
    this.scene.tick(dt);
  }
  swap(a: Point, b: Point, valid: boolean) {
    this.swapPending = { a, b, valid };
  }
  dispose() {
    this.scene.dispose();
  }
}
