import { CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, TorusGeometry, Vector2 } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import { FIELD, type MatchState } from './model';

type Bot = { pose: Group; shell: Group; wheels: Group[] };
type Afterimage = { group: Group; material: MeshBasicMaterial; life: number };

export class PushballView {
  private robots: [Bot, Bot];
  private ball = new Group();
  private ballShadow: Mesh;
  private goalPrints: [Group, Group];
  private goalTime = 0;
  private serial: number | null = null;
  private elapsed = 0;
  private afterimages: [Afterimage[], Afterimage[]] = [[], []];
  private trailClock = [0, 0];
  private trailIndex = [0, 0];

  constructor(private stage: Stage) {
    stage.framing('arena', 14.6, 22.8);
    printBackdrop(stage, 'sport');
    this.buildCourt();
    this.goalPrints = [this.buildGoal(0), this.buildGoal(1)];
    this.robots = [this.robot(INK.blue), this.robot(INK.red)];
    for (const side of [0, 1] as const) {
      for (let index = 0; index < 3; index++) {
        const material = new MeshBasicMaterial({ color: side === 0 ? INK.paper : INK.red, transparent: true, opacity: 0, depthWrite: false });
        const group = new Group();
        for (const [w, d, x, z] of [[1.05, .035, 0, -.46], [1.05, .035, 0, .46], [.035, .9, -.51, 0], [.035, .9, .51, 0]]) {
          const stroke = new Mesh(stage.box(w, .015, d, INK.paper, .003).geometry, material);
          stroke.position.set(x, .035, z);
          stroke.castShadow = stroke.receiveShadow = false;
          group.add(stroke);
        }
        group.visible = false;
        stage.content.add(group);
        this.afterimages[side].push({ group, material, life: 0 });
      }
    }
    const sphere = stage.shape('sphere', .4, INK.paper);
    this.ball.add(sphere);
    for (const angle of [0, Math.PI / 2]) {
      const seam = new Mesh(new TorusGeometry(.396, .018, 5, 48), stage.material(INK.black));
      seam.rotation.x = angle;
      this.ball.add(seam);
    }
    stage.content.add(this.ball);
    this.ballShadow = new Mesh(new CircleGeometry(.43, 24), new MeshBasicMaterial({ color: INK.black, transparent: true, opacity: .24, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    stage.content.add(this.ballShadow);
  }

  private box(w: number, h: number, d: number, color: number, parent: Group, x = 0, y = 0, z = 0) {
    const mesh = this.stage.box(w, h, d, color, Math.min(.04, w / 5, h / 5, d / 5));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private outline() {
    const points: Vector2[] = [], r = FIELD.cornerRadius, cx = FIELD.width / 2 - r, cy = FIELD.length / 2 - r;
    for (let corner = 0; corner < 4; corner++) {
      const x = corner === 0 || corner === 3 ? cx : -cx, y = corner < 2 ? cy : -cy;
      for (let step = 0; step <= 12; step++) {
        const angle = corner * Math.PI / 2 + step * Math.PI / 24;
        points.push(new Vector2(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
      }
    }
    return points;
  }

  private inkRegion(points: Vector2[], positive: boolean) {
    const clipped: Vector2[] = [], value = (p: Vector2) => (p.y + p.x * .72) * (positive ? 1 : -1) - 1.25;
    points.forEach((p, index) => {
      const q = points[(index + 1) % points.length], a = value(p), b = value(q);
      if (a >= 0) clipped.push(p.clone());
      if ((a < 0) !== (b < 0)) clipped.push(p.clone().lerp(q, a / (a - b)));
    });
    return new Shape(clipped);
  }

  private buildCourt() {
    const points = this.outline(), outline = new Shape(points);
    const floor = new Mesh(new ExtrudeGeometry(outline, { depth: .22, bevelEnabled: false }), this.stage.material(INK.black));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.22;
    floor.receiveShadow = true;
    this.stage.content.add(floor);
    this.box(12.55, .33, 18.55, INK.black, this.stage.content, 0, -.48);
    for (const positive of [false, true]) {
      const inlay = new Mesh(new ShapeGeometry(this.inkRegion(points, positive)), this.stage.material(positive ? INK.red : INK.blue));
      inlay.rotation.x = -Math.PI / 2;
      inlay.position.y = .012;
      inlay.receiveShadow = true;
      this.stage.content.add(inlay);
    }
    this.box(11.9, .015, .045, INK.paper, this.stage.content, 0, .04);
    const center = new Mesh(new TorusGeometry(1.8, .035, 6, 64), this.stage.material(INK.paper));
    center.rotation.x = Math.PI / 2;
    center.position.y = .045;
    center.castShadow = false;
    this.stage.content.add(center);
    const { cornerRadius: r } = FIELD;
    for (const side of [-1, 1]) {
      this.box(.13, .18, 13.2, INK.paper, this.stage.content, side * 6, .1);
      for (const end of [-1, 1]) this.box(1.2, .18, .13, INK.paper, this.stage.content, side * 3, .1, end * 9);
    }
    for (let corner = 0; corner < 4; corner++) {
      const rail = new Mesh(new TorusGeometry(r, .065, 6, 24, Math.PI / 2), this.stage.material(INK.paper));
      rail.rotation.set(Math.PI / 2, 0, corner * Math.PI / 2);
      rail.position.set(corner === 0 || corner === 3 ? 3.6 : -3.6, .1, corner < 2 ? 6.6 : -6.6);
      this.stage.content.add(rail);
    }
    for (const side of [-1, 1]) {
      const line = this.box(4.8, .015, .035, INK.paper, this.stage.content, 0, .04, side * 7.45);
      line.castShadow = false;
      for (const x of [-2.4, 2.4]) {
        const edge = this.box(.035, .015, 1.55, INK.paper, this.stage.content, x, .04, side * 8.22);
        edge.castShadow = false;
      }
    }
  }

  private buildGoal(side: 0 | 1) {
    const group = new Group(), sign = side === 0 ? -1 : 1, z = sign * 9, color = side === 0 ? INK.red : INK.blue;
    for (const x of [-2.4, 2.4]) {
      this.box(.16, .85, 1.15, INK.paper, group, x, .42, z + sign * .55);
      this.box(.19, .085, 1.18, color, group, x, .82, z + sign * .55);
    }
    this.box(4.96, .13, .15, INK.paper, group, 0, .85, z + sign * 1.1);
    this.box(4.8, .62, .08, INK.black, group, 0, .33, z + sign * 1.17);
    for (let x = -2.1; x < 2.4; x += .42) this.box(.025, .58, .035, INK.paper, group, x, .33, z + sign * 1.11);
    for (const y of [.15, .35, .55]) this.box(4.75, .025, .035, INK.paper, group, 0, y, z + sign * 1.1);
    this.stage.content.add(group);
    const stamp = new Group();
    stamp.position.z = z;
    for (const x of [-1.2, 1.2]) {
      const stripe = this.box(2.35, .018, .78, color, stamp, x, .04, sign * .58);
      stripe.rotation.y = sign * -.18;
      stripe.castShadow = false;
    }
    stamp.visible = false;
    this.stage.content.add(stamp);
    return stamp;
  }

  private robot(color: number): Bot {
    const pose = new Group(), shell = new Group(), wheels: Group[] = [];
    this.box(.92, .24, .86, color, shell, 0, .28);
    this.box(.92, .025, .86, INK.paper, shell, 0, .411);
    this.box(.7, .2, .62, INK.paper, shell, 0, .48, -.04);
    this.box(.42, .025, .12, color, shell, 0, .594, -.24);
    this.box(.96, .21, .12, INK.black, shell, 0, .23, .47);
    this.box(.74, .035, .13, INK.paper, shell, 0, .35, .46);
    this.box(.15, .04, .36, INK.black, shell, 0, .595, -.04);
    const arrow = new Shape();
    arrow.moveTo(-.18, -.16);
    arrow.lineTo(.18, -.16);
    arrow.lineTo(0, -.37);
    arrow.closePath();
    const facing = new Mesh(new ShapeGeometry(arrow), this.stage.material(INK.black));
    facing.rotation.x = -Math.PI / 2;
    facing.position.y = .618;
    shell.add(facing);
    for (const x of [-.49, .49]) {
      for (const z of [-.23, .23]) {
        const axle = new Group(), wheel = new Group();
        axle.position.set(x, .17, z);
        axle.rotation.z = Math.PI / 2;
        const tyre = new Mesh(new CylinderGeometry(.18, .18, .15, 12), this.stage.material(INK.black));
        tyre.castShadow = true;
        wheel.add(tyre);
        this.box(.22, .018, .045, INK.paper, wheel, 0, x < 0 ? .083 : -.083);
        axle.add(wheel);
        shell.add(axle);
        wheels.push(wheel);
      }
    }
    pose.add(shell);
    this.stage.content.add(pose);
    return { pose, shell, wheels };
  }

  private clearTrails() {
    this.afterimages.flat().forEach(image => { image.life = 0; image.group.visible = false; });
    this.trailClock = [0, 0];
  }

  render(state: MatchState, dt: number) {
    const fresh = this.serial === null || state.elapsed < this.elapsed;
    if (fresh) {
      if (this.serial !== null) this.robots.forEach(robot => { this.stage.tween(robot.shell, { y: 0 }, 'entry'); });
      this.serial = state.goalSerial;
      this.goalTime = 0;
      this.clearTrails();
      this.goalPrints.forEach(stamp => { stamp.visible = false; });
    }
    this.elapsed = state.elapsed;
    const visualDt = state.mode === 'paused' ? 0 : dt;
    for (const side of [0, 1] as const) {
      const robot = state.robots[side], view = this.robots[side], speed = Math.hypot(robot.vx, robot.vy);
      view.pose.position.set(robot.x, 0, robot.y);
      view.pose.rotation.y = Math.atan2(robot.facingX, robot.facingY);
      const tilt = this.stage.reducedMotion ? 0 : robot.dashLeft > 0 ? -.14 : -Math.min(1, speed / 4.6) * .035;
      view.shell.rotation.x += (tilt - view.shell.rotation.x) * (1 - Math.exp(-visualDt * 24));
      if (!this.stage.reducedMotion && visualDt > 0) view.wheels.forEach(wheel => { wheel.rotation.y += speed * visualDt * 4; });
      this.afterimages[side].forEach(image => {
        image.life = Math.max(0, image.life - visualDt);
        image.group.visible = image.life > 0 && !this.stage.reducedMotion;
        image.material.opacity = image.life / .22 * .32;
      });
      if (robot.dashLeft > 0 && visualDt > 0 && !this.stage.reducedMotion) {
        this.trailClock[side] += visualDt;
        if (this.trailClock[side] >= .045) {
          this.trailClock[side] %= .045;
          const image = this.afterimages[side][this.trailIndex[side]++ % 3];
          image.life = .22;
          image.material.opacity = .32;
          image.group.visible = true;
          image.group.position.set(robot.x - robot.facingX * .3, 0, robot.y - robot.facingY * .3);
          image.group.rotation.y = view.pose.rotation.y;
        }
      } else this.trailClock[side] = 0;
    }
    this.ball.position.set(state.ball.x, .42, state.ball.y);
    this.ballShadow.position.set(state.ball.x, .025, state.ball.y);
    if (!this.stage.reducedMotion && visualDt > 0) {
      this.ball.rotation.x += state.ball.vy * visualDt * 1.7;
      this.ball.rotation.z -= state.ball.vx * visualDt * 1.7;
    }
    if (!fresh && state.goalSerial > this.serial!) {
      this.clearTrails();
      this.goalTime = this.stage.reducedMotion ? 0 : .32;
      this.goalPrints.forEach(stamp => { stamp.visible = false; });
      if (state.lastScorer !== null) {
        const stamp = this.goalPrints[state.lastScorer], color = state.lastScorer === 0 ? INK.blue : INK.red;
        stamp.children.forEach(child => { (child as Mesh).material = this.stage.material(color); });
        stamp.scale.set(.3, 1, 1);
        stamp.visible = this.goalTime > 0;
        this.stage.tween(stamp, { sx: 1, sz: .02 }, 'entry');
        if (state.mode === 'over') this.stage.tween(this.robots[state.lastScorer].shell, { y: .1 }, 'score');
      }
    }
    this.serial = state.goalSerial;
    this.goalTime = Math.max(0, this.goalTime - visualDt);
    if (this.goalTime === 0) this.goalPrints.forEach(stamp => { stamp.visible = false; });
  }
}
