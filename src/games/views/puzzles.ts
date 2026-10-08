import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { gridCanvas, panel, PixiScene } from '../../core/pixi/scene';

export class LightsView {
  readonly scene: PixiScene;
  private readonly lamps: { root: Container; light: Sprite }[] = [];
  private readonly selector = new Graphics();
  private readonly onTexture;
  private readonly offTexture;
  private previous: number[] = [];
  private pressed = -1;
  constructor(board: HTMLElement) {
    this.scene = new PixiScene(gridCanvas(board, 400, 'lights'), 400, 400);
    panel(this.scene, 5);
    this.onTexture = this.lampTexture(true);
    this.offTexture = this.lampTexture(false);
    for (let i = 0; i < 25; i++) {
      const root = new Container();
      root.position.set(49.6 + (i % 5) * 75.2, 49.6 + Math.floor(i / 5) * 75.2);
      const base = new Sprite(this.offTexture),
        light = new Sprite(this.onTexture);
      for (const sprite of [base, light]) {
        sprite.anchor.set(0.5);
        sprite.width = sprite.height = 71;
      }
      root.addChild(base, light);
      this.lamps.push({ root, light });
      this.scene.world.addChild(root);
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
      const { root, light } = this.lamps[i];
      if (!this.previous.length) light.alpha = value;
      if (this.previous.length && value !== this.previous[i]) {
        const distance =
          this.pressed < 0
            ? 0
            : Math.abs((i % 5) - (this.pressed % 5)) +
              Math.abs(Math.floor(i / 5) - Math.floor(this.pressed / 5));
        this.scene.tween(light, { alpha: value }, 0.28, {
          ease: 'smooth',
          delay: distance * 0.035
        });
        this.scene.tween(root, { scaleX: 0.94, scaleY: 0.94 }, 0.08, {
          onComplete: () =>
            this.scene.tween(root, { scaleX: 1, scaleY: 1 }, 0.22, {
              ease: 'back'
            })
        });
        if (value) this.scene.burst(root.x, root.y, 0xffd47b, 5);
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
    this.pressed = -1;
    this.scene.invalidate();
  }
  press(index: number) {
    this.pressed = index;
    this.scene.ripple(
      49.6 + (index % 5) * 75.2,
      49.6 + Math.floor(index / 5) * 75.2
    );
  }
  snapshot() {
    return {
      brightness: this.lamps.map(({ light }) => +light.alpha.toFixed(3))
    };
  }
  dispose() {
    this.scene.dispose();
  }
}

export class SudokuView {
  readonly scene: PixiScene;
  private readonly cells: {
    sprite: Sprite;
    shade: Sprite;
    label: Text;
    material: number;
    ghost?: Text;
  }[] = [];
  private readonly materials;
  private readonly selected = new Graphics();
  private values: string[] = [];
  private selection = -1;
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
      const shade = new Sprite(this.materials[0]);
      shade.width = shade.height = 39.8;
      shade.position.copyFrom(sprite.position);
      shade.alpha = 0;
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
      this.cells.push({ sprite, shade, label, material: 0 });
      this.scene.world.addChild(sprite, shade);
      this.scene.hud.addChild(label);
    }
    const divisions = new Graphics();
    for (let i = 0; i <= 3; i++) {
      const p = 12 + (i * 376) / 3;
      divisions.moveTo(p, 12).lineTo(p, 388).moveTo(12, p).lineTo(388, p);
    }
    divisions.stroke({ color: 0x7496b7, width: 1.7, alpha: 0.8 });
    this.scene.world.addChild(divisions);
    this.selected
      .roundRect(0, 0, 41.8, 41.8, 4)
      .stroke({ color: 0x80ecff, width: 2 });
    this.selected.visible = false;
    this.scene.effects.addChild(this.selected);
  }
  draw(board: HTMLElement) {
    let selection = -1;
    Array.from(board.children).forEach((element, i) => {
      const cell = this.cells[i],
        { sprite, shade, label } = cell,
        classes = element.classList;
      const material = classes.contains('invalid')
        ? 4
        : classes.contains('selected')
          ? 3
          : classes.contains('same-value')
            ? 2
            : classes.contains('peer')
              ? 1
              : 0;
      if (this.values[i] === undefined)
        sprite.texture = this.materials[material];
      else if (material !== cell.material) {
        shade.texture = this.materials[material];
        shade.alpha = 0;
        this.scene.tween(shade, { alpha: 1 }, 0.18, {
          ease: 'smooth',
          onComplete: () => {
            sprite.texture = shade.texture;
            shade.alpha = 0;
            this.scene.invalidate();
          }
        });
      }
      cell.material = material;
      const notes = element.querySelector('.sudoku-notes');
      const previous = label.text;
      const digits = notes
        ? Array.from(notes.children, (node) => node.textContent || ' ')
        : [];
      const next = notes
        ? [
            digits.slice(0, 3).join(' '),
            digits.slice(3, 6).join(' '),
            digits.slice(6).join(' ')
          ].join('\n')
        : (element.textContent ?? '');
      const previousStyle =
        previous && previous !== next ? label.style.clone() : undefined;
      label.text = next;
      if (notes) {
        label.style.fontFamily = 'monospace';
        label.style.fontSize = 9;
        label.style.fontWeight = '500';
      } else {
        label.style.fontFamily = 'system-ui, sans-serif';
        label.style.fontSize = 23;
        label.style.fontWeight = classes.contains('given') ? '600' : '700';
      }
      label.style.fill = classes.contains('invalid')
        ? 0xffabb4
        : classes.contains('given')
          ? 0xeaf2ff
          : 0x74dcff;
      if (classes.contains('selected')) selection = i;
      if (
        this.values[i] !== undefined &&
        previous !== label.text &&
        !this.scene.reducedMotion
      ) {
        if (cell.ghost) {
          this.scene.cancel(cell.ghost);
          cell.ghost.destroy();
          cell.ghost = undefined;
        }
        if (previous) {
          const ghost = new Text({ text: previous, style: previousStyle });
          ghost.anchor.set(0.5);
          ghost.position.copyFrom(label.position);
          ghost.alpha = label.alpha;
          this.scene.hud.addChild(ghost);
          cell.ghost = ghost;
          this.scene.tween(
            ghost,
            { alpha: 0, y: ghost.y - 5, scaleX: 0.9, scaleY: 0.9 },
            0.14,
            {
              onComplete: () => {
                ghost.destroy();
                cell.ghost = undefined;
              }
            }
          );
        }
        this.scene.cancel(label);
        label.alpha = 0;
        label.scale.set(notes ? 0.9 : 0.55);
        this.scene.tween(label, { alpha: 1 }, 0.14, { ease: 'smooth' });
        this.scene.tween(label, { scaleX: 1, scaleY: 1 }, 0.24, {
          ease: notes ? 'out' : 'back'
        });
      }
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
    if (selection !== this.selection) {
      this.scene.cancel(this.selected);
      if (selection >= 0) {
        const { sprite } = this.cells[selection];
        if (this.selection < 0)
          this.selected.position.set(sprite.x - 1, sprite.y - 1);
        this.selected.visible = true;
        this.scene.tween(
          this.selected,
          { x: sprite.x - 1, y: sprite.y - 1 },
          0.18,
          { ease: 'smooth' }
        );
      } else this.selected.visible = false;
      this.selection = selection;
    }
    this.scene.invalidate();
  }
  snapshot() {
    return {
      selection: this.selection,
      x: +this.selected.x.toFixed(2),
      y: +this.selected.y.toFixed(2),
      cells: this.cells.map(({ label, ghost }) => ({
        value: label.text,
        alpha: +label.alpha.toFixed(3),
        scale: +label.scale.x.toFixed(3),
        outgoing: ghost
          ? { value: ghost.text, alpha: +ghost.alpha.toFixed(3) }
          : undefined
      }))
    };
  }
  dispose() {
    this.scene.dispose();
  }
}
