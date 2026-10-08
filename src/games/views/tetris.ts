import { Container, Graphics, Sprite } from 'pixi.js';
import { tileTexture } from '../../core/pixi/materials';
import { GameOverlay } from '../../core/pixi/overlay';
import { panel, PixiScene } from '../../core/pixi/scene';

const COLORS = [
  0x000000, 0x49d8ff, 0xff6279, 0xad83ff, 0xffca54, 0x47e0a2, 0x5a9dff, 0xf383d8
];
type Piece = { x: number; y: number; matrix: number[][] };
type Frame = {
  board: number[][];
  piece: Piece;
  ghostY: number;
  mode: string;
  score: number;
};
type Landing = {
  board: number[][];
  piece: Piece;
  rows: number[];
  hard: boolean;
};

export class TetrisView {
  readonly scene: PixiScene;
  private readonly blocks: Sprite[] = [];
  private readonly active = new Container();
  private readonly activeBlocks: Sprite[] = [];
  private readonly ghost: Sprite[] = [];
  private readonly flash = new Graphics();
  private readonly materials;
  private readonly overlay: GameOverlay;
  private readonly landings: Landing[] = [];
  private latest?: Frame;
  private phase: 'idle' | 'drop' | 'clear' | 'settle' = 'idle';
  private position = '';
  private shapeKey = '';
  private boardKey = '';
  private score = 0;
  private hard = false;
  private cancelPhase = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new PixiScene(canvas, 240, 480, true);
    panel(this.scene, 10, 20, 0);
    this.materials = COLORS.map((color) => tileTexture(this.scene, color, 12));
    for (let i = 0; i < 200; i++) {
      const block = new Sprite(this.materials[1]);
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
    this.scene.effects.addChild(this.flash);
    this.overlay = new GameOverlay(this.scene);
  }

  draw(
    board: number[][],
    piece: Piece,
    ghostY: number,
    mode: string,
    _lines: number,
    score: number
  ) {
    if (score < this.score || mode === 'ready') this.resetAnimation();
    this.score = score;
    this.latest = {
      board: board.map((row) => [...row]),
      piece: { ...piece, matrix: piece.matrix.map((row) => [...row]) },
      ghostY,
      mode,
      score
    };
    if (this.phase === 'idle') this.paint(this.latest);
    else this.overlay.set(mode === 'paused' ? 'PAUSED' : '', 'Press Resume');
  }

  private paintBoard(board: number[][], origins?: number[]) {
    const key = board.flat().join(',');
    if (!origins && key === this.boardKey) return;
    this.boardKey = key;
    board.forEach((row, y) =>
      row.forEach((value, x) => {
        const block = this.blocks[y * 10 + x];
        this.scene.cancel(block);
        block.visible = !!value;
        block.alpha = 1;
        block.texture = this.materials[value || 1];
        block.position.set(x * 24, (origins?.[y] ?? y) * 24);
        if (value && origins && origins[y] !== y)
          this.scene.tween(block, { y: y * 24 }, 0.22, { ease: 'smooth' });
      })
    );
    this.scene.invalidate();
  }
  private shape(piece: Piece, ghostY: number, animate: boolean) {
    const key = piece.matrix.flat().join(',');
    const changed = key !== this.shapeKey;
    let index = 0;
    piece.matrix.forEach((row, y) =>
      row.forEach((value, x) => {
        if (!value) return;
        const block = this.activeBlocks[index],
          ghost = this.ghost[index++];
        block.visible = ghost.visible = true;
        block.texture = ghost.texture = this.materials[value];
        if (animate && changed && (block.x !== x * 24 || block.y !== y * 24))
          this.scene.tween(block, { x: x * 24, y: y * 24 }, 0.13, {
            ease: 'smooth'
          });
        else if (!animate) {
          this.scene.cancel(block);
          block.position.set(x * 24, y * 24);
        }
        ghost.position.set((piece.x + x) * 24, (ghostY + y) * 24);
      })
    );
    this.activeBlocks.slice(index).forEach((item) => {
      item.visible = false;
    });
    this.ghost.slice(index).forEach((item) => {
      item.visible = false;
    });
    this.shapeKey = key;
  }
  private paint(frame: Frame) {
    this.paintBoard(frame.board);
    const signature = `${frame.piece.x}:${frame.piece.y}:${frame.piece.matrix.flat().join('')}`;
    const spawn =
      !this.position || Math.abs(this.active.y - frame.piece.y * 24) > 30;
    this.shape(frame.piece, frame.ghostY, !spawn);
    this.active.visible = frame.mode !== 'over';
    if (signature !== this.position) {
      if (spawn) {
        this.scene.cancel(this.active);
        this.active.position.set(frame.piece.x * 24, frame.piece.y * 24);
        this.active.alpha = 0;
        this.scene.tween(this.active, { alpha: 1 }, 0.16, { ease: 'smooth' });
      } else
        this.scene.tween(
          this.active,
          { x: frame.piece.x * 24, y: frame.piece.y * 24 },
          0.13,
          { ease: 'smooth' }
        );
      this.position = signature;
      this.scene.invalidate();
    }
    this.overlay.set(
      frame.mode === 'playing'
        ? ''
        : frame.mode === 'ready'
          ? 'TETRIS'
          : frame.mode === 'paused'
            ? 'PAUSED'
            : `${frame.score} POINTS`,
      frame.mode === 'ready'
        ? 'Stack. Clear. Beat your record.'
        : frame.mode === 'paused'
          ? 'Press Resume'
          : 'Press Play again'
    );
  }

