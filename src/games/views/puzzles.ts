import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { tileTexture } from '../../core/pixi/materials';
import { gridCanvas, panel, PixiScene } from '../../core/pixi/scene';

type Animation = {
  dir?: 'left' | 'right' | 'up' | 'down';
  shift?: number;
  merged?: boolean;
  spawned?: boolean;
};
const TILE_COLORS = [
  0x385f89, 0x3c7da6, 0x249cae, 0x318ebd, 0x6276cd, 0x9863d2, 0xba5ec4,
  0xc96978, 0xe28e47, 0xf1b842, 0xf3d65a
];

export class MergeView {
  readonly scene: PixiScene;
  private readonly tiles: { root: Container; sprite: Sprite; label: Text }[] =
    [];
  private readonly materials;
  constructor(board: HTMLElement) {
    this.scene = new PixiScene(gridCanvas(board, 400, 'merge'), 400, 400);
    panel(this.scene, 4);
    this.materials = TILE_COLORS.map((color) =>
      tileTexture(this.scene, color, 16)
    );
    for (let i = 0; i < 16; i++) {
      const root = new Container(),
        sprite = new Sprite(this.materials[0]);
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
      this.tiles.push({ root, sprite, label });
    }
    this.scene.afterFrame = () => this.alignLabels();
  }
  private alignLabels() {
    for (const { root, label } of this.tiles) {
      label.visible = root.visible;
      label.alpha = root.alpha;
      label.position.set(root.x, root.y - 3 * root.scale.y);
      label.scale.copyFrom(root.scale);
    }
  }
  draw(grid: number[][], animations: Record<string, Animation>) {
    grid.forEach((row, y) =>
      row.forEach((value, x) => {
        const { root, sprite, label } = this.tiles[y * 4 + x],
          anim = animations[`${x}-${y}`];
        this.scene.cancel(root);
        root.visible = !!value;
        root.alpha = 1;
        root.scale.set(1);
        root.position.set(59 + x * 94, 59 + y * 94);
        if (!value) return;
        const index = Math.max(
          0,
          Math.min(TILE_COLORS.length - 1, Math.log2(value) - 1)
        );
        sprite.texture = this.materials[index];
        label.text = String(value);
        label.style.fontSize = value >= 10000 ? 24 : value >= 1000 ? 29 : 34;
        label.style.fill = index >= 9 ? 0x172133 : 0xffffff;
        if (anim?.shift && anim.dir) {
          const offset = anim.shift * 94,
            endX = root.x,
            endY = root.y;
          root.x +=
            anim.dir === 'left' ? offset : anim.dir === 'right' ? -offset : 0;
          root.y +=
            anim.dir === 'up' ? offset : anim.dir === 'down' ? -offset : 0;
          this.scene.tween(
            root,
            { x: endX, y: endY, scaleX: 1, scaleY: 1 },
            0.16
          );
        }
        if (anim?.merged || anim?.spawned) {
          root.scale.set(anim.spawned ? 0.15 : 1.14);
          this.scene.tween(
            root,
            { x: 59 + x * 94, y: 59 + y * 94, scaleX: 1, scaleY: 1 },
            0.18
          );
          if (anim.merged) {
            this.scene.burst(59 + x * 94, 59 + y * 94, TILE_COLORS[index], 20);
            if (value >= 128)
              this.scene.popup(
                String(value),
                59 + x * 94,
                40 + y * 94,
                0xffdb79
              );
          }
        }
      })
    );
    this.alignLabels();
    this.scene.invalidate();
  }
  dispose() {
    this.scene.dispose();
  }
}

export class LightsView {
  readonly scene: PixiScene;
  private readonly lamps: Sprite[] = [];
  private readonly selector = new Graphics();
  private readonly onTexture;
  private readonly offTexture;
  private previous: number[] = [];
  constructor(board: HTMLElement) {
    this.scene = new PixiScene(gridCanvas(board, 400, 'lights'), 400, 400);
    panel(this.scene, 5);
    this.onTexture = this.lampTexture(true);
    this.offTexture = this.lampTexture(false);
    for (let i = 0; i < 25; i++) {
      const lamp = new Sprite(this.offTexture);
      lamp.anchor.set(0.5);
      lamp.width = lamp.height = 71;
      lamp.position.set(49.6 + (i % 5) * 75.2, 49.6 + Math.floor(i / 5) * 75.2);
      this.lamps.push(lamp);
      this.scene.world.addChild(lamp);
    }
    this.scene.effects.addChild(this.selector);
  }
  private lampTexture(on: boolean) {
    return this.scene.texture((ctx, size) => {
      ctx.fillStyle = on ? '#413021' : '#142039';
      ctx.beginPath();
      ctx.roundRect(5, 5, size - 10, size - 10, 20);
      ctx.fill();
      ctx.strokeStyle = on ? '#ffd48677' : '#667ba34d';
      ctx.lineWidth = 2;
      ctx.stroke();
      const light = ctx.createRadialGradient(64, 58, 0, 64, 64, 51);
      light.addColorStop(0, on ? '#fff7d0' : '#40506b');
      light.addColorStop(0.38, on ? '#ffd15e' : '#24364f');
      light.addColorStop(0.75, on ? '#d69b3444' : '#1c2a4200');
      light.addColorStop(1, '#00000000');
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(64, 64, 25, 0, Math.PI * 2);
      ctx.strokeStyle = on ? '#fff0b4bb' : '#5b719288';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(64, 45);
      ctx.lineTo(64, 66);
      ctx.strokeStyle = on ? '#fffbe4' : '#718aa5';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 64, 14, -Math.PI * 0.3, Math.PI * 1.3);
      ctx.stroke();
    });
  }
  draw(board: number[], hinted: number) {
    board.forEach((value, i) => {
      const lamp = this.lamps[i];
      lamp.texture = value ? this.onTexture : this.offTexture;
      if (this.previous.length && value !== this.previous[i]) {
        lamp.scale.set((71 / 128) * 0.88);
        this.scene.tween(lamp, { scaleX: 71 / 128, scaleY: 71 / 128 }, 0.2);
        if (value) this.scene.burst(lamp.x, lamp.y, 0xffd47b, 5);
      }
    });
    this.selector.clear();
    if (hinted >= 0)
      this.selector
        .roundRect(
          14 + (hinted % 5) * 75.2,
          14 + Math.floor(hinted / 5) * 75.2,
          71.2,
          71.2,
          12
        )
        .stroke({ color: 0xffffff, width: 2 });
    if (this.previous.some(Boolean) && !board.some(Boolean)) {
      this.scene.popup('LIGHTS OUT', 200, 180, 0xffd47b);
      this.scene.burst(200, 200, 0xffd47b, 60);
    }
    this.previous = [...board];
    this.scene.invalidate();
  }
  press(index: number) {
    this.scene.ripple(
      49.6 + (index % 5) * 75.2,
      49.6 + Math.floor(index / 5) * 75.2
    );
  }
  dispose() {
    this.scene.dispose();
  }
}

