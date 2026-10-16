import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, TorusGeometry, Vector2 } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import { BALL_RADIUS, FIELD, ROBOT_RADIUS, type MatchState } from './model';

type Bot = { pose: Group; shell: Group; wheels: Group[] };
type Afterimage = { group: Group; material: MeshBasicMaterial; life: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const settle = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export class PushballView {
  private robots: [Bot, Bot];
  private ball = new Group();
  private goalPrints: [Group, Group];
  private goalCaps: [Mesh[], Mesh[]] = [[], []];
  private goalAge = .32;
  private lastScorer: 0 | 1 | null = null;
  private serial: number | null = null;
  private elapsed = 0;
  private ballVX = 0;
  private ballVZ = 0;
  private contactAge = [.14, .14];
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
          const stroke = new Mesh(stage.box(w, .018, d, INK.paper, .003).geometry, material);
          stroke.position.set(x, .045, z);
          group.add(stroke);
        }
        group.visible = false;
        stage.content.add(group);
        this.afterimages[side].push({ group, material, life: 0 });
      }
    }
    const sphere = stage.shape('sphere', BALL_RADIUS, INK.white);
    sphere.material = stage.material(INK.white, 0, 'ceramic');
    this.ball.add(sphere);
    for (const angle of [0, Math.PI / 2]) {
      const seam = new Mesh(new TorusGeometry(BALL_RADIUS - .004, .018, 6, 48), stage.material(INK.black));
      seam.rotation.x = angle;
      this.ball.add(seam);
    }
    stage.content.add(this.ball);
  }

  private box(w: number, h: number, d: number, color: number, parent: Group, x = 0, y = 0, z = 0, metal = false) {
    const mesh = this.stage.box(w, h, d, color, Math.min(.035, w / 5, h / 5, d / 5));
    mesh.material = this.stage.material(color, 0, metal ? 'metal' : 'paint');
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private outline(inset = 0) {
    const points: Vector2[] = [], r = FIELD.cornerRadius + inset;
    const cx = FIELD.width / 2 - FIELD.cornerRadius, cy = FIELD.length / 2 - FIELD.cornerRadius;
    for (let corner = 0; corner < 4; corner++) {
      const x = corner === 0 || corner === 3 ? cx : -cx, y = corner < 2 ? cy : -cy;
      for (let step = 0; step <= 16; step++) {
        const angle = corner * Math.PI / 2 + step * Math.PI / 32;
        points.push(new Vector2(x + Math.cos(angle) * r, y + Math.sin(angle) * r));
      }
    }
    return points;
  }

  private inkRegion(points: Vector2[], positive: boolean) {
    const clipped: Vector2[] = [], value = (p: Vector2) => (p.y + p.x * .72) * (positive ? 1 : -1);
    points.forEach((p, index) => {
      const q = points[(index + 1) % points.length], a = value(p), b = value(q);
      if (a >= 0) clipped.push(p.clone());
      if ((a < 0) !== (b < 0)) clipped.push(p.clone().lerp(q, a / (a - b)));
    });
    return new Shape(clipped);
  }

  private buildCourt() {
    const points = this.outline();
    const plinth = new Mesh(new ExtrudeGeometry(new Shape(this.outline(.18)), { depth: .60, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1 }), this.stage.material(INK.black));
    plinth.rotation.x = -Math.PI / 2;
    plinth.position.y = -.655;
    plinth.castShadow = plinth.receiveShadow = true;
    this.stage.content.add(plinth);
    const court = new Mesh(new ExtrudeGeometry(new Shape(points), { depth: .09, bevelEnabled: false }), this.stage.material(INK.black));
    court.rotation.x = -Math.PI / 2;
    court.position.y = -.09;
    court.castShadow = court.receiveShadow = true;
    this.stage.content.add(court);
    for (const positive of [false, true]) {
      const inlay = new Mesh(new ShapeGeometry(this.inkRegion(points, positive)), this.stage.material(positive ? INK.red : INK.blue));
      inlay.rotation.x = -Math.PI / 2;
      inlay.position.y = .012;
      inlay.receiveShadow = true;
      this.stage.content.add(inlay);
    }
    this.box(11.9, .017, .045, INK.paper, this.stage.content, 0, .04);
    const center = new Mesh(new TorusGeometry(1.8, .035, 8, 64), this.stage.material(INK.paper));
    center.rotation.x = Math.PI / 2;
    center.position.y = .045;
    this.stage.content.add(center);
    for (const side of [-1, 1]) {
      this.box(.15, .22, 13.2, INK.paper, this.stage.content, side * 6, .12, 0, true);
      for (const end of [-1, 1]) this.box(1.2, .22, .15, INK.paper, this.stage.content, side * 3, .12, end * 9, true);
    }
    for (let corner = 0; corner < 4; corner++) {
      const rail = new Mesh(new TorusGeometry(FIELD.cornerRadius, .075, 8, 32, Math.PI / 2), this.stage.material(INK.paper, 0, 'metal'));
      rail.rotation.set(Math.PI / 2, 0, corner * Math.PI / 2);
      rail.position.set(corner === 0 || corner === 3 ? 3.6 : -3.6, .12, corner < 2 ? 6.6 : -6.6);
      rail.castShadow = rail.receiveShadow = true;
      this.stage.content.add(rail);
    }
    for (const side of [-1, 1]) {
      this.box(4.8, .017, .035, INK.paper, this.stage.content, 0, .04, side * 7.45).castShadow = false;
      for (const x of [-2.4, 2.4]) this.box(.035, .017, 1.55, INK.paper, this.stage.content, x, .04, side * 8.22).castShadow = false;
    }
  }

  private buildGoal(side: 0 | 1) {
    const group = new Group(), sign = side === 0 ? -1 : 1, z = sign * 9, color = side === 0 ? INK.red : INK.blue;
    for (const x of [-2.4, 2.4]) {
      this.box(.18, 1.0, 1.18, INK.paper, group, x, .51, z + sign * .55, true);
      this.goalCaps[side].push(this.box(.20, .08, 1.20, color, group, x, 1.03, z + sign * .55));
    }
    this.box(4.98, .15, .17, INK.paper, group, 0, 1.02, z + sign * 1.1, true);
    this.box(4.8, .74, .08, INK.black, group, 0, .40, z + sign * 1.17);
    for (let x = -2.1; x < 2.4; x += .42) this.box(.025, .68, .035, INK.paper, group, x, .40, z + sign * 1.11, true);
    for (const y of [.17, .40, .63]) this.box(4.75, .025, .035, INK.paper, group, 0, y, z + sign * 1.1, true);
    this.stage.content.add(group);
    const stamp = new Group();
    stamp.position.z = z;
    for (const x of [-1.2, 1.2]) {
      const stripe = this.box(2.35, .022, .78, color, stamp, x, .045, sign * .58);
      stripe.rotation.y = sign * -.18;
      stripe.castShadow = false;
    }
    stamp.visible = false;
    this.stage.content.add(stamp);
    return stamp;
  }

  private robot(color: number): Bot {
    const pose = new Group(), shell = new Group(), wheels: Group[] = [];
    this.box(.92, .26, .86, color, shell, 0, .30);
    this.box(.94, .035, .89, INK.paper, shell, 0, .448);
    this.box(.72, .24, .66, INK.paper, shell, 0, .575, -.035);
    this.box(.42, .025, .12, color, shell, 0, .708, -.24);
    this.box(.96, .23, .12, INK.black, shell, 0, .25, .47);
    this.box(.74, .035, .13, INK.paper, shell, 0, .38, .46, true);
    this.box(.14, .025, .30, INK.black, shell, 0, .712, -.03);
    const arrow = new Shape();
    arrow.moveTo(-.18, -.13); arrow.lineTo(.18, -.13); arrow.lineTo(0, -.36); arrow.closePath();
    const facing = new Mesh(new ShapeGeometry(arrow), this.stage.material(INK.black));
    facing.rotation.x = -Math.PI / 2;
    facing.position.y = .731;
    shell.add(facing);
    const tyre = new CylinderGeometry(.19, .19, .15, 24), hub = new CylinderGeometry(.085, .085, .17, 20);
    for (const x of [-.49, .49]) for (const z of [-.23, .23]) {
      const axle = new Group(), wheel = new Group();
      axle.position.set(x, .20, z);
      axle.rotation.z = Math.PI / 2;
      const rubber = new Mesh(tyre, this.stage.material(INK.black));
      const center = new Mesh(hub, this.stage.material(INK.paper, 0, 'metal'));
      rubber.castShadow = rubber.receiveShadow = center.castShadow = center.receiveShadow = true;
      wheel.add(rubber, center);
      this.box(.24, .018, .04, INK.paper, wheel, 0, x < 0 ? .09 : -.09);
      axle.add(wheel);
      shell.add(axle);
      wheels.push(wheel);
    }
    pose.add(shell);
    this.stage.content.add(pose);
    return { pose, shell, wheels };
  }

  private clearTrails() {
    for (const images of this.afterimages) for (const image of images) { image.life = 0; image.group.visible = false; }
    this.trailClock[0] = this.trailClock[1] = 0;
  }

  render(state: MatchState, dt: number) {
    const fresh = this.serial === null || state.elapsed < this.elapsed;
    const scored = !fresh && state.goalSerial > this.serial!;
    const visualDt = state.mode === 'paused' ? 0 : Math.max(0, dt);
    if (fresh) {
      this.serial = state.goalSerial;
      this.goalAge = .32;
      this.lastScorer = null;
      this.contactAge[0] = this.contactAge[1] = .14;
      this.ball.rotation.set(0, 0, 0);
      for (const robot of this.robots) robot.shell.rotation.x = 0;
      this.clearTrails();
    }
    if (scored) {
      this.clearTrails();
      this.goalAge = this.stage.reducedMotion ? .32 : 0;
      this.lastScorer = state.lastScorer;
      if (this.lastScorer !== null) {
        const color = this.lastScorer === 0 ? INK.blue : INK.red;
        for (const child of this.goalPrints[this.lastScorer].children) (child as Mesh).material = this.stage.material(color);
      }
    }
    this.goalAge = Math.min(.32, this.goalAge + visualDt);
    const impulse = !fresh && !scored && Math.hypot(state.ball.vx - this.ballVX, state.ball.vy - this.ballVZ) > 1.1;
    for (const side of [0, 1] as const) {
      const robot = state.robots[side], view = this.robots[side], speed = Math.hypot(robot.vx, robot.vy);
      this.contactAge[side] = Math.min(.14, this.contactAge[side] + visualDt);
      if (impulse && visualDt > 0 && state.kickoff === 0 && Math.hypot(state.ball.x - robot.x, state.ball.y - robot.y) < ROBOT_RADIUS + BALL_RADIUS + .10) this.contactAge[side] = 0;
      view.pose.position.set(robot.x, 0, robot.y);
      view.pose.rotation.y = Math.atan2(robot.facingX, robot.facingY);
      const target = this.stage.reducedMotion ? 0 : robot.dashLeft > 0 ? -.14 : -Math.min(1, speed / 4.6) * .035;
      view.shell.rotation.x += (target - view.shell.rotation.x) * (1 - Math.exp(-visualDt * 26));
      if (Math.abs(target - view.shell.rotation.x) < .001) view.shell.rotation.x = target;
      view.shell.position.z = this.stage.reducedMotion ? 0 : -.035 * Math.sin(this.contactAge[side] / .14 * Math.PI);
      view.shell.position.y = state.mode === 'over' && state.winner === side ? .09 * settle(this.goalAge / .24) : 0;
      if (!this.stage.reducedMotion && visualDt > 0) {
        const forward = robot.vx * robot.facingX + robot.vy * robot.facingY;
        for (const wheel of view.wheels) wheel.rotation.y += forward * visualDt / .19;
      }
      for (const image of this.afterimages[side]) {
        image.life = Math.max(0, image.life - visualDt);
        image.group.visible = image.life > 0 && !this.stage.reducedMotion;
        image.material.opacity = image.life / .22 * .28;
      }
      if (robot.dashLeft > 0 && visualDt > 0 && !this.stage.reducedMotion) {
        this.trailClock[side] += visualDt;
        if (this.trailClock[side] >= .045) {
          this.trailClock[side] %= .045;
          const image = this.afterimages[side][this.trailIndex[side]++ % 3];
          image.life = .22;
          image.material.opacity = .28;
          image.group.visible = true;
          image.group.position.set(robot.x - robot.facingX * .3, 0, robot.y - robot.facingY * .3);
          image.group.rotation.y = view.pose.rotation.y;
        }
      } else this.trailClock[side] = 0;
      const stamp = this.goalPrints[side];
      stamp.visible = this.lastScorer === side && this.goalAge < .32;
      stamp.scale.set(.20 + .80 * settle(this.goalAge / .22), 1, 1 - settle(this.goalAge / .32));
      const flash = this.goalAge < .32 && this.lastScorer === side;
      const color = flash ? side === 0 ? INK.blue : INK.red : side === 0 ? INK.red : INK.blue;
      for (const cap of this.goalCaps[side]) cap.material = this.stage.material(color, flash ? color : 0);
    }
    if (!fresh && !scored && !this.stage.reducedMotion && visualDt > 0) {
      this.ball.rotation.x += (state.ball.y - this.ball.position.z) / BALL_RADIUS;
      this.ball.rotation.z -= (state.ball.x - this.ball.position.x) / BALL_RADIUS;
    }
    this.ball.position.set(state.ball.x, BALL_RADIUS + .02, state.ball.y);
    this.ballVX = state.ball.vx;
    this.ballVZ = state.ball.vy;
    this.serial = state.goalSerial;
    this.elapsed = state.elapsed;
  }

  get animating() {
    if (this.goalAge < .32 || this.contactAge[0] < .14 || this.contactAge[1] < .14) return true;
    for (const robot of this.robots) if (Math.abs(robot.shell.rotation.x) > .001) return true;
    for (const images of this.afterimages) for (const image of images) if (image.life > 0) return true;
    return false;
  }
}