  hardDrop() {
    this.hard = true;
  }
  get animating() {
    return this.phase !== 'idle';
  }
  lock(board: number[][], piece: Piece, rows: number[]) {
    if (this.scene.reducedMotion) {
      this.hard = false;
      return;
    }
    this.landings.push({
      board: board.map((row) => [...row]),
      piece: { ...piece, matrix: piece.matrix.map((row) => [...row]) },
      rows: [...rows],
      hard: this.hard
    });
    this.hard = false;
    if (this.phase === 'idle') this.land();
  }
  private land() {
    const frame = this.landings.shift();
    if (!frame) {
      this.phase = 'idle';
      if (this.latest) this.paint(this.latest);
      return;
    }
    this.phase = 'drop';
    const before = frame.board.map((row) => [...row]);
    frame.piece.matrix.forEach((row, y) =>
      row.forEach((value, x) => {
        if (value && frame.piece.y + y >= 0)
          before[frame.piece.y + y][frame.piece.x + x] = 0;
      })
    );
    this.paintBoard(before);
    this.shape(frame.piece, frame.piece.y, false);
    this.ghost.forEach((item) => {
      item.visible = false;
    });
    if (!this.active.visible) this.active.position.set(72, 0);
    this.active.visible = true;
    this.active.alpha = 1;
    this.scene.cancel(this.active);
    const duration = frame.hard
      ? Math.max(0.06, 0.16 / (1 + this.landings.length * 0.2))
      : 0.045;
    this.scene.tween(
      this.active,
      { x: frame.piece.x * 24, y: frame.piece.y * 24 },
      duration,
      { ease: 'smooth' }
    );
    this.cancelPhase = this.scene.after(duration, () => {
      this.paintBoard(frame.board);
      this.active.visible = false;
      this.scene.burst(
        frame.piece.x * 24 + 24,
        Math.min(468, frame.piece.y * 24 + 24),
        0x9cecff,
        12
      );
      if (!frame.rows.length) {
        this.cancelPhase = this.scene.after(0.035, () => this.land());
        return;
      }
      this.phase = 'clear';
      this.flash.clear();
      for (const row of frame.rows) {
        this.flash.rect(0, row * 24, 240, 24).fill(0xccf6ff);
        for (let x = 0; x < 10; x++) {
          this.scene.tween(this.blocks[row * 10 + x], { alpha: 0 }, 0.18, {
            ease: 'smooth'
          });
          this.scene.burst(x * 24 + 12, row * 24 + 12, 0x6bddff, 5);
        }
      }
      this.flash.alpha = 0.6;
      this.scene.tween(this.flash, { alpha: 0 }, 0.18, { ease: 'smooth' });
      this.scene.popup(
        frame.rows.length === 4
          ? 'TETRIS'
          : `${frame.rows.length} LINE${frame.rows.length > 1 ? 'S' : ''}`,
        120,
        350,
        0x7de8ff
      );
      this.cancelPhase = this.scene.after(0.2, () => {
        this.phase = 'settle';
        const survivors = frame.board
          .map((_, y) => y)
          .filter((y) => !frame.rows.includes(y));
        const collapsed = survivors.map((y) => frame.board[y]);
        while (collapsed.length < 20) collapsed.unshift(Array(10).fill(0));
        const origins = [...Array(frame.rows.length).fill(0), ...survivors];
        this.paintBoard(collapsed, origins);
        this.cancelPhase = this.scene.after(0.24, () => this.land());
      });
    });
    this.scene.invalidate();
  }
  private resetAnimation() {
    this.cancelPhase();
    this.landings.length = 0;
    this.phase = 'idle';
    this.position = '';
    this.shapeKey = this.boardKey = '';
    this.scene.cancel(this.active);
    this.scene.cancel(this.flash);
    this.flash.alpha = 0;
    this.blocks.forEach((block) => this.scene.cancel(block));
    this.activeBlocks.forEach((block) => this.scene.cancel(block));
  }
  snapshot() {
    return {
      phase: this.phase,
      queued: this.landings.length,
      x: +this.active.x.toFixed(2),
      y: +this.active.y.toFixed(2),
      board: this.blocks
        .filter((block) => block.visible)
        .map((block) => ({
          x: block.x,
          y: +block.y.toFixed(2),
          alpha: +block.alpha.toFixed(3)
        }))
    };
  }
  tick(dt: number) {
    this.scene.tick(dt);
  }
  dispose() {
    this.cancelPhase();
    this.landings.length = 0;
    this.scene.dispose();
  }
}
