import { ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import { FLIGHT, type FlappyModel } from './model';

const unit = 50;
const worldX = (x: number) => (x - FLIGHT.width / 2) / unit;
const worldY = (y: number) => (FLIGHT.height / 2 - y) / unit;

export function createFlappyView(stage: Stage, model: FlappyModel) {
  stage.framing('board', 5.2, 10, { x: worldX(FLIGHT.birdX), screen: .25 });
  printBackdrop(stage, 'wind');
  const relief = (shape: Shape, color: number, parent: Group, depth = .035) => {
    const mesh = new Mesh(new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 }), stage.material(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const polygon = (points: number[][], color: number, parent: Group, depth = .035) => {
    const shape = new Shape();
    points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    return relief(shape, color, parent, depth);
  };
  const block = (width: number, height: number, depth: number, color: number, parent: Group, x = 0, y = 0, z = 0) => {
    const mesh = stage.box(width, height, depth, color, .008);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  const scenery = new Group();
  stage.content.add(scenery);
  const disc = new Shape();
  disc.absarc(0, 0, 1.35, 0, Math.PI * 2, false);
  const sun = relief(disc, INK.red, scenery);
  sun.position.set(-2.6, 3.25, -1.18);
  const horizon = polygon([[-24, -4.48], [-24, -3.8], [-12, -3.7], [-6, -3.95], [2, -3.65], [9, -3.85], [24, -3.5], [24, -4.48]], 0x163f65, scenery);
  horizon.position.z = -.82;
  const coast = new Group();
  scenery.add(coast);
  coast.position.z = -.62;
  polygon([[-6, -4.5], [-6, -1.2], [-5.3, -1.6], [-4.6, -2.2], [-3.5, -2.45], [-2.7, -3.1], [-1.7, -3.35], [-.5, -3.8], [1, -4.1], [2, -4.5]], 0x163650, coast);
  for (let index = 0; index < 11; index++) {
    const x = -5.8 + index * .46, y = -1.2 - index * .28;
    polygon([[x - .1, y - .9], [x - .1, y], [x, y + .42], [x + .1, y], [x + .1, y - .9]], INK.black, coast);
    if (index < 6) {
      block(.3, .35, .025, INK.paper, coast, x + .1, y - .55, .04);
      block(.12, .22, .03, INK.black, coast, x + .1, y - .6, .065);
    }
  }
  type Curve = [number, number, number, number, number, number];
  const crests: Curve[][] = [
    [[-4.8, .85, -3.95, 1.05, -3.5, .45], [-3.5, 1.8, -2.05, 1.95, -1.6, .7], [-.9, 1.4, .2, 1.15, .3, .4], [1.15, 1.02, 2.3, .55, 2.6, -.08], [3.4, .2, 4.2, -.25, 5, -.6]],
    [[-3.9, .05, -3.15, .4, -2.9, -.02], [-3.05, .88, -1.9, 1.12, -1.45, .35], [-1.05, 1.68, .65, 1.7, 1.05, .65], [1.55, 1.04, 2.35, .56, 2.48, .08], [3.2, .48, 4.1, -.05, 5, -.55]],
    [[-4.5, .62, -3.45, .55, -3.1, .08], [-2.85, 1.24, -1.3, 1.4, -.95, .45], [-.15, 1.05, .8, .68, .95, .12], [1.7, .62, 2.9, .42, 3.2, -.05], [3.8, .25, 4.6, -.15, 5, -.4]]
  ];
  const clouds = crests.map((curves, index) => {
    const cloud = new Group(), silhouette = new Shape();
    silhouette.moveTo(-5, -1.1);
    silhouette.lineTo(-5, -.5);
    curves.forEach(curve => silhouette.bezierCurveTo(...curve));
    silhouette.lineTo(5, -1.1);
    silhouette.closePath();
    relief(silhouette, INK.paper, cloud, .025);
    // Separate, tapering gouges follow the bank instead of nesting one cloud icon.
    for (let line = 0; line < 4; line++) {
      const inset = .13 + line * .12, start = [-4.65 + line * .2, -.5 - inset];
      const cuts: Curve[] = curves.map((curve, segment) => [
        curve[0] * .9, curve[1] - inset - segment * .025,
        curve[2] * .9, curve[3] - inset - segment * .025,
        curve[4] * .9, curve[5] - inset - segment * .025
      ]);
      const gouge = new Shape(), thickness = .025 + line * .004;
      gouge.moveTo(start[0], start[1]);
      cuts.forEach(curve => gouge.bezierCurveTo(...curve));
      const end = cuts[cuts.length - 1];
      gouge.lineTo(end[4], end[5] - thickness);
      for (let segment = cuts.length - 1; segment >= 0; segment--) {
        const curve = cuts[segment], previous = segment ? cuts[segment - 1].slice(4) : start;
        gouge.bezierCurveTo(curve[2], curve[3] - thickness, curve[0], curve[1] - thickness, previous[0], previous[1] - thickness);
      }
      gouge.closePath();
      relief(gouge, INK.blue, cloud, .009).position.z = .035;
    }
    cloud.scale.set(index === 2 ? .9 : 1, index === 2 ? -.72 : index === 1 ? .86 : 1, 1);
    cloud.position.z = -.95 + index * .07;
    scenery.add(cloud);
    return cloud;
  });
  const wind = Array.from({ length: 7 }, (_, index) => {
    const line = block(2.2 + index % 3, .018, .012, INK.paper, scenery, 0, 2.5 - index * .8, -.5);
    line.rotation.z = .12;
    return line;
  });
  const ground = block(40, .5, .24, INK.black, stage.content, 0, worldY(FLIGHT.ground) - .25, .08);
  const groundLine = block(40, .045, .025, INK.paper, stage.content, 0, worldY(FLIGHT.ground) - .025, .23);

  const bird = new Group(), body = new Group(), wing = new Group();
  stage.content.add(bird);
  bird.add(body);
  polygon([[-.23, -.04], [-.11, .15], [.09, .19], [.25, .07], [.2, -.11], [-.03, -.2]], INK.red, body, .085);
  polygon([[-.2, -.04], [-.42, -.02], [-.24, -.15], [-.39, -.2], [-.08, -.15]], 0xa62417, body);
  polygon([[-.03, -.2], [.19, -.11], [.07, -.08], [-.16, -.12]], INK.black, body).position.z = .09;
  polygon([[.23, .075], [.4, .025], [.23, -.02]], INK.yellow, body);
  wing.position.set(-.06, .015, .11);
  body.add(wing);
  polygon([[.03, -.04], [-.1, .23], [-.32, .34], [-.24, .08]], INK.red, wing, .045);
  polygon([[-.1, .22], [-.28, .29], [-.22, .2], [-.08, .15]], 0xa62417, wing).position.z = .05;
  polygon([[-.08, .14], [-.22, .17], [-.18, .1], [-.05, .08]], INK.black, wing).position.z = .055;
  const eyeShape = new Shape();
  eyeShape.absarc(0, 0, .036, 0, Math.PI * 2, false);
  const eye = relief(eyeShape, INK.black, body);
  eye.position.set(.16, .09, .12);
  const trail = Array.from({ length: 2 }, (_, index) => {
    const mark = block(.28 + index * .18, .018, .018, INK.paper, bird, -.51 - index * .28, -.07 - index * .07, -.03);
    mark.rotation.z = .1;
    return mark;
  });

  const pipes = Array.from({ length: 12 }, () => {
    const group = new Group();
    stage.content.add(group);
    const halves = Array.from({ length: 2 }, () => ({
      shaft: block(FLIGHT.pipeWidth / unit, 1, .5, INK.black, group),
      side: block(.1, 1, .025, INK.paper, group),
      cap: block((FLIGHT.pipeWidth + 8) / unit, .14, .56, INK.black, group),
      rim: block((FLIGHT.pipeWidth + 8) / unit, .036, .025, INK.paper, group)
    }));
    const marks = Array.from({ length: 3 }, (_, index) => block(.14, .024, .018, INK.yellow, group, -.24 + index * .24));
    return { group, halves, marks };
  });
  const popup = stage.label('', 1.9, '#f4dfad', .42);
  popup.visible = false;
  let serial = model.serial, flapAt = -1, epoch = model.epoch;
  const setHalf = (half: typeof pipes[number]['halves'][number], x: number, start: number, end: number, upper: boolean) => {
    const height = Math.max(.01, (end - start) / unit), center = worldY((start + end) / 2);
    half.shaft.position.set(x, center, .08);
    half.shaft.scale.y = height;
    half.side.position.set(x - FLIGHT.pipeWidth / unit / 2 + .065, center, .35);
    half.side.scale.y = height;
    const edge = worldY(upper ? end : start);
    half.cap.position.set(x, edge + (upper ? .07 : -.07), .1);
    half.rim.position.set(x, edge + (upper ? .018 : -.018), .4);
  };

  return {
    draw() {
      const bounds = stage.bounds(), center = (bounds.left + bounds.right) / 2;
      ground.position.x = groundLine.position.x = center;
      sun.position.x = bounds.left + .65;
      coast.position.x = bounds.left + 5;
      model.setVisibleWidth(bounds.right * unit + FLIGHT.width / 2);
      const distance = stage.reducedMotion ? 0 : model.distance / unit;
      clouds.forEach((cloud, index) => {
        const span = bounds.width + 14;
        const anchor = index === 0 ? bounds.left + 1.1 : index === 1 ? bounds.right + 2.3 : bounds.right + .7;
        cloud.position.x = bounds.left - 7 + ((anchor - bounds.left + 7 - distance * (.035 + index * .018)) % span + span) % span;
        cloud.position.y = index === 0 ? -4.3 : index === 1 ? -1.85 : 5.55;
      });
      wind.forEach((line, index) => { line.position.x = bounds.left - 2 + ((index * 4.3 - distance * .28) % (bounds.width + 5) + bounds.width + 5) % (bounds.width + 5); });
      if (epoch !== model.epoch) {
        epoch = model.epoch;
        body.scale.setScalar(1);
        body.rotation.z = 0;
        stage.tween(body, { scale: 1, rz: 0 }, 'failure');
        flapAt = -1;
      }
      bird.position.set(worldX(FLIGHT.birdX), worldY(model.y), .72);
      bird.rotation.z = Math.max(-.7, Math.min(.4, -model.velocity / 550));
      const flap = Math.min(1, Math.max(0, (model.time - flapAt) / .24));
      wing.rotation.z = stage.reducedMotion || model.mode === 'over' ? -.2 : -.95 * Math.sin(flap * Math.PI);
      wing.scale.y = stage.reducedMotion ? 1 : 1 - .38 * Math.sin(flap * Math.PI);
      trail.forEach(mark => { mark.visible = model.mode === 'playing' && !stage.reducedMotion && flap < .6; });
      pipes.forEach(({ group, halves, marks }, index) => {
        const pipe = model.pipes[index];
        group.visible = !!pipe;
        if (!pipe)
          return;
        const x = worldX(pipe.x + FLIGHT.pipeWidth / 2), bottom = pipe.gapY + pipe.gap;
        setHalf(halves[0], x, 0, pipe.gapY, true);
        setHalf(halves[1], x, bottom, FLIGHT.ground, false);
        marks.forEach((mark, position) => {
          mark.visible = !pipe.scored;
          mark.position.set(x - .24 + position * .24, worldY(pipe.gapY + pipe.gap / 2), .42);
        });
      });
      if (serial !== model.serial) {
        serial = model.serial;
        if (model.event === 'flap')
          flapAt = model.time;
        if (model.event === 'score') {
          stage.text(popup, model.perfect ? 'PERFECT +2' : '+1');
          popup.rotation.z = model.perfect ? .09 : 0;
          popup.position.set(Math.max(bounds.left + 1, bird.position.x - .3), Math.min(4.15, bird.position.y + .55), 1);
          popup.scale.setScalar(model.perfect ? .78 : .9);
          stage.tween(popup, { scale: 1, y: popup.position.y + .18 }, 'score');
        }
        if (model.event === 'hit') {
          body.scale.set(1.08, .82, 1);
          stage.tween(body, { scale: 1, rz: -.16 }, 'failure');
        }
      }
      popup.visible = model.flash > 0 && model.mode === 'playing';
    }
  };
}
