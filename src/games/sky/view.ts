import { CircleGeometry, Color, CurvePath, ExtrudeGeometry, Fog, Group, Mesh, QuadraticBezierCurve3, Shape, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import { LANE_WIDTH, type SkyRun } from './model';

type Relief = { group: Group; face: Mesh; x: number; z: number; index: number };
type Cloud = { group: Group; z: number };
const ENCOUNTER_Z = 2;

export class SkyView {
  private pose = new Group();
  private ship = new Group();
  private wings = new Group();
  private flame: Mesh;
  private tails = new Group();
  private shield = new Group();
  private shieldPieces: Mesh[] = [];
  private collection = new Group();
  private sun: Mesh;
  private reliefs: Relief[] = [];
  private clouds: Cloud[] = [];
  private laneMarks: { mesh: Mesh; z: number }[] = [];
  private rows: { ring: Group; barriers: Group[] }[] = [];
  private epoch = -1;
  private sector = 0;
  private mode = '';
  private rings = 0;
  private lastShield = 1;
  private shieldBreak = 0;
  private collectionTime = 0;
  private ready = false;

  constructor(private stage: Stage) {
    stage.framing('flight', 10.5, 10);
    printBackdrop(stage, 'air');
    const sunMaterial = stage.material(INK.red).clone();
    sunMaterial.fog = false;
    this.sun = new Mesh(new CircleGeometry(17, 64), sunMaterial);
    this.sun.position.set(26, 37, -110);
    stage.content.add(this.sun);
    this.buildClouds();
    this.buildRelief();
    this.buildLanes();
    this.buildShip();
    this.flame = this.plate([[0, -.02], [.14, .3], [0, .68], [-.14, .3]], INK.red, .025, this.ship, 0, .035, .65);
    for (const x of [-.48, .48]) {
      const tail = stage.box(.035, .025, 2.8, INK.paper, .005);
      tail.position.set(x, -.025, 2.1);
      tail.castShadow = false;
      this.tails.add(tail);
    }
    this.ship.add(this.tails, this.shield);
    this.pose.add(this.ship);
    stage.content.add(this.pose);
    for (let index = 0; index < 8; index++) {
      const piece = new Mesh(new TorusGeometry(1.04, .022, 5, 10, Math.PI / 5), stage.material(INK.paper));
      piece.rotation.set(Math.PI / 2, 0, index * Math.PI / 4);
      piece.castShadow = false;
      this.shield.add(piece);
      this.shieldPieces.push(piece);
    }
    this.shield.position.y = .055;
    const flash = new Mesh(new TorusGeometry(.94, .045, 6, 48), stage.material(INK.yellow));
    this.collection.add(flash);
    this.collection.visible = false;
    stage.content.add(this.collection);
    for (let index = 0; index < 14; index++) {
      const ring = new Group();
      for (const [radius, stroke, color, z] of [[.97, .105, INK.black, 0], [.95, .09, INK.yellow, .055]]) {
        const hoop = new Mesh(new TorusGeometry(radius, stroke, 8, 48), stage.material(color, color === INK.yellow ? INK.yellow : 0));
        hoop.position.z = z;
        hoop.castShadow = false;
        ring.add(hoop);
      }
      for (const x of [-1.14, 1.14]) {
        const registration = stage.box(.13, .045, .035, INK.yellow, .005);
        registration.position.x = x;
        registration.castShadow = false;
        ring.add(registration);
      }
      const barriers: Group[] = [];
      for (let lane = 0; lane < 3; lane++) {
        const barrier = new Group();
        const backing = stage.box(2.36, 2.36, .18, INK.black, .015);
        barrier.add(backing);
        for (const angle of [-Math.PI / 4, Math.PI / 4]) {
          const cross = stage.box(2.6, .38, .2, INK.red, .015);
          cross.position.z = .16;
          cross.rotation.z = angle;
          barrier.add(cross);
        }
        barrier.position.x = (lane - 1) * LANE_WIDTH;
        stage.content.add(barrier);
        barriers.push(barrier);
      }
      stage.content.add(ring);
      this.rows.push({ ring, barriers });
    }
  }

  private plate(points: number[][], color: number, depth: number, parent: Group, x = 0, y = 0, z = 0) {
    const shape = new Shape();
    points.forEach(([px, pz], index) => index ? shape.lineTo(px, pz) : shape.moveTo(px, pz));
    shape.closePath();
    const mesh = new Mesh(new ExtrudeGeometry(shape, { depth, bevelEnabled: false }), [this.stage.material(color), this.stage.material(INK.black)]);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private buildShip() {
    this.plate([[0, -1.06], [.14, -.25], [.17, .6], [0, .48], [-.17, .6], [-.14, -.25]], INK.paper, .12, this.ship, 0, .1);
    this.plate([[0, -.82], [.86, .76], [.2, .37], [0, .47]], INK.paper, .055, this.wings, 0, .06);
    this.plate([[0, -.82], [-.86, .76], [-.2, .37], [0, .47]], INK.paper, .055, this.wings, 0, .06);
    this.plate([[.36, .19], [.71, .63], [.54, .54]], INK.red, .008, this.wings, 0, .075);
    this.plate([[-.36, .19], [-.71, .63], [-.54, .54]], INK.red, .008, this.wings, 0, .075);
    this.plate([[0, -.52], [.09, -.03], [0, .2], [-.09, -.03]], INK.black, .065, this.ship, 0, .17);
    this.ship.add(this.wings);
  }

  private cloudShape(width: number, height: number, color: number) {
    const shape = new Shape();
    shape.moveTo(-width / 2, 0);
    shape.quadraticCurveTo(-width * .48, height * .64, -width * .31, height * .46);
    shape.quadraticCurveTo(-width * .28, height * 1.18, -width * .08, height * .82);
    shape.quadraticCurveTo(width * .06, height * 1.36, width * .2, height * .64);
    shape.quadraticCurveTo(width * .43, height * .94, width / 2, 0);
    shape.closePath();
    const cloud = new Mesh(new ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false, curveSegments: 9 }), this.stage.material(color));
    cloud.castShadow = false;
    return cloud;
  }

  private cloudEngraving(width: number, height: number) {
    const group = new Group();
    for (const scale of [.91, .76, .61]) {
      const w = width * scale, h = height * scale, path = new CurvePath<Vector3>();
      const points = [
        [-w / 2, 0], [-w * .48, h * .64], [-w * .31, h * .46],
        [-w * .28, h * 1.18], [-w * .08, h * .82],
        [w * .06, h * 1.36], [w * .2, h * .64], [w * .43, h * .94], [w / 2, 0],
      ].map(([x, y]) => new Vector3(x, y + height * .03, .2));
      for (let index = 0; index < 4; index++) path.add(new QuadraticBezierCurve3(points[index * 2], points[index * 2 + 1], points[index * 2 + 2]));
      const stroke = new Mesh(new TubeGeometry(path, 40, .026, 3, false), this.stage.material(0x285680));
      stroke.castShadow = false;
      group.add(stroke);
    }
    return group;
  }

  private buildClouds() {
    for (let index = 0; index < 16; index++) {
      const group = new Group(), side = index % 2 ? 1 : -1, distance = Math.floor(index / 2);
      const width = 11.2 + distance * .65, height = 2.4 + distance * .23;
      const back = this.cloudShape(width * 1.13, height * 1.18, INK.paper);
      back.position.set(side * .65, -.55, -.5);
      const cloud = this.cloudShape(width, height, INK.paper);
      const lower = this.cloudShape(width * .94, height * .62, 0x45749b);
      lower.position.set(-side * .15, -.48, .12);
      group.add(back, cloud, lower);
      if (distance < 5) group.add(this.cloudEngraving(width, height));
      group.position.set(side * (11.4 + distance * .7), -2.1 - distance * .12 + index % 3 * .25, -distance * 16 - (side < 0 ? 3 : 11));
      group.rotation.z = side * (index % 3 - 1) * .055;
      this.stage.content.add(group);
      this.clouds.push({ group, z: group.position.z });
    }
    const horizon = this.cloudShape(85, 6, INK.paper);
    horizon.position.set(0, -4, -114);
    this.stage.content.add(horizon);
  }

  private buildRelief() {
    const forms = [
      [-7.6, -1, 3.3, 15.8], [9.8, -20, 4.4, 11.8], [-10.6, -37, 3, 12.4],
      [14.2, -53, 4.2, 18], [-16.8, -69, 4.2, 18.8], [18.5, -88, 6.8, 17],
      [-23, -105, 5.8, 23], [28, -115, 7, 20],
    ];
    forms.forEach(([x, z, width, height], index) => {
      const side = Math.sign(x);
      const shape = new Shape();
      shape.moveTo(-width / 2, 0);
      shape.lineTo(width / 2, 0);
      shape.lineTo(width * .24, height);
      shape.lineTo(-width * .5, height * .73);
      shape.closePath();
      const group = new Group();
      const face = new Mesh(new ExtrudeGeometry(shape, { depth: 3.5, bevelEnabled: false }), [this.stage.material(INK.paper), this.stage.material(INK.black)]);
      face.receiveShadow = true;
      group.add(face);
      group.position.set(x, -3.5, z);
      group.rotation.y = side * -.2;
      this.stage.content.add(group);
      this.reliefs.push({ group, face, x: group.position.x, z: group.position.z, index });
    });
  }

  private buildLanes() {
    for (const x of [-4.8, -1.6, 1.6, 4.8]) {
      const rail = this.stage.box(Math.abs(x) > 4 ? .07 : .052, .018, 122, INK.paper, .003);
      rail.position.set(x, -.3, -53);
      rail.castShadow = false;
      rail.receiveShadow = false;
      this.stage.content.add(rail);
      for (let index = 0; index < 13; index++) {
        const mark = this.stage.box(.075, .025, 1.9, INK.paper, .003);
        mark.position.set(x, -.26, -index * 9.6);
        mark.castShadow = false;
        this.stage.content.add(mark);
        this.laneMarks.push({ mesh: mark, z: mark.position.z });
      }
    }
  }

  private chapter(sector: number) {
    const chapter = (sector - 1) % 3, color = [0x164f88, 0x254367, 0x102d51][chapter];
    (this.stage.scene.background as Color).setHex(color);
    if (this.stage.scene.fog instanceof Fog) {
      this.stage.scene.fog.color.setHex(color);
      this.stage.scene.fog.near = 45;
      this.stage.scene.fog.far = 155;
    }
    this.sun.position.set([26, -24, 18][chapter], [37, 34, 40][chapter], -110);
    this.sun.scale.setScalar([1.25, 1.1, 1.4][chapter]);
    this.reliefs.forEach(({ group, face, x, index }) => {
      group.position.x = x;
      group.scale.set([1, .72, 1.12][chapter], [1, 1.32, .88][chapter], 1);
      group.rotation.y = Math.sign(x) * [-.2, .1, -.4][chapter];
      face.material = [this.stage.material(chapter === 1 && index % 3 ? INK.yellow : INK.paper), this.stage.material(INK.black)];
    });
    this.sector = sector;
  }

  render(model: SkyRun, dt: number) {
    const state = model.state, fresh = !this.ready || this.epoch !== model.epoch;
    if (fresh) {
      this.epoch = model.epoch;
      this.rings = state.rings;
      this.lastShield = state.shield;
      this.mode = state.mode;
      this.shieldBreak = this.collectionTime = 0;
      this.ship.position.y = state.mode === 'over' ? -.35 : 0;
      this.ship.rotation.x = state.mode === 'over' ? .3 : 0;
      this.ship.scale.setScalar(1);
      this.stage.tween(this.ship, { y: this.ship.position.y, rx: this.ship.rotation.x, scale: 1 }, 'entry');
      if (!this.ready && state.mode === 'ready') {
        this.ship.scale.setScalar(.92);
        this.stage.tween(this.ship, { scale: 1 }, 'entry');
      }
      this.ready = true;
    }
    if (this.sector !== state.sector) this.chapter(state.sector);
    if (!fresh && state.rings > this.rings && !this.stage.reducedMotion) {
      this.collectionTime = .24;
      this.collection.position.set(state.x, 1.22, ENCOUNTER_Z);
      this.collection.scale.setScalar(1);
      this.stage.tween(this.collection, { scale: 1.25 }, 'score');
    }
    if (!fresh && state.shield < this.lastShield && !this.stage.reducedMotion) this.shieldBreak = .24;
    this.rings = state.rings;
    this.lastShield = state.shield;
    const visualDt = state.mode === 'paused' ? 0 : dt;
    this.collectionTime = Math.max(0, this.collectionTime - visualDt);
    this.shieldBreak = Math.max(0, this.shieldBreak - visualDt);
    this.collection.visible = this.collectionTime > 0;
    const travel = state.distance;
    this.clouds.forEach(({ group, z }) => { group.position.z = ((z + travel * .19 + 130) % 130) - 130; });
    this.reliefs.forEach(({ group, z, index }) => { group.position.z = index === 0 ? z : ((z + travel * .12 + 120) % 128) - 120; });
    this.laneMarks.forEach(({ mesh, z }) => { mesh.position.z = ((z + travel + 124.8) % 124.8) - 122.8; });
    state.rows.forEach((row, index) => {
      const view = this.rows[index];
      view.ring.position.set((row.safeLane - 1) * LANE_WIDTH, 1.22, ENCOUNTER_Z - row.distance);
      view.ring.visible = !row.passed;
      view.barriers.forEach((barrier, lane) => {
        barrier.visible = row.obstacles.includes(lane) && row.distance > -5;
        barrier.position.set((lane - 1) * LANE_WIDTH, 1.22, ENCOUNTER_Z - row.distance);
      });
    });
    this.pose.position.set(state.x, 1.2, ENCOUNTER_Z);
    this.pose.rotation.z = this.stage.reducedMotion ? 0 : -(state.lane - 1 - state.x / LANE_WIDTH) * .32;
    this.wings.scale.x = state.boost > 0 ? .88 : 1;
    this.flame.scale.z = state.boost > 0 ? 1.9 : 1;
    this.tails.visible = state.boost > 0 && (state.mode === 'playing' || state.mode === 'paused') && !this.stage.reducedMotion;
    this.shield.visible = state.shield > 0 || this.shieldBreak > 0;
    this.shieldPieces.forEach((piece, index) => {
      const distance = this.shieldBreak > 0 ? (1 - this.shieldBreak / .24) * .55 : 0, angle = index * Math.PI / 4;
      piece.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      piece.scale.setScalar(this.shieldBreak > 0 ? this.shieldBreak / .24 : 1);
    });
    if (this.mode !== state.mode) {
      this.mode = state.mode;
      if (state.mode === 'over') this.stage.tween(this.ship, { y: -.35, rx: .3 }, 'failure');
      if (state.mode === 'won') this.stage.tween(this.ship, { y: .25, rx: -.12 }, 'score');
      if (state.mode === 'playing') this.stage.tween(this.ship, { y: 0, rx: 0 }, 'settle');
    }
  }
}
