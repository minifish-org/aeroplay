import { Color, Fog, Group, type Mesh } from 'three';
import type { Stage } from '../../core/stage';
import { LANE_WIDTH, type SkyRun } from './model';
export class SkyView {
  private ship = new Group();
  private shield: Mesh;
  private flame: Mesh;
  private trail = new Group();
  private rows: {
    ring: Mesh;
    barriers: Mesh[];
  }[] = [];
  private time = 0;
  private sector = 0;
  private mode = '';
  private rings = 0;
  constructor(private stage: Stage) {
    const clouds = [[-4.8, 10, -20], [4.4, 12, -34], [-7, 15, -56], [7.8, 16, -78], [-2.2, 8, -53], [11, 11, -48]];
    clouds.forEach(([x, y, z], index) => {
      const cloud = new Group(), color = [0x597b89, 0x6b8b95, 0x789aa0][index % 3];
      for (const [size, dx, dy, sx, sy] of [[1.4, 0, .4, 1.25, 1], [1.1, -1.45, 0, 1.1, .9], [1.25, 1.3, .15, 1, .95], [1.65, 0, -.55, 1.8, .46]]) {
        const puff = stage.shape('sphere', size, color);
        puff.position.set(dx, dy, 0);
        puff.scale.set(sx, sy, .8);
        puff.castShadow = false;
        cloud.add(puff);
      }
      cloud.position.set(x, y, z);
      cloud.rotation.y = index * .31;
      cloud.scale.setScalar(index > 1 ? 1.3 : 1);
      stage.content.add(cloud);
    });
    const floor = stage.box(12, .22, 130, 0x395967);
    floor.position.set(0, -.22, -48);
    stage.content.add(floor);
    for (const x of [-4.8, -1.6, 1.6, 4.8]) {
      const line = stage.box(.05, .03, 115, 0x86aeb5);
      line.position.set(x, -.07, -44);
      stage.content.add(line);
    }
    for (let i = 0; i < 12; i++) {
      const cliff = stage.box(3, 1 + i % 4, 5, 0x486d73);
      cliff.position.set(i % 2 ? 9 : -9, -.4, -i * 9);
      stage.content.add(cliff);
    }
    const body = stage.box(.62, .24, 1.2, 0xe1bd78), wing = stage.box(1.7, .08, .45, 0xefd9a6);
    this.ship.add(body, wing);
    const cockpit = stage.shape('sphere', .27, 0x86cfdd);
    cockpit.scale.set(.8, .55, 1.5);
    cockpit.position.set(0, .17, -.05);
    this.ship.add(cockpit);
    this.flame = stage.shape('gem', .18, 0xf2ad75);
    this.flame.position.z = .8;
    this.ship.add(this.flame);
    for (const x of [-.55, .55]) {
      const streak = stage.box(.06, .05, 1.25, 0xf2cd83);
      streak.position.set(x, -.04, 1.7);
      this.trail.add(streak);
    }
    this.ship.add(this.trail);
    this.shield = stage.shape('ring', .78, 0x98d7e4);
    this.shield.rotation.x = Math.PI / 2;
    this.ship.add(this.shield);
    stage.content.add(this.ship);
    for (let i = 0; i < 14; i++) {
      const ring = stage.shape('ring', .95, 0xf3cf83), barriers = [];
      for (let lane = 0; lane < 3; lane++) {
        const block = stage.box(2.4, 2.4, .7, 0xf2aa8b);
        for (const angle of [-Math.PI / 4, Math.PI / 4]) {
          const mark = stage.box(1.5, .16, .06, 0xeef5f8);
          mark.position.z = .38;
          mark.rotation.z = angle;
          block.add(mark);
        }
        block.position.x = (lane - 1) * LANE_WIDTH;
        stage.content.add(block);
        barriers.push(block);
      }
      this.rows.push({ ring, barriers });
    }
    this.ship.scale.setScalar(.6);
    stage.tween(this.ship, { scale: 1 }, 'entry');
  }
  render(model: SkyRun, dt: number) {
    this.time += dt;
    const state = model.state;
    if (this.sector !== state.sector) {
      this.sector = state.sector;
      const color = [0x203d51, 0x4a4137, 0x30374e][(state.sector - 1) % 3];
      (this.stage.scene.background as Color).setHex(color);
      (this.stage.scene.fog as Fog).color.setHex(color);
      this.ship.scale.setScalar(.8);
      this.stage.tween(this.ship, { scale: 1 }, 'entry');
    }
    if (state.rings > this.rings)
      this.stage.effect(state.x, 1.4, 0xf3cf83, 'score');
    this.rings = state.rings;
    state.rows.forEach((row, index) => { const view = this.rows[index]; view.ring.position.set((row.safeLane - 1) * LANE_WIDTH, 1.35, -row.distance); view.ring.visible = !row.passed; view.ring.rotation.z = this.stage.reducedMotion ? 0 : this.time * .6; view.barriers.forEach((block, lane) => { block.visible = row.obstacles.includes(lane); block.position.y = 1.15; block.position.z = -row.distance; }); });
    this.ship.position.set(state.x, state.mode === 'over' ? .65 : 1.2, 2);
    this.ship.rotation.z = -(state.lane - 1 - state.x / LANE_WIDTH) * .3;
    this.ship.visible = true;
    this.flame.scale.z = state.boost > 0 ? 2.7 : 1;
    this.trail.visible = state.boost > 0;
    this.shield.visible = state.shield > 0 || state.invincible > 0;
    this.shield.material = this.stage.material(state.shield > 0 ? 0x98d7e4 : 0xf2aa8b);
    this.shield.scale.setScalar(state.invincible > 0 && !this.stage.reducedMotion ? 1 + Math.sin(this.time * 16) * .08 : 1);
    if (this.mode !== state.mode) {
      this.mode = state.mode;
      if (state.mode === 'playing')
        this.stage.tween(this.ship, { scale: 1 }, 'entry');
      if (state.mode === 'over')
        this.stage.tween(this.ship, { y: .65, scale: .8 }, 'failure');
      if (state.mode === 'won')
        this.stage.tween(this.ship, { scale: 1.15 }, 'score');
    }
  }
}
