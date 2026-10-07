import { Phaser, PocketScene, INK, type Point } from "./pocket";

export interface TileStyle {
  color: number;
  label?: string;
  ink?: string;
  alpha?: number;
}

/** Persistent Phaser containers keep board animation independent of puzzle rules. */
export class BoardView {
  readonly tiles: Phaser.GameObjects.Container[] = [];
  private readonly plates: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private values: string[] = [];
  private readonly rings: Phaser.GameObjects.Graphics;
  readonly cell: number;

  constructor(
    readonly scene: PocketScene,
    readonly size: number,
    readonly inset = 12,
    readonly top = inset,
    readonly width = scene.scale.width - inset * 2,
  ) {
    this.cell = width / size;
    const background = scene.add.graphics();
    background
      .fillStyle(0xddebe5)
      .fillRoundedRect(inset - 4, top - 4, width + 8, width + 8, 18);
    this.rings = scene.add.graphics().setDepth(5);
    for (let i = 0; i < size * size; i++) {
      const { x, y } = this.center(i);
      const shadow = scene.add
        .image(0, 3, "tile")
        .setDisplaySize(this.cell - 7, this.cell - 7)
        .setTint(0x9dbdb4)
        .setAlpha(0.35);
      const plate = scene.add
        .image(0, 0, "tile")
        .setDisplaySize(this.cell - 7, this.cell - 7);
      const label = scene.text(0, -1, "", Math.min(30, this.cell * 0.43));
      const container = scene.add.container(x, y, [shadow, plate, label]);
      this.tiles.push(container);
      this.plates.push(plate);
      this.labels.push(label);
    }
  }

  center(index: number): Point {
    return {
      x: this.inset + ((index % this.size) + 0.5) * this.cell,
      y: this.top + (Math.floor(index / this.size) + 0.5) * this.cell,
    };
  }

  indexAt(x: number, y: number): number | null {
    const col = Math.floor((x - this.inset) / this.cell),
      row = Math.floor((y - this.top) / this.cell);
    return col >= 0 && col < this.size && row >= 0 && row < this.size
      ? row * this.size + col
      : null;
  }

  render(
    styles: TileStyle[],
    highlights: number[] = [],
    selected = -1,
    animate = true,
  ) {
    this.rings.clear();
    styles.forEach((style, i) => {
      const key = JSON.stringify(style);
      if (this.values[i] !== key) {
        this.plates[i].setTint(style.color).setAlpha(style.alpha ?? 1);
        this.labels[i]
          .setText(style.label ?? "")
          .setColor(style.ink ?? INK)
          .setFontSize(
            (style.label?.length ?? 0) > 3
              ? this.cell * 0.3
              : Math.min(32, this.cell * 0.43),
          );
        if (animate && this.values[i] && !this.scene.reducedMotion) {
          this.scene.tweens.killTweensOf(this.tiles[i]);
          this.tiles[i].setScale(0.87);
          this.scene.tweens.add({
            targets: this.tiles[i],
            scaleX: 1,
            scaleY: 1,
            duration: 170,
            ease: "Back.easeOut",
          });
        }
        this.values[i] = key;
      }
      if (i === selected || highlights.includes(i)) {
        const p = this.center(i);
        this.rings
          .lineStyle(
            i === selected ? 3 : 2,
            i === selected ? 0x29475b : 0xffffff,
          )
          .strokeRoundedRect(
            p.x - this.cell / 2 + 3,
            p.y - this.cell / 2 + 3,
            this.cell - 6,
            this.cell - 6,
            10,
          );
      }
    });
  }

  fall(moves: { x: number; from: number; to: number }[]) {
    for (const move of moves) {
      const i = move.to * this.size + move.x,
        p = this.center(i),
        tile = this.tiles[i];
      this.scene.tweens.killTweensOf(tile);
      tile.y = this.top + (move.from + 0.5) * this.cell;
      tile.alpha = move.from < 0 ? 0 : 1;
      this.scene.tweens.add({
        targets: tile,
        y: p.y,
        alpha: 1,
        duration: this.scene.reducedMotion ? 0 : 220,
        ease: "Bounce.easeOut",
      });
    }
  }

  clear(indices: number[]) {
    for (const i of indices) {
      const p = this.center(i);
      this.scene.burst(p.x, p.y, 0xffcf70, 6);
      if (!this.scene.reducedMotion)
        this.scene.tweens.add({
          targets: this.tiles[i],
          scale: 0.25,
          alpha: 0.1,
          duration: 140,
        });
    }
  }

  reset() {
    this.tiles.forEach((tile, i) => {
      this.scene.tweens.killTweensOf(tile);
      const p = this.center(i);
      tile.setPosition(p.x, p.y).setScale(1).setAlpha(1);
    });
  }

  swap(a: number, b: number, valid: boolean) {
    if (this.scene.reducedMotion) return;
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      const p = this.center(to);
      this.scene.tweens.add({
        targets: this.tiles[from],
        x: p.x,
        y: p.y,
        duration: 150,
        yoyo: !valid,
        ease: "Sine.easeInOut",
      });
    }
  }
}
