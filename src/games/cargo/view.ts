import { Group, type Mesh } from 'three';
import type { Stage } from '../../core/stage';
import { cargoCorner, type CargoRun } from './model';
export class CargoView {
  private world = new Group();
  private courier = new Group();
  private crates: Group[] = [];
  private hint: Mesh;
  private level = -1;
  private signature = '';
  private delivered = 0;
  constructor(private stage: Stage) { stage.content.add(this.world); this.hint = stage.shape('ring', .42, 0xf2cd83); this.hint.rotation.x = -Math.PI / 2; this.hint.visible = false; }
  private box(w: number, h: number, d: number, color: number, parent: Group, x = 0, y = 0, z = 0) { const mesh = this.stage.box(w, h, d, color); mesh.position.set(x, y, z); parent.add(mesh); return mesh; }
  private position(cell: number, model: CargoRun) { return { x: cell % model.board.width - (model.board.width - 1) / 2, z: Math.floor(cell / model.board.width) - (model.board.height - 1) / 2 }; }
  private build(model: CargoRun) {
    this.world.clear();
    this.crates = [];
    this.level = model.level;
    this.signature = '';
    this.delivered = 0;
    const { width, height, floor, goals } = model.board;
    this.stage.framing('island', width + height * .65 + 1, height + 3);
    this.box(width + 1.3, .6, height + 1.3, 0x41686f, this.world, 0, -.5);
    this.box(width + 2.5, .08, height + 2.5, 0x4d8390, this.world, 0, -.86);
    for (let cell = 0; cell < width * height; cell++) {
      const p = this.position(cell, model), open = floor.includes(cell);
      this.box(.94, open ? .16 : .7, .94, open ? (cell % 2 ? 0xc8d6ba : 0xdde2c6) : 0x7c9c87, this.world, p.x, open ? -.1 : .18, p.z);
      if (goals.includes(cell)) {
        const ring = this.stage.shape('ring', .31, 0x74d5bb);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, .015, p.z);
        this.world.add(ring);
      }
    }
    for (const _cell of model.state.crates) {
      const parcel = new Group();
      this.box(.68, .66, .68, 0xd99b64, parcel, 0, .34);
      this.box(.12, .68, .7, 0xffdfa6, parcel, 0, .34);
      this.box(.7, .68, .12, 0xffdfa6, parcel, 0, .34);
      this.crates.push(parcel);
      this.world.add(parcel);
    }
    this.courier = new Group();
    this.box(.42, .43, .4, 0x579b96, this.courier, 0, .24);
    const head = this.stage.shape('sphere', .24, 0xefeddc);
    head.position.y = .64;
    this.courier.add(head);
    this.box(.34, .09, .06, 0x263f55, this.courier, 0, .64, .21);
    this.box(.48, .1, .48, 0xe7bd75, this.courier, 0, .84);
    this.world.add(this.courier);
    this.world.scale.setScalar(.9);
    this.stage.tween(this.world, { scale: 1 }, 'entry');
  }
  render(model: CargoRun) {
    if (model.level !== this.level)
      this.build(model);
    const signature = JSON.stringify(model.state);
    if (signature !== this.signature) {
      const first = !this.signature;
      this.signature = signature;
      const p = this.position(model.state.player, model);
      if (first)
        this.courier.position.set(p.x, 0, p.z);
      else
        this.stage.tween(this.courier, p, 'settle');
      model.state.crates.forEach((cell, i) => { const p = this.position(cell, model), parcel = this.crates[i]; if (first)
        parcel.position.set(p.x, 0, p.z);
      else
        this.stage.tween(parcel, p, 'settle'); const box = parcel.children[0] as Mesh; box.material = this.stage.material(model.board.goals.includes(cell) ? 0x8ed3af : 0xd99b64); });
      const delivered = model.state.crates.filter(c => model.board.goals.includes(c)).length;
      if (delivered > this.delivered) {
        this.courier.scale.setScalar(.9);
        this.stage.tween(this.courier, { scale: 1 }, 'score');
      }
      this.delivered = delivered;
      if (model.state.crates.some(c => cargoCorner(model.board, c))) {
        this.world.scale.setScalar(.97);
        this.stage.tween(this.world, { scale: 1 }, 'failure');
      }
    }
    this.hint.visible = !!model.hintDirection;
    if (model.hintDirection) {
      const d = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[model.hintDirection], p = this.position(model.state.player, model);
      this.hint.position.set(p.x + d[0], .08, p.z + d[1]);
    }
  }
}
