import { CylinderGeometry, Group, Mesh } from 'three';
import type { Stage } from '../../core/stage';
import { disposePrintBackdrop, INK, printBackdrop } from '../../core/print';
import { cargoCorner, type CargoRun } from './model';

type Parcel = {
  root: Group; shell: Group; stamp: Group; body: Mesh;
  fromX: number; fromZ: number; toX: number; toZ: number;
  moved: boolean; docked: boolean; arriving: boolean;
};
type Dock = { cell: number; brackets: Mesh[] };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const settle = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const directions: Record<string, readonly [number, number]> = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

export class CargoView {
  private world = new Group();
  private backdrop: Group | null = null;
  private courier = new Group();
  private body = new Group();
  private legs: Group[] = [];
  private arms: Group[] = [];
  private crates: Parcel[] = [];
  private docks: Dock[] = [];
  private hint = new Group();
  private crane = new Group();
  private boat = new Group();
  private result = new Group();
  private cylinders = new Map<string, CylinderGeometry>();
  private state: CargoRun['state'] | null = null;
  private level = -1;
  private epoch = -1;
  private moves = -1;
  private playerCell = -1;
  private cells: number[] = [];
  private elapsed = 1;
  private duration = .22;
  private lifetime = .22;
  private fromX = 0;
  private fromZ = 0;
  private toX = 0;
  private toZ = 0;
  private pushing = false;
  private reversing = false;
  private rejection = .16;
  private rejectX = 0;
  private rejectZ = 0;

  constructor(private stage: Stage) {
    stage.content.add(this.world, this.hint);
    this.box(.35, .04, .065, INK.red, this.hint, -.11).rotation.y = -.65;
    this.box(.35, .04, .065, INK.red, this.hint, .11).rotation.y = .65;
    this.hint.visible = false;
  }

