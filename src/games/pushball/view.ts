import { ExtrudeGeometry, Group, Mesh, Shape, TorusGeometry } from 'three';
import type { Stage } from '../../core/stage';
import { FIELD, type MatchState } from './model';
export class PushballView {
  private robots: [
    Group,
    Group
  ];
  private ball = new Group();
  private goals: [
    Group,
    Group
  ];
  private serial = 0;
  constructor(private stage: Stage) {
    const { width: w, length: l, cornerRadius: r } = FIELD, shape = new Shape(), x = w / 2, y = l / 2;
    shape.moveTo(-x + r, -y);
    shape.lineTo(x - r, -y);
    shape.quadraticCurveTo(x, -y, x, -y + r);
    shape.lineTo(x, y - r);
    shape.quadraticCurveTo(x, y, x - r, y);
    shape.lineTo(-x + r, y);
    shape.quadraticCurveTo(-x, y, -x, y - r);
    shape.lineTo(-x, -y + r);
    shape.quadraticCurveTo(-x, -y, -x + r, -y);
    const floor = new Mesh(new ExtrudeGeometry(shape, { depth: .22, bevelEnabled: false, curveSegments: 20 }), stage.material(0x3e777a));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.22;
    floor.receiveShadow = true;
    stage.content.add(floor);
    this.box(14, .6, 22, 0x254c59, stage.content, 0, -.7);
    this.box(12, .03, .045, 0x92ccbd, stage.content, 0, .02);
    const center = stage.shape('ring', 1.8, 0x8dcbb9);
    center.rotation.x = Math.PI / 2;
    center.position.y = .03;
    for (const side of [-1, 1])
      this.box(.28, .42, 13.2, 0x89b6b3, stage.content, side * 6, .15);
    for (let corner = 0; corner < 4; corner++) {
      const rail = new Mesh(new TorusGeometry(r, .14, 8, 24, Math.PI / 2), stage.material(0x89b6b3));
      rail.rotation.set(Math.PI / 2, 0, corner * Math.PI / 2);
      rail.position.set(corner === 0 || corner === 3 ? 3.6 : -3.6, .18, corner < 2 ? 6.6 : -6.6);
      stage.content.add(rail);
    }
    this.goals = [new Group(), new Group()];
    for (const side of [0, 1] as const) {
      const goal = this.goals[side], z = side === 0 ? -9 : 9, color = side === 0 ? 0xe9a28b : 0x8bcfe0;
      for (const sign of [-1, 1]) {
        this.box(1.2, .42, .28, 0x89b6b3, stage.content, sign * 3, .15, z);
        this.box(.15, 1.1, 1.25, color, goal, sign * 2.4, .5, z + (side ? .5 : -.5));
      }
      this.box(4.95, .15, .15, color, goal, 0, 1.03, z + (side ? 1.1 : -1.1));
      this.box(4.9, .75, .08, 0x456876, goal, 0, .35, z + (side ? 1.15 : -1.15));
      stage.content.add(goal);
    }
    this.robots = [this.robot(0x78c9df), this.robot(0xe8a28d)];
    const sphere = stage.shape('sphere', .4, 0xf3eed9);
    this.ball.add(sphere);
    for (let axis = 0; axis < 2; axis++) {
      const stripe = stage.shape('ring', .37, 0x314f61);
      stripe.rotation.x = axis * Math.PI / 2;
      this.ball.add(stripe);
    }
    stage.content.add(this.ball);
    stage.content.scale.setScalar(.92);
    stage.tween(stage.content, { scale: 1 }, 'entry');
  }
  private box(w: number, h: number, d: number, color: number, parent: Group, x = 0, y = 0, z = 0) { const mesh = this.stage.box(w, h, d, color); mesh.position.set(x, y, z); parent.add(mesh); return mesh; }
  private robot(color: number) {
    const group = new Group();
    this.box(1.05, .34, 1.03, color, group, 0, .24);
    this.box(.78, .48, .72, color, group, 0, .63);
    this.box(.52, .14, .07, 0x274658, group, 0, .68, .37);
    for (const x of [-.43, .43])
      for (const z of [-.33, .33]) {
        const wheel = this.stage.shape('sphere', .23, 0x263f50);
        wheel.scale.set(.4, 1, 1);
        wheel.position.set(x, .15, z);
        group.add(wheel);
      }
    const aerial = this.stage.shape('sphere', .08, color);
    aerial.position.y = 1.05;
    group.add(aerial);
    this.stage.content.add(group);
    return group;
  }
  render(state: MatchState, dt: number) {
    for (const side of [0, 1] as const) {
      const robot = state.robots[side], view = this.robots[side];
      view.position.set(robot.x, 0, robot.y);
      view.rotation.y = Math.atan2(robot.facingX, robot.facingY);
      view.scale.setScalar(robot.dashLeft > 0 ? 1.08 : 1);
    }
    this.ball.position.set(state.ball.x, .42, state.ball.y);
    if (!this.stage.reducedMotion) {
      this.ball.rotation.x += state.ball.vy * dt * 1.7;
      this.ball.rotation.z -= state.ball.vx * dt * 1.7;
    }
    if (this.serial !== state.goalSerial) {
      this.serial = state.goalSerial;
      const goal = this.goals[state.lastScorer === 0 ? 0 : 1];
      goal.scale.setScalar(1.12);
      this.stage.tween(goal, { scale: 1 }, 'score');
      if (state.mode === 'over')
        this.stage.tween(this.robots[state.winner === 0 ? 1 : 0], { scale: .85 }, 'failure');
    }
  }
}
