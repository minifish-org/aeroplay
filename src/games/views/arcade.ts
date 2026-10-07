import { PocketScene, type Point } from "../../core/phaser/pocket";
import { type Matrix, type Piece, SHAPES, collides } from "../models/tetris";

function face(
  scene: PocketScene,
  x: number,
  y: number,
  radius: number,
  color: number,
) {
  const g = scene.add.graphics();
  g.fillStyle(color).fillCircle(0, 0, radius);
  g.fillStyle(0xffffff)
    .fillCircle(-radius * 0.3, -radius * 0.12, radius * 0.22)
    .fillCircle(radius * 0.3, -radius * 0.12, radius * 0.22);
  g.fillStyle(0x29475b)
    .fillCircle(-radius * 0.26, -radius * 0.1, radius * 0.1)
    .fillCircle(radius * 0.34, -radius * 0.1, radius * 0.1);
  g.fillStyle(0xffb0a2, 0.7)
    .fillCircle(-radius * 0.65, radius * 0.3, radius * 0.17)
    .fillCircle(radius * 0.65, radius * 0.3, radius * 0.17);
  g.lineStyle(2, 0x29475b).lineBetween(
    -radius * 0.18,
    radius * 0.38,
    radius * 0.18,
    radius * 0.38,
  );
  return scene.add.container(x, y, [g]);
}

export class SnakeView {
  private readonly board;
  private readonly body;
  private readonly fruit;
  private readonly golden;
  private readonly eyes;
  private readonly cell: number;
  constructor(scene: PocketScene, size: number) {
    this.cell = 376 / size;
    this.board = scene.add.graphics();
    this.board.fillStyle(0xe7f3d7).fillRoundedRect(0, 0, 400, 400, 20);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        this.board
          .fillStyle((x + y) % 2 ? 0xd7ebc9 : 0xe1efd1)
          .fillRoundedRect(
            12 + x * this.cell,
            12 + y * this.cell,
            this.cell - 1,
            this.cell - 1,
            3,
          );
      }
    this.body = scene.add.graphics();
    this.eyes = scene.add.graphics();
    this.fruit = scene.add.container(0, 0, [
      scene.add.circle(0, 3, 8, 0xde5d6e),
      scene.add.circle(-2, -1, 7, 0xff8796),
      scene.add.ellipse(3, -9, 8, 5, 0x6ba877).setAngle(-35),
    ]);
    this.golden = scene.text(0, 0, "★", 26, "#d99734");
    if (!scene.reducedMotion)
      scene.tweens.add({
        targets: this.golden,
        scale: 1.2,
        duration: 650,
        yoyo: true,
        repeat: -1,
      });
  }
  render(
    segments: Point[],
    dir: Point,
    food: Point | null,
    bonus: Point | null,
  ) {
    this.body.clear();
    this.eyes.clear();
    segments.forEach((p, i) => {
      const x = 12 + p.x * this.cell,
        y = 12 + p.y * this.cell;
      this.body
        .fillStyle(0x5eae8b, 0.2)
        .fillRoundedRect(x + 1, y + 3, this.cell - 2, this.cell - 1, 6);
      this.body
        .fillStyle(
          i === segments.length - 1 ? 0x4cac82 : i % 2 ? 0x77cb9a : 0x94d9a8,
        )
        .fillRoundedRect(x + 1, y + 1, this.cell - 2, this.cell - 2, 6);
    });
    const h = segments.at(-1)!;
    for (const side of [-1, 1]) {
      const x = 12 + (h.x + 0.5) * this.cell + dir.x * 4 + dir.y * side * 4;
      const y = 12 + (h.y + 0.5) * this.cell + dir.y * 4 + dir.x * side * 4;
      this.eyes
        .fillStyle(0xffffff)
        .fillCircle(x, y, 3)
        .fillStyle(0x29475b)
        .fillCircle(x + dir.x, y + dir.y, 1.5);
    }
    this.fruit.setVisible(!!food);
    this.golden.setVisible(!!bonus);
    if (food)
      this.fruit.setPosition(
        12 + (food.x + 0.5) * this.cell,
        12 + (food.y + 0.5) * this.cell,
      );
    if (bonus)
      this.golden.setPosition(
        12 + (bonus.x + 0.5) * this.cell,
        12 + (bonus.y + 0.5) * this.cell,
      );
  }
  point(p: Point) {
    return { x: 12 + (p.x + 0.5) * this.cell, y: 12 + (p.y + 0.5) * this.cell };
  }
}

