import { BufferGeometry, CircleGeometry, Color, CurvePath, ExtrudeGeometry, Float32BufferAttribute, Fog, Group, Mesh, PlaneGeometry, QuadraticBezierCurve3, Shape, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import { LANE_WIDTH, type SkyRun } from './model';

type Relief = { group: Group; face: Mesh; x: number; z: number; index: number };
type Cloud = { group: Group; z: number };
const ENCOUNTER_Z = 2;

export class SkyView {
  private pose = new Group();
  private ship = new Group();
  private wings: Group[] = [];
  private flame: Mesh;
  private tails = new Group();
  private shield = new Group();
  private shieldPieces: Mesh[] = [];
  private collection = new Group();
  private sun: Mesh;
  private sea: Mesh;
  private reliefs: Relief[] = [];
  private clouds: Cloud[] = [];
  private rows: { ring: Group; barriers: Group[] }[] = [];
  private epoch = -1;
  private sector = 0;
  private mode = '';
  private rings = 0;
  private lastShield = 1;
  private shieldBreak = 0;
  private collectionTime = 0;
  private boostBlend = 0;
  private ready = false;

  constructor(private stage: Stage) {
    stage.framing('flight', 10.5, 10);
    printBackdrop(stage, 'air');
    this.sea = new Mesh(new PlaneGeometry(220, 260), stage.material(0x244d70, 0, 'paper'));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(0, -1.3, -95);
    this.sea.receiveShadow = true;
    stage.content.add(this.sea);
    const sunMaterial = stage.material(INK.red, 0, 'paper').clone();
    sunMaterial.fog = false;
    this.sun = new Mesh(new CircleGeometry(17, 64), sunMaterial);
    this.sun.position.set(26, 37, -110);
    stage.content.add(this.sun);
    this.buildClouds();
    this.buildRelief();
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
    const flash = new Mesh(new TorusGeometry(.94, .035, 6, 48), stage.material(INK.yellow, 0, 'metal'));
    this.collection.add(flash);
    this.collection.visible = false;
    stage.content.add(this.collection);
    for (let index = 0; index < 14; index++) {
      const ring = new Group();
      for (const [radius, stroke, color, z] of [[.97, .105, INK.black, 0], [.95, .09, INK.yellow, .055]]) {
        const hoop = new Mesh(new TorusGeometry(radius, stroke, 8, 48), stage.material(color, color === INK.yellow ? INK.yellow : 0, 'metal'));
        hoop.position.z = z;
        hoop.castShadow = hoop.receiveShadow = true;
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
        const backing = stage.box(2.36, 2.36, .26, INK.black, .025);
        barrier.add(backing);
        for (const angle of [-Math.PI / 4, Math.PI / 4]) {
          const cross = stage.box(2.6, .38, .3, INK.red, .025);
          cross.position.z = .22;
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
    const bevel = Math.min(.012, depth / 5);
    const mesh = new Mesh(new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 }), [this.stage.material(color, 0, 'paint'), this.stage.material(INK.black, 0, 'paint')]);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private folded(vertices: number[][], faces: number[][], colors: number[], parent: Group) {
    const positions: number[] = [], inks: number[] = [];
    faces.forEach((face, index) => {
      const color = new Color(colors[index % colors.length]);
      face.forEach(vertex => { positions.push(...vertices[vertex]); inks.push(color.r, color.g, color.b); });
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(inks, 3));
    geometry.computeVertexNormals();
    const material = this.stage.material(0xffffff, 0, 'paint').clone();
    material.vertexColors = true;
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }

  private buildShip() {
    this.folded([[0, .11, -1.15], [0, .07, .75], [-.18, .08, .36], [.18, .08, .36], [0, .32, .08], [0, -.12, .18]], [[0, 2, 4], [0, 4, 3], [4, 2, 1], [4, 1, 3], [0, 5, 2], [0, 3, 5], [1, 2, 5], [1, 5, 3]], [INK.white, INK.paper, 0xc9c4af, INK.white], this.ship);
    for (const side of [-1, 1]) {
      const wing = new Group();
      this.plate([[0, -.98], [side * .96, .82], [side * .22, .39], [0, .47]], INK.white, .105, wing, 0, .055);
      this.plate([[side * .36, .24], [side * .79, .68], [side * .55, .51]], INK.red, .014, wing, 0, .079);
      this.ship.add(wing);
      this.wings.push(wing);
    }
    this.plate([[0, -.48], [.09, .025], [0, .24], [-.09, .025]], INK.black, .075, this.ship, 0, .2);
  }

  private cloudShape(width: number, height: number, color: number, depth = .85) {
    const shape = new Shape();
    shape.moveTo(-width / 2, 0);
    shape.quadraticCurveTo(-width * .48, height * .64, -width * .31, height * .46);
    shape.quadraticCurveTo(-width * .28, height * 1.18, -width * .08, height * .82);
    shape.quadraticCurveTo(width * .06, height * 1.36, width * .2, height * .64);
    shape.quadraticCurveTo(width * .43, height * .94, width / 2, 0);
    shape.closePath();
    const cloud = new Mesh(new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, curveSegments: 15 }), [this.stage.material(color, 0, 'paper'), this.stage.material(0xa8b8bd, 0, 'paper')]);
    cloud.castShadow = cloud.receiveShadow = true;
    return cloud;
  }

  private cloudEngraving(width: number, height: number, depth: number) {
    const group = new Group();
    for (const scale of [.86, .67]) {
      const w = width * scale, h = height * scale, path = new CurvePath<Vector3>();
      const points = [
        [-w / 2, 0], [-w * .48, h * .64], [-w * .31, h * .46],
        [-w * .28, h * 1.18], [-w * .08, h * .82],
        [w * .06, h * 1.36], [w * .2, h * .64], [w * .43, h * .94], [w / 2, 0],
      ].map(([x, y]) => new Vector3(x, y + height * .03, depth + .04));
      for (let index = 0; index < 4; index++) path.add(new QuadraticBezierCurve3(points[index * 2], points[index * 2 + 1], points[index * 2 + 2]));
      const stroke = new Mesh(new TubeGeometry(path, 40, .023, 4, false), this.stage.material(0x728eaa, 0, 'paper'));
      stroke.castShadow = false;
      group.add(stroke);
    }
    return group;
  }

  private buildClouds() {
    for (let index = 0; index < 12; index++) {
      const group = new Group(), side = index % 2 ? 1 : -1, distance = Math.floor(index / 2);
      const width = 5.5 + distance * .8, height = 1.5 + distance * .14, depth = 1.05 + distance * .12;
      group.add(this.cloudShape(width, height, INK.white, depth));
      group.add(this.cloudEngraving(width, height, depth));
      group.position.set(side * (8 + distance * .9), -1.25 - distance * .14, -distance * 20 - (side < 0 ? 6 : 14));
      group.rotation.y = side * .13;
      group.rotation.z = side * (index % 3 - 1) * .055;
      this.stage.content.add(group);
      this.clouds.push({ group, z: group.position.z });
    }
    const horizon = this.cloudShape(85, 6, INK.paper, 1.5);
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
      const face = new Mesh(new ExtrudeGeometry(shape, { depth: 3.5, bevelEnabled: true, bevelSize: .035, bevelThickness: .035, bevelSegments: 1 }), [this.stage.material(INK.paper, 0, 'paper'), this.stage.material(INK.black, 0, 'paper')]);
      face.castShadow = face.receiveShadow = true;
      group.add(face);
      group.position.set(x, -3.5, z);
      group.rotation.y = side * -.2;
      this.stage.content.add(group);
      this.reliefs.push({ group, face, x: group.position.x, z: group.position.z, index });
    });
  }

  private chapter(sector: number) {
    const chapter = (sector - 1) % 3, color = [0x164f88, 0x254367, 0x102d51][chapter];
    (this.stage.scene.background as Color).setHex(color);
    this.sea.material = this.stage.material([0x244d70, 0x354f63, 0x173956][chapter], 0, 'paper');
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
      face.material = [this.stage.material(chapter === 1 && index % 3 ? INK.yellow : INK.paper, 0, 'paper'), this.stage.material(INK.black, 0, 'paper')];
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
      this.boostBlend = state.boost > 0 ? 1 : 0;
      this.ship.position.y = state.mode === 'over' ? -.35 : state.mode === 'won' ? .25 : 0;
      this.ship.rotation.x = state.mode === 'over' ? .3 : state.mode === 'won' ? -.12 : .04;
      this.ship.scale.setScalar(1);
      if (this.ready) this.stage.tween(this.ship, { y: this.ship.position.y, rx: this.ship.rotation.x, scale: 1 }, 'settle', 0);
      this.ready = true;
    }
    if (this.sector !== state.sector) this.chapter(state.sector);
    if (!fresh && state.rings > this.rings && !this.stage.reducedMotion) {
      this.collectionTime = .24;
      this.collection.position.set(state.x, 1.22, ENCOUNTER_Z);
      this.collection.scale.setScalar(1);
      this.stage.tween(this.collection, { scale: 1.25 }, 'score', .24);
    }
    if (!fresh && state.shield < this.lastShield && !this.stage.reducedMotion) this.shieldBreak = .24;
    this.rings = state.rings;
    this.lastShield = state.shield;
    const visualDt = state.mode === 'paused' ? 0 : dt;
    const boost = Number(state.boost > 0);
    this.boostBlend = this.stage.reducedMotion ? boost : this.boostBlend + (boost - this.boostBlend) * (1 - Math.exp(-visualDt * 24));
    this.collectionTime = Math.max(0, this.collectionTime - visualDt);
    this.shieldBreak = Math.max(0, this.shieldBreak - visualDt);
    this.collection.visible = this.collectionTime > 0;
    const travel = this.stage.reducedMotion ? 0 : state.distance;
    this.clouds.forEach(({ group, z }) => { group.position.z = ((z + travel * .19 + 130) % 130) - 130; });
    this.reliefs.forEach(({ group, z, index }) => { group.position.z = index === 0 ? z : ((z + travel * .12 + 120) % 128) - 120; });
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
    const bank = this.stage.reducedMotion ? 0 : Math.max(-1, Math.min(1, state.lane - 1 - state.x / LANE_WIDTH));
    this.pose.rotation.z = -bank * .4;
    this.pose.rotation.y = -bank * .1;
    this.wings.forEach((wing, index) => { wing.rotation.z = (index ? 1 : -1) * (.035 + this.boostBlend * .07); });
    this.flame.scale.z = 1 + this.boostBlend * .9;
    this.tails.scale.z = .15 + this.boostBlend * .85;
    this.tails.visible = this.boostBlend > .01 && (state.mode === 'playing' || state.mode === 'paused') && !this.stage.reducedMotion;
    this.shield.visible = state.shield > 0 || this.shieldBreak > 0;
    this.shieldPieces.forEach((piece, index) => {
      const distance = this.shieldBreak > 0 ? (1 - this.shieldBreak / .24) * .55 : 0, angle = index * Math.PI / 4;
      piece.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      piece.scale.setScalar(this.shieldBreak > 0 ? this.shieldBreak / .24 : 1);
    });
    if (this.mode !== state.mode) {
      this.mode = state.mode;
      if (state.mode === 'over') this.stage.tween(this.ship, { y: -.35, rx: .3 }, 'failure', .24);
      if (state.mode === 'won') this.stage.tween(this.ship, { y: .25, rx: -.12 }, 'score', .24);
      if (state.mode === 'playing') this.stage.tween(this.ship, { y: 0, rx: .04 }, 'settle', .23);
    }
  }
}
