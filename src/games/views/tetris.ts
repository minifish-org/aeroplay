import { Container, Sprite } from 'pixi.js';
import { tileTexture } from '../../core/pixi/materials';
import { GameOverlay } from '../../core/pixi/overlay';
import { panel, PixiScene } from '../../core/pixi/scene';
const COLORS = [
  0x000000, 0x49d8ff, 0xff6279, 0xad83ff, 0xffca54, 0x47e0a2, 0x5a9dff, 0xf383d8
];
type Piece = { x: number; y: number; matrix: number[][] };

export class TetrisView {
  readonly scene: PixiScene;
  private readonly blocks: Sprite[] = [];
  private readonly active = new Container();
  private readonly activeBlocks: Sprite[] = [];
  private readonly ghost: Sprite[] = [];
  private readonly materials;
  private readonly overlay: GameOverlay;
  private lines = 0;
  private position = '';
  constructor(canvas: HTMLCanvasElement) {
    this.scene = new PixiScene(canvas, 240, 480, true);
    panel(this.scene, 10, 20, 0);
    this.materials = COLORS.map((color) => tileTexture(this.scene, color, 12));
    for (let i = 0; i < 200; i++) {
      const block = new Sprite(this.materials[1]);
      block.position.set((i % 10) * 24, Math.floor(i / 10) * 24);
      block.width = block.height = 24;
      this.scene.world.addChild(block);
      this.blocks.push(block);
    }
    for (let i = 0; i < 16; i++) {
      const ghost = new Sprite(this.materials[1]);
      ghost.width = ghost.height = 24;
      ghost.alpha = 0.19;
      this.scene.world.addChild(ghost);
      this.ghost.push(ghost);
      const block = new Sprite(this.materials[1]);
      block.width = block.height = 24;
      this.active.addChild(block);
      this.activeBlocks.push(block);
    }
    this.scene.world.addChild(this.active);
    this.overlay = new GameOverlay(this.scene);
  }
  draw(
    board: number[][],
    piece: Piece,
    ghostY: number,
    mode: string,
    lines: number,
    score: number
  ) {
    board.forEach((row, y) =>
      row.forEach((value, x) => {
        const sprite = this.blocks[y * 10 + x];
        sprite.visible = !!value;
        if (value) sprite.texture = this.materials[value];
      })
    );
    let index = 0;
    piece.matrix.forEach((row, y) =>
      row.forEach((value, x) => {
        if (!value) return;
        const block = this.activeBlocks[index],
          ghost = this.ghost[index++];
        block.visible = ghost.visible = true;
        block.texture = ghost.texture = this.materials[value];
        block.position.set(x * 24, y * 24);
        ghost.position.set((piece.x + x) * 24, (ghostY + y) * 24);
      })
    );
    this.activeBlocks.slice(index).forEach((item) => {
      item.visible = false;
    });
    this.ghost.slice(index).forEach((item) => {
      item.visible = false;
    });
    const position = `${piece.x}:${piece.y}:${piece.matrix.flat().join('')}`;
    if (position !== this.position) {
      const jump =
        Math.abs(this.active.y - piece.y * 24) > 30 || !this.position;
      this.scene.tween(
        this.active,
        { x: piece.x * 24, y: piece.y * 24 },
        jump ? 0 : 0.045
      );
      this.position = position;
    }
    if (lines > this.lines) {
      this.scene.popup(
        lines - this.lines === 4
          ? 'TETRIS'
          : `${lines - this.lines} LINE${lines - this.lines > 1 ? 'S' : ''}`,
        120,
        360,
        0x7de8ff
      );
    }
    this.lines = lines;
    this.overlay.set(
      mode === 'playing'
        ? ''
        : mode === 'ready'
          ? 'TETRIS'
          : mode === 'paused'
            ? 'PAUSED'
            : `${score} POINTS`,
      mode === 'ready'
        ? 'Stack. Clear. Beat your record.'
        : mode === 'paused'
          ? 'Press Resume'
          : 'Press Play again'
    );
    this.scene.invalidate();
  }
  impact(x: number, y: number) {
    this.scene.burst(x * 24 + 24, Math.min(468, y * 24 + 24), 0x9cecff, 12);
  }
  clear(rows: number[]) {
    for (const row of rows)
      for (let x = 12; x < 240; x += 24)
        this.scene.burst(x, row * 24 + 12, 0x6bddff, 7);
    if (rows.length) this.scene.ripple(120, rows[0] * 24 + 12);
  }
  tick(dt: number) {
    this.scene.tick(dt);
  }
  dispose() {
    this.scene.dispose();
  }
}