  private box(w: number, h: number, d: number, color: number, parent: Group, x = 0, y = 0, z = 0, finish: 'paper' | 'paint' | 'metal' = 'paint') {
    const mesh = this.stage.box(w, h, d, color, Math.min(.022, w / 5, h / 5, d / 5));
    mesh.material = this.stage.material(color, 0, finish);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private cylinder(radius: number, height: number, color: number, parent: Group, x: number, y: number, z: number) {
    const key = radius + ':' + height;
    let geometry = this.cylinders.get(key);
    if (!geometry) {
      geometry = new CylinderGeometry(radius, radius, height, 28);
      this.cylinders.set(key, geometry);
    }
    const mesh = new Mesh(geometry, this.stage.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private x(cell: number, model: CargoRun) { return cell % model.board.width - (model.board.width - 1) / 2; }
  private z(cell: number, model: CargoRun) { return Math.floor(cell / model.board.width) - (model.board.height - 1) / 2; }

  private receipt(parent: Group) {
    const stamp = new Group();
    this.box(.13, .024, .04, INK.red, stamp, -.045, 0, .025).rotation.y = -.7;
    this.box(.25, .024, .04, INK.red, stamp, .055, 0, -.015).rotation.y = .75;
    parent.add(stamp);
    return stamp;
  }

  private build(model: CargoRun) {
    this.world.clear();
    this.crates = [];
    this.docks = [];
    this.level = model.level;
    this.state = null;
    const { width, height, floor, goals } = model.board;
    this.stage.framing('island', width + .9, height + 1.1);
    if (this.backdrop) disposePrintBackdrop(this.backdrop);
    this.backdrop = printBackdrop(this.stage, 'harbor');
    this.box(width + .18, .53, height + .18, INK.black, this.world, 0, -.415);
    this.box(width + .09, .15, height + .09, INK.paper, this.world, 0, -.075, 0, 'paper');
    for (let cell = 0; cell < width * height; cell++) {
      const x = this.x(cell, model), z = this.z(cell, model);
      if (floor.includes(cell)) {
        this.box(.973, .035, .973, cell % 5 ? INK.paper : 0xdfd1b3, this.world, x, .0175, z, 'paper');
      } else {
        this.box(.965, .35, .965, INK.black, this.world, x, .21, z);
        this.box(.91, .035, .91, 0x454944, this.world, x, .402, z);
      }
      if (goals.includes(cell)) {
        const brackets: Mesh[] = [];
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
          brackets.push(this.box(.19, .025, .045, INK.red, this.world, x + dx * .36, .054, z + dz * .44));
          brackets.push(this.box(.045, .025, .19, INK.red, this.world, x + dx * .44, .054, z + dz * .36));
        }
        this.docks.push({ cell, brackets });
      }
    }
    for (const side of [-1, 1]) {
      for (let index = 0; index < 4; index++) {
        const z = -height / 2 + .5 + index * (height - 1) / 3;
        this.cylinder(.13, .20, INK.black, this.world, side * (width / 2 + .22), -.02, z);
        this.cylinder(.16, .035, INK.paper, this.world, side * (width / 2 + .22), .098, z);
      }
      for (let index = 0; index < 8; index++) {
        const wave = new Group();
        wave.position.set(side * (width / 2 + .55 + index % 2 * .22), -.61, -height / 2 + index * height / 7);
        this.box(.35, .016, .025, INK.paper, wave, -.13).rotation.y = -.2;
        this.box(.20, .016, .025, INK.paper, wave, .14, 0, .02).rotation.y = .3;
        this.world.add(wave);
      }
    }
    this.buildMargins();
    for (const _cell of model.state.crates) {
      const root = new Group(), shell = new Group();
      root.add(shell);
      const body = this.box(.72, .67, .72, 0xb28c4d, shell, 0, .37, 0, 'paper');
      this.box(.69, .025, .69, 0xdbb678, shell, 0, .718, 0, 'paper');
      for (const side of [-1, 1]) {
        this.box(.70, .033, .04, 0x715b37, shell, 0, .744, side * .31, 'paper');
        this.box(.04, .033, .70, 0x715b37, shell, side * .31, .744, 0, 'paper');
        this.box(.83, .022, .04, 0x715b37, shell, 0, .755, 0, 'paper').rotation.y = side * Math.PI / 4;
        this.box(.58, .04, .024, 0x715b37, shell, 0, .37, .372, 'paper').rotation.z = side * Math.PI / 4;
      }
      const stamp = this.receipt(shell);
      stamp.position.set(.17, .78, .17);
      this.world.add(root);
      this.crates.push({ root, shell, stamp, body, fromX: 0, fromZ: 0, toX: 0, toZ: 0, moved: false, docked: false, arriving: false });
    }
    this.buildCourier();
    this.result = new Group();
    for (const side of [-1, 1]) {
      this.box(width + .1, .022, .035, INK.red, this.result, 0, .045, side * (height / 2 + .08));
      this.box(.035, .022, height + .1, INK.red, this.result, side * (width / 2 + .08), .045);
    }
    this.world.add(this.result);
  }

  private buildMargins() {
    this.crane = new Group();
    this.world.add(this.crane);
    this.box(.20, 2.2, .24, INK.black, this.crane, 0, .45);
    this.box(2.0, .15, .20, INK.black, this.crane, .64, 1.52).rotation.z = -.19;
    this.box(.023, .85, .023, INK.black, this.crane, 1.5, 1.0);
    this.box(.34, .37, .34, 0xb28c4d, this.crane, 1.5, .45, 0, 'paper');
    this.boat = new Group();
    this.world.add(this.boat);
    this.box(.76, .22, 2.55, INK.black, this.boat, 0, -.35);
    this.box(.64, .12, 2.30, INK.paper, this.boat, 0, -.19);
    this.box(.5, .32, .65, INK.red, this.boat, 0, .03, .38);
    this.box(.18, .55, .18, INK.black, this.boat, 0, .45, .42);
    // Margin silhouettes never cast across the puzzle cells.
    this.crane.traverse(mesh => { mesh.castShadow = false; });
    this.boat.traverse(mesh => { mesh.castShadow = false; });
  }

  private buildCourier() {
    this.courier = new Group();
    this.body = new Group();
    this.legs = [];
    this.arms = [];
    this.courier.add(this.body);
    for (const x of [-.11, .11]) {
      const hip = new Group();
      hip.position.set(x, .30, 0);
      this.box(.13, .26, .16, INK.black, hip, 0, -.12);
      this.box(.15, .085, .23, INK.black, hip, 0, -.25, .035);
      this.body.add(hip);
      this.legs.push(hip);
    }
    this.box(.36, .40, .28, INK.red, this.body, 0, .49);
    this.box(.50, .11, .31, INK.red, this.body, 0, .67);
    for (const x of [-.24, .24]) {
      const arm = new Group();
      arm.position.set(x, .63, .09);
      this.box(.11, .32, .13, INK.red, arm, 0, -.12);
      this.box(.11, .10, .13, INK.paper, arm, 0, -.29, .11);
      this.body.add(arm);
      this.arms.push(arm);
    }
    this.cylinder(.135, .19, INK.paper, this.body, 0, .84, -.015);
    this.box(.33, .055, .29, INK.white, this.body, 0, .975, -.015, 'paper');
    this.box(.33, .023, .16, INK.black, this.body, 0, .947, .17);
    this.box(.23, .018, .20, INK.red, this.body, 0, 1.009, -.015);
    this.world.add(this.courier);
  }

  private sync(model: CargoRun) {
    const first = !this.state;
    const forward = !first && model.epoch === this.epoch && model.moves === this.moves + 1;
    const reverse = !first && model.epoch !== this.epoch && model.moves === this.moves - 1;
    const transition = forward || reverse;
    this.pushing = forward && model.state.crates.some((cell, index) => cell !== this.cells[index]);
    this.reversing = reverse;
    this.duration = this.pushing ? .28 : reverse ? .24 : .22;
    this.toX = this.x(model.state.player, model);
    this.toZ = this.z(model.state.player, model);
    // Rapid inputs finish the old step before starting the next grid-aligned step.
    this.fromX = transition ? this.x(this.playerCell, model) : this.toX;
    this.fromZ = transition ? this.z(this.playerCell, model) : this.toZ;
    if (transition) {
      const sign = reverse ? -1 : 1;
      this.courier.rotation.y = Math.atan2((this.toX - this.fromX) * sign, (this.toZ - this.fromZ) * sign);
    } else this.courier.rotation.y = 0;
    let receipt = false;
    model.state.crates.forEach((cell, index) => {
      const parcel = this.crates[index];
      parcel.toX = this.x(cell, model);
      parcel.toZ = this.z(cell, model);
      parcel.fromX = transition ? this.x(this.cells[index], model) : parcel.toX;
      parcel.fromZ = transition ? this.z(this.cells[index], model) : parcel.toZ;
      parcel.moved = transition && cell !== this.cells[index];
      parcel.docked = model.board.goals.includes(cell);
      parcel.arriving = forward && parcel.moved && parcel.docked;
      parcel.body.material = this.stage.material(cargoCorner(model.board, cell) ? 0xb78149 : 0xb28c4d, 0, 'paper');
      receipt ||= parcel.arriving;
    });
    this.lifetime = this.duration + (receipt ? .24 : this.pushing ? .08 : 0);
    this.elapsed = transition && !this.stage.reducedMotion ? 0 : this.lifetime;
    this.rejection = .16;
    this.state = model.state;
    this.epoch = model.epoch;
    this.moves = model.moves;
    this.playerCell = model.state.player;
    this.cells = [...model.state.crates];
  }

  render(model: CargoRun, dt = 0) {
    if (this.level !== model.level) this.build(model);
    if (model.state !== this.state) this.sync(model);
    if (model.mode !== 'paused') {
      this.elapsed = Math.min(this.lifetime, this.elapsed + Math.max(0, dt));
      this.rejection = Math.min(.16, this.rejection + Math.max(0, dt));
    }
    const brace = this.pushing ? .04 : 0;
    const step = clamp((this.elapsed - brace) / (this.duration - brace));
    const travel = settle(step), stride = Math.sin(step * Math.PI * 2) * (this.reversing ? -1 : 1);
    const reach = this.pushing ? settle(this.elapsed / .04) * (1 - settle((this.elapsed - this.duration) / .08)) : 0;
    this.courier.position.set(this.fromX + (this.toX - this.fromX) * travel, .035, this.fromZ + (this.toZ - this.fromZ) * travel);
    this.body.rotation.x = this.pushing ? reach * .06 : Math.sin(step * Math.PI) * (this.reversing ? -.045 : .045);
    const rejected = this.stage.reducedMotion ? 0 : Math.sin(this.rejection / .16 * Math.PI);
    this.body.position.set(this.rejectX * rejected, 0, this.rejectZ * rejected);
    this.legs[0].rotation.x = stride * .40;
    this.legs[1].rotation.x = -stride * .40;
    this.arms.forEach(arm => { arm.position.z = .09 + reach * .22; arm.rotation.x = -.18 - reach * .62; });
    const receipt = settle((this.elapsed - this.duration) / .24);
    this.crates.forEach(parcel => {
      parcel.root.position.set(parcel.fromX + (parcel.toX - parcel.fromX) * travel, 0, parcel.fromZ + (parcel.toZ - parcel.fromZ) * travel);
      const weight = parcel.moved ? Math.sin(step * Math.PI) * .018 : 0;
      parcel.shell.rotation.x = -(parcel.toZ - parcel.fromZ) * weight;
      parcel.shell.rotation.z = (parcel.toX - parcel.fromX) * weight;
      parcel.stamp.visible = parcel.docked && (!parcel.arriving || receipt > 0);
      parcel.stamp.scale.setScalar(parcel.arriving ? Math.max(.001, receipt) : 1);
    });
    this.docks.forEach(dock => {
      const index = model.state.crates.indexOf(dock.cell), parcel = index >= 0 ? this.crates[index] : null;
      const occupied = !!parcel && (!parcel.moved || step === 1);
      dock.brackets.forEach(bracket => { bracket.material = this.stage.material(occupied ? INK.blue : INK.red); });
    });
    this.result.visible = model.mode === 'won';
    this.result.position.y = model.mode === 'won' ? Math.sin(receipt * Math.PI) * .025 : 0;
    this.hint.visible = !!model.hintDirection;
    if (model.hintDirection) {
      const d = directions[model.hintDirection];
      this.hint.position.set(this.toX + d[0], .075, this.toZ + d[1]);
      this.hint.rotation.y = Math.atan2(d[0], d[1]);
    }
    const margin = Math.max(.16, this.stage.bounds().right - model.board.width / 2 - .1);
    this.boat.scale.x = Math.min(1, margin * .62 / .85);
    this.boat.rotation.y = -.22 * Math.min(1, Math.max(0, margin - 1));
    this.boat.position.set(model.board.width / 2 + .1 + margin * .55, 0, model.board.height / 2 - 1.5);
    this.crane.scale.x = Math.min(1, margin / 2.5);
    this.crane.position.set(model.board.width / 2 + .1 + margin * .45, 0, -model.board.height / 2 + .5);
  }

  get animating() { return this.elapsed < this.lifetime || this.rejection < .16; }

  bump(input: unknown, _model: CargoRun) {
    const d = directions[input as string];
    if (!d || this.stage.reducedMotion) return;
    const angle = this.courier.rotation.y;
    this.rejectX = (d[0] * Math.cos(angle) - d[1] * Math.sin(angle)) * .075;
    this.rejectZ = (d[0] * Math.sin(angle) + d[1] * Math.cos(angle)) * .075;
    this.rejection = 0;
  }
}