export class FlightView {
  private readonly bird;
  private readonly wing;
  private readonly gates;
  private readonly clouds;
  private readonly trail;
  constructor(private readonly scene: PocketScene) {
    const sky = scene.add.graphics();
    sky.fillStyle(0xd7f1fa).fillRect(0, 0, 360, 480);
    sky
      .fillStyle(0xfbefb3)
      .fillCircle(296, 58, 28)
      .fillStyle(0xfff5ce, 0.45)
      .fillCircle(296, 58, 40);
    this.clouds = Array.from({ length: 5 }, (_, i) => {
      const cloud = scene.add.graphics();
      cloud
        .fillStyle(0xffffff, 0.85)
        .fillEllipse(0, 4, 90, 24)
        .fillCircle(-20, 0, 16)
        .fillCircle(4, -7, 22)
        .fillCircle(27, 0, 15);
      return cloud.setPosition(i * 100, 80 + (i % 3) * 64);
    });
    const hills = scene.add.graphics();
    hills
      .fillStyle(0xb9ded0)
      .fillEllipse(65, 461, 340, 110)
      .fillStyle(0x9ecbaf)
      .fillEllipse(298, 482, 380, 118);
    hills
      .fillStyle(0xe9d7aa)
      .fillRect(0, 452, 360, 28)
      .fillStyle(0x77b88c)
      .fillRoundedRect(0, 447, 360, 8, 3);
    this.gates = scene.add.graphics();
    this.trail = scene.add.particles(82, 240, "spark", {
      lifespan: 350,
      speedX: { min: -70, max: -25 },
      speedY: { min: -10, max: 10 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.5, end: 0 },
      tint: 0xffffff,
      frequency: 70,
    });
    this.bird = face(scene, 82, 240, 15, 0xffce69);
    this.wing = scene.add.ellipse(-9, 5, 17, 11, 0xf3ad56).setAngle(-20);
    const beak = scene.add.triangle(13, 4, 0, 0, 13, 5, 0, 10, 0xec9364);
    this.bird.add([this.wing, beak]);
  }
  render(
    y: number,
    velocity: number,
    distance: number,
    pipes: { x: number; gapY: number; gap: number; scored: boolean }[],
    playing: boolean,
  ) {
    this.bird
      .setPosition(82, y)
      .setRotation(Math.max(-0.35, Math.min(0.8, velocity / 500)));
    this.wing.setAngle(-20 + Math.sin(distance * 0.15) * 22);
    this.clouds.forEach(
      (cloud, i) =>
        (cloud.x = ((((i * 110 - distance * 0.2) % 520) + 520) % 520) - 70),
    );
    this.trail.setPosition(72, y + 4);
    this.trail.emitting = playing && !this.scene.reducedMotion;
    this.gates.clear();
    for (const p of pipes) {
      for (const [top, height] of [
        [-15, p.gapY + 15],
        [p.gapY + p.gap, 480 - p.gapY - p.gap],
      ]) {
        this.gates.fillStyle(0x70bfab).fillRoundedRect(p.x, top, 54, height, 8);
        this.gates
          .fillStyle(0xa3ddbe)
          .fillRoundedRect(p.x + 6, top + 6, 9, height - 12, 4);
      }
      this.gates
        .fillStyle(0x3b957e)
        .fillRoundedRect(p.x - 4, p.gapY - 16, 62, 16, 6)
        .fillRoundedRect(p.x - 4, p.gapY + p.gap, 62, 16, 6);
      if (!p.scored)
        this.gates
          .lineStyle(2, 0xffc65f, 0.7)
          .strokeCircle(p.x + 27, p.gapY + p.gap / 2, 18);
    }
  }
}