export class SudokuView {
  readonly scene: PixiScene;
  private readonly cells: { sprite: Sprite; label: Text }[] = [];
  private readonly materials;
  private readonly selected = new Graphics();
  private values: string[] = [];
  constructor(board: HTMLElement) {
    this.scene = new PixiScene(gridCanvas(board, 400, 'sudoku'), 400, 400);
    panel(this.scene, 9);
    this.materials = [0x192c44, 0x234459, 0x32637c, 0x245b70, 0x593344].map(
      (color) =>
        this.scene.texture((ctx, size) => {
          const gradient = ctx.createLinearGradient(0, 0, size, size);
          gradient.addColorStop(0, `#${color.toString(16)}`);
          gradient.addColorStop(1, '#111d33');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, size, size);
        })
    );
    for (let i = 0; i < 81; i++) {
      const sprite = new Sprite(this.materials[0]);
      sprite.width = sprite.height = 39.8;
      sprite.position.set(
        13 + ((i % 9) * 376) / 9,
        13 + (Math.floor(i / 9) * 376) / 9
      );
      const label = new Text({
        text: '',
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 23,
          fontWeight: '600',
          fill: 0xecf5ff,
          align: 'center'
        }
      });
      label.anchor.set(0.5);
      label.position.set(sprite.x + 20, sprite.y + 19);
      this.cells.push({ sprite, label });
      this.scene.world.addChild(sprite);
      this.scene.hud.addChild(label);
    }
    const divisions = new Graphics();
    for (let i = 0; i <= 3; i++) {
      const p = 12 + (i * 376) / 3;
      divisions.moveTo(p, 12).lineTo(p, 388).moveTo(12, p).lineTo(388, p);
    }
    divisions.stroke({ color: 0x7496b7, width: 1.7, alpha: 0.8 });
    this.scene.world.addChild(divisions);
    this.scene.effects.addChild(this.selected);
  }
  draw(board: HTMLElement) {
    this.selected.clear();
    Array.from(board.children).forEach((element, i) => {
      const { sprite, label } = this.cells[i],
        classes = element.classList;
      sprite.texture =
        this.materials[
          classes.contains('invalid')
            ? 4
            : classes.contains('selected')
              ? 3
              : classes.contains('same-value')
                ? 2
                : classes.contains('peer')
                  ? 1
                  : 0
        ];
      const notes = element.querySelector('.sudoku-notes');
      if (notes) {
        const digits = Array.from(
          notes.children,
          (node) => node.textContent || ' '
        );
        label.text = [
          digits.slice(0, 3).join(' '),
          digits.slice(3, 6).join(' '),
          digits.slice(6).join(' ')
        ].join('\n');
        label.style.fontFamily = 'monospace';
        label.style.fontSize = 9;
        label.style.fontWeight = '500';
      } else {
        label.text = element.textContent ?? '';
        label.style.fontFamily = 'system-ui, sans-serif';
        label.style.fontSize = 23;
        label.style.fontWeight = classes.contains('given') ? '600' : '700';
      }
      label.style.fill = classes.contains('invalid')
        ? 0xffabb4
        : classes.contains('given')
          ? 0xeaf2ff
          : 0x74dcff;
      if (classes.contains('selected'))
        this.selected
          .roundRect(sprite.x - 1, sprite.y - 1, 41.8, 41.8, 4)
          .stroke({ color: 0x80ecff, width: 2 });
      if (
        this.values[i] !== undefined &&
        this.values[i] !== label.text &&
        label.text &&
        !notes
      )
        this.scene.burst(
          label.x,
          label.y,
          classes.contains('invalid') ? 0xff708a : 0x6cdaff,
          8
        );
      this.values[i] = label.text;
    });
    this.scene.invalidate();
  }
  dispose() {
    this.scene.dispose();
  }
}
