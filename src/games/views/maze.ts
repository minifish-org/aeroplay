import { Container, Graphics, Sprite } from 'pixi.js';
import { starTexture } from '../../core/pixi/materials';
import { panel, PixiScene } from '../../core/pixi/scene';
type Point = { x: number; y: number };
type Cell = {
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
};

export class MazeView {
  readonly scene: PixiScene;
  private readonly walls = new Graphics();
  private readonly route = new Graphics();
  private readonly traveler = new Container();
  private readonly portal = new Container();
  private readonly stars: Sprite[] = [];
  private readonly gem;
  private grid?: Cell[][];
  private position = '';
  private collected = 0;
  private finished = false;
  constructor(canvas: HTMLCanvasElement) {
    this.scene = new PixiScene(canvas, 360, 360, true);
    panel(this.scene, 1);
    this.gem = starTexture(this.scene);
    this.portal.addChild(
      new Graphics()
        .circle(0, 0, 12)
        .fill({ color: 0x45e0bd, alpha: 0.16 })
        .circle(0, 0, 9)
        .stroke({ color: 0x64edce, width: 2 })
        .circle(0, 0, 5)
        .stroke({ color: 0xadffe5, width: 1 })
    );
    this.traveler.addChild(
      new Graphics()
        .circle(0, 0, 11)
        .fill({ color: 0x70d5ff, alpha: 0.15 })
        .circle(0, 0, 7)
        .fill(0xe6f9ff)
        .stroke({ color: 0x70e0ff, width: 2 })
        .circle(-2, -2, 2)
        .fill(0xffffff)
    );
    this.scene.world.addChild(
      this.walls,
      this.route,
      this.portal,
      this.traveler
    );
  }
  draw(
    grid: Cell[][],
    player: Point,
    stars: Point[],
    trail: Set<string>,
    path: Point[],
    showTrail: boolean,
    collected: number,
    finished: boolean
  ) {
    const size = grid.length,
      c = 356 / size;
    if (this.grid !== grid) {
      this.walls.clear();
      const trace = () => {
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++) {
            const walls = grid[y][x].walls,
              px = 2 + x * c,
              py = 2 + y * c;
            if (walls.top) this.walls.moveTo(px, py).lineTo(px + c, py);
            if (walls.left) this.walls.moveTo(px, py).lineTo(px, py + c);
            if (x === size - 1 && walls.right)
              this.walls.moveTo(px + c, py).lineTo(px + c, py + c);
            if (y === size - 1 && walls.bottom)
              this.walls.moveTo(px, py + c).lineTo(px + c, py + c);
          }
      };
      trace();
      this.walls.stroke({ color: 0x051024, width: 5 });
      trace();
      this.walls.stroke({ color: 0x4a799a, width: 2.2 });
      trace();
      this.walls.stroke({ color: 0xa5c5e4, width: 0.65, alpha: 0.8 });
      this.grid = grid;
      this.position = '';
      this.collected = 0;
      this.finished = false;
    }
    this.route.clear();
    if (showTrail)
      for (const position of trail) {
        const [x, y] = position.split(',').map(Number);
        this.route
          .circle(2 + (x + 0.5) * c, 2 + (y + 0.5) * c, 2)
          .fill({ color: 0x4e789d, alpha: 0.65 });
      }
    for (const p of path)
      this.route
        .circle(2 + (p.x + 0.5) * c, 2 + (p.y + 0.5) * c, 3)
        .fill(0x6cdbff);
    stars.forEach((p, i) => {
      let star = this.stars[i];
      if (!star) {
        star = new Sprite(this.gem);
        star.anchor.set(0.5);
        this.scene.world.addChild(star);
        this.stars.push(star);
      }
      star.visible = true;
      star.width = star.height = c * 0.65;
      star.position.set(2 + (p.x + 0.5) * c, 2 + (p.y + 0.5) * c);
    });
    this.stars.slice(stars.length).forEach((star) => {
      star.visible = false;
    });
    this.portal.position.set(2 + (size - 0.5) * c, 2 + (size - 0.5) * c);
    this.portal.scale.set(c / 36);
    this.traveler.scale.set(c / 36);
    const position = `${player.x},${player.y}`;
    if (position !== this.position) {
      this.scene.tween(
        this.traveler,
        { x: 2 + (player.x + 0.5) * c, y: 2 + (player.y + 0.5) * c },
        this.position ? 0.09 : 0
      );
      this.position = position;
    }
    if (collected > this.collected)
      this.scene.burst(
        2 + (player.x + 0.5) * c,
        2 + (player.y + 0.5) * c,
        0xffd368,
        20
      );
    if (finished && !this.finished) {
      this.scene.ripple(this.portal.x, this.portal.y);
      this.scene.burst(this.portal.x, this.portal.y, 0x69edcd, 50);
      this.scene.popup('ESCAPED', 180, 170, 0x91f5de);
    }
    this.collected = collected;
    this.finished = finished;
    this.scene.invalidate();
  }
  tick(dt: number) {
    this.scene.tick(dt);
  }
  dispose() {
    this.scene.dispose();
  }
}
