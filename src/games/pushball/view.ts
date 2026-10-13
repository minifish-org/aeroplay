import {
  BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, OrthographicCamera, RingGeometry, Shape, SphereGeometry,
  TorusGeometry, type BufferGeometry, type Material
} from 'three';
import { createStage } from '../../core/three/stage';
import { BALL_RADIUS, FIELD, ROBOT_RADIUS, type MatchState } from './model';

export function createPushballView(host: HTMLElement) {
  const camera = new OrthographicCamera(-7.8, 7.8, 11.8, -11.8, 0.1, 100);
  camera.position.set(0, 28, 10);
  camera.lookAt(0, 0, 0);
  const createdStage = createStage(host, camera, 0x0b1827);
  if (!createdStage) return null;
  const stage = createdStage;
  stage.canvas.setAttribute('aria-label', 'Robot Pushball arena. Blue attacks the top goal; coral attacks the bottom goal.');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = [0x53dafa, 0xff967b];
  const basic = (color: number) => new MeshBasicMaterial({ color });
  const surface = (color: number, glow = 0) => new MeshStandardMaterial({
    color, roughness: 0.62, metalness: 0.15, emissive: glow, emissiveIntensity: 0.25
  });
  const box = new BoxGeometry(1, 1, 1);
  function mesh(geometry: BufferGeometry, material: Material, parent: Group | typeof stage.scene = stage.scene) {
    const object = new Mesh(geometry, material);
    parent.add(object);
    return object;
  }
  function block(x: number, y: number, z: number, w: number, h: number, d: number,
    material: Material, parent: Group | typeof stage.scene = stage.scene) {
    const object = mesh(box, material, parent);
    object.position.set(x, y, z); object.scale.set(w, h, d);
    return object;
  }
  const navy = surface(0x172e40), stripeA = surface(0x234750), stripeB = surface(0x284d56);
  const markings = basic(0x70a5a8), rail = surface(0x3b6571), light = basic(0xcceeee);
  block(0, -0.42, 0, 13.5, 0.7, 21.8, navy);
  for (let row = 0; row < 10; row++) {
    block(0, -0.045, -FIELD.length / 2 + (row + 0.5) * FIELD.length / 10,
      FIELD.width, 0.08, FIELD.length / 10, row % 2 ? stripeA : stripeB);
  }
  block(0, 0.01, 0, FIELD.width, 0.025, 0.075, markings);
  const straightSide = FIELD.length - FIELD.cornerRadius * 2;
  for (const x of [-FIELD.width / 2, FIELD.width / 2]) {
    block(x, 0.33, 0, 0.18, 0.66, straightSide, rail);
    block(x, 0.67, 0, 0.08, 0.04, straightSide, markings);
  }
  // Solid curved bumpers remove the unreachable square pockets. Their inner
  // arc uses the same radius and centers as the shared collision model.
  const radius = FIELD.cornerRadius;
  const corner = new Shape();
  corner.moveTo(radius, 0);
  corner.lineTo(radius, radius);
  corner.lineTo(0, radius);
  corner.absarc(0, 0, radius, Math.PI / 2, 0, true);
  corner.closePath();
  const bumperGeometry = new ExtrudeGeometry(corner, { depth: 0.66, bevelEnabled: false, curveSegments: 24 });
  const rimGeometry = new TorusGeometry(radius, 0.035, 6, 32, Math.PI / 2);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const group = new Group();
    group.position.set(sx * (FIELD.width / 2 - radius), 0, sy * (FIELD.length / 2 - radius));
    group.scale.set(sx, 1, sy); stage.scene.add(group);
    const bumper = mesh(bumperGeometry, rail, group);
    bumper.rotation.x = Math.PI / 2; bumper.position.y = 0.66;
    const rim = mesh(rimGeometry, markings, group);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.68;
  }
  const center = mesh(new RingGeometry(1.8, 1.86, 48), markings);
  center.rotation.x = -Math.PI / 2; center.position.y = 0.02;
  const spot = mesh(new CircleGeometry(0.11, 20), light);
  spot.rotation.x = -Math.PI / 2; spot.position.y = 0.025;
  for (const end of [-1, 1]) {
    const color = colors[end < 0 ? 1 : 0], trim = basic(color);
    const z = end * FIELD.length / 2;
    const wallWidth = (FIELD.width - FIELD.goalWidth) / 2 - FIELD.cornerRadius;
    for (const side of [-1, 1]) {
      block(side * (FIELD.goalWidth / 2 + wallWidth / 2), 0.33, z, wallWidth, 0.66, 0.18, rail);
      block(side * FIELD.goalWidth / 2, 0.75, z, 0.14, 1.5, 0.14, trim);
      block(side * FIELD.goalWidth / 2, 0.4, z + end * 1.25, 0.12, 0.8, 0.12, rail);
      block(side * FIELD.goalWidth / 2, 0.8, z + end * 0.62, 0.06, 0.06, 1.25, markings);
      block(side * 2.9, 0.02, z - end * 2.3, 0.06, 0.03, 4.6, markings);
    }
    block(0, 1.5, z, FIELD.goalWidth + 0.14, 0.12, 0.12, trim);
    block(0, 0.4, z + end * 1.25, FIELD.goalWidth, 0.8, 0.12, navy);
    block(0, 0.02, z - end * 4.6, 5.8, 0.03, 0.06, markings);
    block(0, -0.01, z + end * 0.62, FIELD.goalWidth, 0.08, 1.25, surface(color));
    for (let x = -2.2; x <= 2.2; x += 0.4) block(x, 0.4, z + end * 1.16, 0.025, 0.8, 0.025, markings);
    for (let y = 0.18; y <= 0.8; y += 0.2) block(0, y, z + end * 1.16, FIELD.goalWidth, 0.025, 0.025, markings);
  }
  const shadowMaterial = new MeshBasicMaterial({ color: 0x071826, transparent: true, opacity: 0.35, depthWrite: false });
  const robots = colors.map(color => {
    const group = new Group(); stage.scene.add(group);
    const armor = surface(color, color), dark = surface(0x182d3b);
    const chassis = mesh(new CylinderGeometry(ROBOT_RADIUS, ROBOT_RADIUS, 0.5, 16), dark, group);
    chassis.position.y = 0.35;
    const plate = mesh(new CylinderGeometry(0.62, 0.67, 0.24, 16), armor, group);
    plate.position.y = 0.7;
    block(0, 0.95, -0.04, 0.96, 0.38, 0.63, dark, group);
    for (const x of [-0.23, 0.23]) block(x, 0.99, -0.365, 0.18, 0.09, 0.045, light, group);
    const antenna = mesh(new SphereGeometry(0.09, 8, 8), basic(color), group);
    antenna.position.set(0, 1.35, 0.08);
    block(0, 1.19, 0.08, 0.04, 0.25, 0.04, armor, group);
    const bumper = mesh(new TorusGeometry(0.68, 0.09, 8, 24), armor, group);
    bumper.rotation.x = Math.PI / 2; bumper.position.y = 0.35;
    const shadow = mesh(new CircleGeometry(0.92, 24), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.015;
    const ring = mesh(new RingGeometry(0.95, 1.02, 32), basic(color));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    return { group, armor, shadow, ring };
  });
  const ball = new Group(); stage.scene.add(ball);
  mesh(new SphereGeometry(BALL_RADIUS, 24, 16), surface(0xffedbe, 0x55401c), ball);
  const seamMaterial = basic(0x364d57);
  for (const rotation of [0, Math.PI / 2]) {
    const seam = mesh(new TorusGeometry(BALL_RADIUS, 0.026, 6, 32), seamMaterial, ball);
    seam.rotation.y = rotation;
  }
  const ballShadow = mesh(new CircleGeometry(0.5, 20), shadowMaterial);
  ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = 0.02;
  let previousBall = { x: 0, y: 0 }, goalSerial = -1;
  stage.resize();
  return {
    canvas: stage.canvas,
    get available() { return stage.available; },
    render(state: MatchState, dt = 0) {
      state.robots.forEach((body, side) => {
        const item = robots[side];
        item.group.position.set(body.x, 0, body.y);
        const target = Math.atan2(-body.facingX, -body.facingY);
        const delta = Math.atan2(Math.sin(target - item.group.rotation.y), Math.cos(target - item.group.rotation.y));
        item.group.rotation.y += reduced.matches ? delta : delta * Math.min(1, dt * 18 || 1);
        item.armor.emissiveIntensity = body.dashLeft > 0 ? 0.9 : 0.25;
        item.shadow.position.set(body.x, 0.015, body.y);
        item.ring.position.set(body.x, 0.03, body.y);
        item.ring.scale.setScalar(body.dashLeft > 0 && !reduced.matches ? 1.18 : 1);
      });
      ball.position.set(state.ball.x, BALL_RADIUS + 0.04, state.ball.y);
      if (goalSerial === state.goalSerial) {
        ball.rotation.x += (state.ball.y - previousBall.y) / BALL_RADIUS;
        ball.rotation.z -= (state.ball.x - previousBall.x) / BALL_RADIUS;
      } else ball.rotation.set(0, 0, 0);
      previousBall = { x: state.ball.x, y: state.ball.y }; goalSerial = state.goalSerial;
      ballShadow.position.set(state.ball.x, 0.02, state.ball.y);
      stage.render();
    },
    dispose() { stage.dispose(); }
  };
}