export class TetrisView {
  private readonly colors = [
    0x67c9ec, 0x6d9be8, 0xffaf71, 0xffd667, 0x79d7ac, 0xb49aef, 0xff907d,
  ];
  private readonly blocks;
  private readonly previews;
  constructor(private readonly scene: PocketScene) {
    const bg = scene.add.graphics();
    bg.fillStyle(0xf0eaf8).fillRoundedRect(0, 0, 336, 480, 18);
    bg.fillStyle(0xe0d8ef).fillRoundedRect(0, 0, 240, 480, 10);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 10; x++)
        bg.fillStyle((x + y) % 2 ? 0xf5f0fc : 0xeee7f8).fillRoundedRect(
          x * 24 + 1,
          y * 24 + 1,
          22,
          22,
          4,
        );
    this.blocks = scene.add.graphics();
    this.previews = scene.add.graphics();
    scene.text(287, 25, "HOLD", 11);
    [1, 2, 3].forEach((i) =>
      scene.text(287, 120 + i * 82 - 82, `NEXT ${i}`, 11),
    );
  }
  private matrix(
    matrix: Matrix,
    x: number,
    y: number,
    cell: number,
    alpha = 1,
    graphics = this.blocks,
  ) {
    matrix.forEach((row, dy) =>
      row.forEach((value, dx) => {
        if (!value) return;
        const px = x + dx * cell,
          py = y + dy * cell;
        graphics
          .fillStyle(this.colors[value - 1], alpha)
          .fillRoundedRect(px + 1, py + 1, cell - 2, cell - 2, cell * 0.2);
        graphics
          .fillStyle(0xffffff, alpha * 0.4)
          .fillRoundedRect(px + 3, py + 3, cell - 6, 4, 2);
      }),
    );
  }
  render(board: Matrix, piece: Piece, held: number | null, next: number[]) {
    this.blocks.clear();
    this.previews.clear();
    this.matrix(board, 0, 0, 24);
    let ghost = piece.y;
    while (!collides(board, { ...piece, y: ghost + 1 })) ghost++;
    this.matrix(piece.matrix, piece.x * 24, ghost * 24, 24, 0.24);
    this.matrix(piece.matrix, piece.x * 24, piece.y * 24, 24);
    [held, ...next].forEach((id, i) => {
      if (id === null) return;
      this.matrix(
        SHAPES[id],
        257,
        i === 0 ? 46 : 140 + (i - 1) * 82,
        15,
        1,
        this.previews,
      );
    });
  }
  clearFeedback(lines: number) {
    this.scene.burst(120, 410, 0xb49aef, lines * 12);
    this.scene.toast(
      lines === 4
        ? "FOUR LINES!"
        : `${lines} ${lines === 1 ? "line" : "lines"}!`,
      120,
      350,
    );
  }
}

export class MazeView {
  private readonly walls;
  private readonly dots;
  private readonly hero;
  private readonly stars;
  private readonly home;
  private size = 8;
  constructor(private readonly scene: PocketScene) {
    scene.add
      .graphics()
      .fillStyle(0xeaf4e1)
      .fillRoundedRect(0, 0, 400, 400, 20);
    this.dots = scene.add.graphics();
    this.walls = scene.add.graphics();
    this.stars = [0, 1, 2].map(() => scene.text(0, 0, "★", 28, "#dba541"));
    this.home = scene.text(0, 0, "⌂", 35, "#399877");
    this.hero = face(scene, 0, 0, 14, 0xffbc89);
  }
  reset(
    size: number,
    grid: {
      walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
    }[][],
  ) {
    this.size = size;
    const c = 376 / size;
    this.walls.clear().lineStyle(Math.max(2, c * 0.07), 0x7cab92);
    grid.forEach((row, y) =>
      row.forEach(({ walls: w }, x) => {
        const px = 12 + x * c,
          py = 12 + y * c;
        if (w.top) this.walls.lineBetween(px, py, px + c, py);
        if (w.left) this.walls.lineBetween(px, py, px, py + c);
        if (x === size - 1 && w.right)
          this.walls.lineBetween(px + c, py, px + c, py + c);
        if (y === size - 1 && w.bottom)
          this.walls.lineBetween(px, py + c, px + c, py + c);
      }),
    );
    const p = this.center({ x: size - 1, y: size - 1 });
    this.home.setPosition(p.x, p.y).setFontSize(c * 0.75);
    this.hero.setScale(c / 45);
    this.render({ x: 0, y: 0 }, [], new Set(), [], false);
  }
  center(p: Point) {
    const c = 376 / this.size;
    return { x: 12 + (p.x + 0.5) * c, y: 12 + (p.y + 0.5) * c };
  }
  render(
    player: Point,
    stars: Point[],
    trail: Set<string>,
    path: Point[],
    animate = true,
  ) {
    const p = this.center(player);
    this.scene.tweens.killTweensOf(this.hero);
    if (animate && !this.scene.reducedMotion)
      this.scene.tweens.add({
        targets: this.hero,
        x: p.x,
        y: p.y,
        duration: 90,
        ease: "Sine.easeOut",
      });
    else this.hero.setPosition(p.x, p.y);
    this.stars.forEach((star, i) => {
      star.setVisible(!!stars[i]);
      if (stars[i]) {
        const p = this.center(stars[i]);
        star.setPosition(p.x, p.y).setFontSize((376 / this.size) * 0.62);
      }
    });
    this.dots.clear();
    for (const position of trail) {
      const [x, y] = position.split(",").map(Number),
        p = this.center({ x, y });
      this.dots.fillStyle(0xa4c8b6).fillCircle(p.x, p.y, 2.5);
    }
    for (const point of path) {
      const p = this.center(point);
      this.dots.fillStyle(0x69b8df).fillCircle(p.x, p.y, 4);
    }
  }
}
