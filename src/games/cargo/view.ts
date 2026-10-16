import { Group, type Mesh } from 'three';
import type { Stage } from '../../core/stage';
import { disposePrintBackdrop, INK, printBackdrop } from '../../core/print';
import { cargoCorner, type CargoRun } from './model';

type Parcel = { root: Group; shell: Group; stamp: Group; body: Mesh };
type Dock = { cell: number; brackets: Mesh[]; stamp: Group };

export class CargoView {
  private world = new Group();
  private backdrop: Group | null = null;
  private courier = new Group();
  private courierBody = new Group();
  private legs: Mesh[] = [];
  private crates: Parcel[] = [];
  private docks: Dock[] = [];
  private hint = new Group();
  private crane = new Group();
  private boat = new Group();
  private level = -1;
  private signature = '';
  private moves = -1;
  private crateCells: number[] = [];
  private playerCell = -1;

  constructor(private stage: Stage) {
    stage.content.add(this.world, this.hint);
    const left = this.box(.36, .035, .065, INK.red, this.hint, -.11, 0, 0);
    const right = this.box(.36, .035, .065, INK.red, this.hint, .11, 0, 0);
    left.rotation.y = -.65;
    right.rotation.y = .65;
    this.hint.visible = false;
  }

  private box(w: number, h: number, d: number, color: number, parent: Group, x = 0, y = 0, z = 0) {
    const mesh = this.stage.box(w, h, d, color, .008);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private position(cell: number, model: CargoRun) {
    return { x: cell % model.board.width - (model.board.width - 1) / 2, z: Math.floor(cell / model.board.width) - (model.board.height - 1) / 2 };
  }

  private deliveredStamp(parent: Group, x: number, y: number, z: number, size: number) {
    const stamp = new Group();
    stamp.position.set(x, y, z);
    const short = this.box(size * .45, .018, size * .12, INK.red, stamp, -size * .23, 0, size * .05);
    short.rotation.y = -.7;
    const long = this.box(size * .85, .018, size * .12, INK.red, stamp, size * .13, 0, -size * .06);
    long.rotation.y = .72;
    parent.add(stamp);
    return stamp;
  }

  private build(model: CargoRun) {
    this.world.clear();
    this.crates = [];
    this.docks = [];
    this.level = model.level;
    this.signature = '';
    this.moves = -1;
    const { width, height, floor, goals } = model.board;
    this.stage.framing('island', width + .9, height + 1.1);
    if (this.backdrop)
      disposePrintBackdrop(this.backdrop);
    this.backdrop = printBackdrop(this.stage, 'harbor');

    const underMap = this.box(width + .23, .035, height + .3, 0xd3be93, this.world, .02, -.25, .035);
    underMap.rotation.y = -.012;
    this.box(width + .12, .19, height + .12, INK.black, this.world, 0, -.15);
    this.box(width + .06, .04, height + .06, INK.paper, this.world, 0, -.035);
    for (let cell = 0; cell < width * height; cell++) {
      const p = this.position(cell, model), open = floor.includes(cell);
      if (open) {
        this.box(.955, .05, .955, cell % 5 === 0 ? 0xe4d6b9 : INK.paper, this.world, p.x, -.006, p.z);
        if (cell % 7 === 2)
          this.box(.36, .006, .018, 0xc8b695, this.world, p.x + .12, .022, p.z + .3);
      }
      else {
        this.box(.96, .27, .96, INK.black, this.world, p.x, .12, p.z).castShadow = false;
        this.box(.89, .018, .89, 0x363830, this.world, p.x - .02, .264, p.z - .02).castShadow = false;
        this.box(.018, .026, .8, 0x8b8974, this.world, p.x - .455, .268, p.z).castShadow = false;
      }
      if (goals.includes(cell)) {
        const brackets: Mesh[] = [];
        for (const x of [-1, 1])
          for (const z of [-1, 1]) {
            brackets.push(this.box(.19, .026, .045, INK.red, this.world, p.x + x * .355, .035, p.z + z * .43));
            brackets.push(this.box(.045, .026, .19, INK.red, this.world, p.x + x * .43, .035, p.z + z * .355));
          }
        const stamp = this.deliveredStamp(this.world, p.x, .037, p.z, .33);
        stamp.visible = false;
        this.docks.push({ cell, brackets, stamp });
      }
    }

    // Harbor details stay outside the map; none of them can cover a playable cell.
    for (const side of [-1, 1]) {
      for (let index = 0; index < 5; index++) {
        const z = -height / 2 + .4 + index * (height - .8) / 4;
        this.box(.19, .16, .19, INK.black, this.world, side * (width / 2 + .2), -.05, z);
        this.box(.23, .028, .23, INK.paper, this.world, side * (width / 2 + .2), .045, z);
      }
      for (let index = 0; index < 13; index++) {
        const x = side * (width / 2 + .22 + index % 3 * .17), z = -height / 2 - .5 + index * .67;
        const wave = this.box(.27 + index % 3 * .12, .012, .025, INK.paper, this.world, x, -.32, z);
        wave.rotation.y = index % 2 ? .15 : -.12;
        const tip = this.box(.16, .012, .025, INK.paper, this.world, x + .24, -.32, z - .04);
        tip.rotation.y = -.45;
      }
    }
    const crane = this.crane = new Group();
    this.world.add(crane);
    this.box(.16, 1.9, .18, INK.black, crane, 0, .95);
    const boom = this.box(2.1, .15, .18, INK.black, crane, .7, 1.8);
    boom.rotation.z = -.32;
    this.box(.025, 1, .025, INK.black, crane, 1.5, 1.15);
    this.box(.43, .4, .43, 0xbd8b43, crane, 1.5, .5);
    const boat = this.boat = new Group();
    this.world.add(boat);
    this.box(.85, .13, 2.9, INK.black, boat);
    this.box(.67, .15, 2.42, INK.paper, boat, 0, .08);
    this.box(.55, .28, .67, INK.red, boat, 0, .25, .45);
    this.box(.2, .6, .2, INK.black, boat, 0, .56, .5);
    for (const detail of [boat, crane])
      detail.traverse(object => { if ('castShadow' in object) object.castShadow = false; });

    for (const _cell of model.state.crates) {
      const root = new Group(), shell = new Group();
      root.add(shell);
      const body = this.box(.66, .57, .66, 0xc39c58, shell, 0, .3);
      this.box(.6, .025, .6, 0xe1bf7e, shell, 0, .598);
      for (const side of [-1, 1]) {
        this.box(.66, .025, .045, INK.black, shell, 0, .615, side * .29);
        this.box(.045, .025, .66, INK.black, shell, side * .29, .615);
        const cross = this.box(.72, .026, .045, INK.black, shell, 0, .62);
        cross.rotation.y = side * Math.PI / 4;
        const front = this.box(.055, .62, .018, 0x705b35, shell, 0, .3, .34);
        front.rotation.z = side * Math.PI / 4;
      }
      const stamp = this.deliveredStamp(shell, .17, .64, .18, .22);
      stamp.visible = false;
      this.world.add(root);
      this.crates.push({ root, shell, stamp, body });
    }

    this.courier = new Group();
    this.courierBody = new Group();
    this.courierBody.scale.y = .82;
    this.courier.add(this.courierBody);
    this.legs = [-1, 1].map(side => this.box(.1, .17, .13, INK.black, this.courierBody, side * .075, .11, .015));
    this.box(.29, .31, .25, INK.red, this.courierBody, 0, .33);
    this.box(.36, .085, .27, INK.red, this.courierBody, 0, .45);
    const leftArm = this.box(.11, .25, .14, INK.red, this.courierBody, -.21, .31, .045);
    const rightArm = this.box(.11, .25, .14, INK.red, this.courierBody, .21, .31, .045);
    leftArm.rotation.z = -.15;
    rightArm.rotation.z = .15;
    this.box(.2, .16, .18, INK.paper, this.courierBody, 0, .565);
    this.box(.25, .045, .25, INK.white, this.courierBody, 0, .665);
    this.box(.25, .028, .11, INK.black, this.courierBody, 0, .644, .14);
    this.box(.18, .07, .018, INK.paper, this.courierBody, 0, .39, .134);
    this.world.add(this.courier);
  }

  render(model: CargoRun) {
    if (model.level !== this.level)
      this.build(model);
    // Fit graphic harbor margins to spare camera space, keeping the map unchanged.
    const { width, height } = model.board;
    const margin = Math.max(.16, this.stage.bounds().right - width / 2 - .1);
    this.boat.scale.x = Math.min(1, margin * .62 / .85);
    this.boat.rotation.y = -.22 * Math.min(1, Math.max(0, margin - 1));
    this.boat.position.set(width / 2 + .1 + margin * .55, -.25, height / 2 - 1.5);
    this.crane.scale.x = Math.min(1, margin / 2.5);
    this.crane.position.set(width / 2 + .1 + margin * .45, -.2, -height / 2 + .5);
    const signature = JSON.stringify(model.state);
    if (signature !== this.signature) {
      const first = !this.signature, forward = !first && model.moves > this.moves;
      this.signature = signature;
      const p = this.position(model.state.player, model), previous = first ? p : this.position(this.playerCell, model);
      const dx = p.x - previous.x, dz = p.z - previous.z;
      if (first)
        this.courier.position.set(p.x, 0, p.z);
      else {
        this.stage.tween(this.courier, p, 'settle');
        if (dx || dz)
          this.courier.rotation.y = Math.atan2(dx, dz);
        this.courierBody.rotation.x = .12;
        this.stage.tween(this.courierBody, { rx: 0 }, 'settle');
        this.legs.forEach((leg, index) => {
          leg.rotation.x = (index ? -1 : 1) * .28 * (model.moves % 2 ? 1 : -1);
          this.stage.tween(leg, { rx: 0 }, 'settle');
        });
      }
      model.state.crates.forEach((cell, index) => {
        const p = this.position(cell, model), parcel = this.crates[index], docked = model.board.goals.includes(cell);
        if (first)
          parcel.root.position.set(p.x, 0, p.z);
        else {
          this.stage.tween(parcel.root, p, 'settle');
          if (cell !== this.crateCells[index]) {
            const previous = this.position(this.crateCells[index], model);
            parcel.shell.rotation.x = (p.z - previous.z) * -.035;
            parcel.shell.rotation.z = (p.x - previous.x) * .035;
            this.stage.tween(parcel.shell, { rx: 0, rz: 0 }, 'settle');
            if (docked && forward) {
              parcel.stamp.scale.setScalar(.65);
              this.stage.tween(parcel.stamp, { scale: 1 }, 'score');
            }
          }
        }
        parcel.stamp.visible = docked;
        parcel.body.material = this.stage.material(cargoCorner(model.board, cell) ? 0xb78149 : 0xc39c58);
      });
      this.docks.forEach(dock => {
        const occupied = model.state.crates.includes(dock.cell);
        dock.brackets.forEach(bracket => { bracket.material = this.stage.material(occupied ? INK.blue : INK.red); });
        dock.stamp.visible = occupied;
      });
      this.crateCells = [...model.state.crates];
      this.playerCell = model.state.player;
      this.moves = model.moves;
    }
    this.hint.visible = !!model.hintDirection;
    if (model.hintDirection) {
      const d = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[model.hintDirection], p = this.position(model.state.player, model);
      this.hint.position.set(p.x + d[0], .07, p.z + d[1]);
      this.hint.rotation.y = Math.atan2(d[0], d[1]);
    }
  }

  bump(input: unknown, model: CargoRun) {
    const d = ({ up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] } as Record<string, number[]>)[input as string];
    if (!d || this.stage.reducedMotion)
      return;
    const angle = -this.courier.rotation.y;
    this.courierBody.position.set((d[0] * Math.cos(angle) + d[1] * Math.sin(angle)) * .1, 0, (-d[0] * Math.sin(angle) + d[1] * Math.cos(angle)) * .1);
    this.stage.tween(this.courierBody, { x: 0, z: 0, rx: 0 }, 'failure');
    void model;
  }
}
