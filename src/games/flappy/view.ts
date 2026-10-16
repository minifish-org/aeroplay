import { BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, Path, Shape, TorusGeometry } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import { FLIGHT, type FlappyModel } from './model';

const unit = 50;
const worldX = (x: number) => (x - FLIGHT.width / 2) / unit;
const worldY = (y: number) => (FLIGHT.height / 2 - y) / unit;

export function createFlappyView(stage: Stage, model: FlappyModel) {
  stage.framing('board', 5.2, 10, { x: worldX(FLIGHT.birdX), screen: .25 });
  stage.relief(9);
  printBackdrop(stage, 'wind');
  const relief = (shape: Shape, color: number, parent: Group, depth = .24, side: number = INK.black) => {
    const bevel = Math.min(.012, depth / 4);
    const mesh = new Mesh(new ExtrudeGeometry(shape, { depth, bevelEnabled: depth > .025, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 14 }), [stage.material(color, 0, 'paper'), stage.material(side, 0, 'paper')]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const polygon = (points: number[][], color: number, parent: Group, depth = .24) => {
    const shape = new Shape();
    points.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    return relief(shape, color, parent, depth);
  };
  const block = (width: number, height: number, depth: number, color: number, parent: Group, x = 0, y = 0, z = 0) => {
    const mesh = stage.box(width, height, depth, color, Math.min(.018, depth / 5));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const folded = (vertices: number[][], faces: number[][], colors: number[], parent: Group) => {
    const positions: number[] = [], inks: number[] = [];
    faces.forEach((face, index) => {
      const color = new Color(colors[index % colors.length]);
      face.forEach(vertex => { positions.push(...vertices[vertex]); inks.push(color.r, color.g, color.b); });
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(inks, 3));
    geometry.computeVertexNormals();
    const material = stage.material(0xffffff, 0, 'paint').clone();
    material.vertexColors = true;
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  };
  const wingPlate = (points: number[][], color: number, parent: Group, y = .05, depth = .07) => {
    const plate = polygon(points, color, parent, depth);
    plate.rotation.x = Math.PI / 2;
    plate.position.y = y;
    plate.material = [stage.material(color, 0, 'paint'), stage.material(0x8a2925, 0, 'paint')];
  };

  const scenery = new Group();
  stage.content.add(scenery);
  const disc = new Shape();
  disc.absarc(0, 0, 1.35, 0, Math.PI * 2, false);
  const sun = relief(disc, INK.red, scenery, .065, INK.red);
  sun.position.set(-2.6, 3.25, -.58);
  const horizon = polygon([[-24, -4.48], [-24, -3.8], [-12, -3.7], [-6, -3.95], [2, -3.65], [9, -3.85], [24, -3.5], [24, -4.48]], 0x163f65, scenery);
  horizon.position.z = -.55;
  const coast = new Group();
  scenery.add(coast);
  coast.position.set(0, -4.17, -.48);
  for (let index = 0; index < 6; index++) {
    const height = .65 + index * .19;
    block(.63, height, .38, index % 2 ? INK.black : INK.paper, coast, -2.25 + index * .6, height / 2, -.04);
  }
  const arches = new Shape();
  arches.moveTo(-3, 0); arches.lineTo(3, 0); arches.lineTo(3, 1.05); arches.lineTo(-3, 1.05); arches.closePath();
  for (let index = 0; index < 7; index++) {
    const x = -2.55 + index * .85, hole = new Path();
    hole.moveTo(x - .24, .06); hole.lineTo(x - .24, .46); hole.absarc(x, .46, .24, Math.PI, 0, true); hole.lineTo(x + .24, .06); hole.closePath();
    arches.holes.push(hole);
  }
  relief(arches, INK.paper, coast, .27).position.z = .13;
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
    relief(silhouette, INK.paper, cloud, .32, 0xa8b8bd);
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
      relief(gouge, 0x728eaa, cloud, .009, 0x728eaa).position.z = .35;
    }
    cloud.scale.set(index === 2 ? .9 : 1, index === 2 ? -.72 : index === 1 ? .86 : 1, 1);
    cloud.position.z = -.53 + index * .025;
    scenery.add(cloud);
    return cloud;
  });
  const wind = Array.from({ length: 7 }, (_, index) => {
    const line = block(2.2 + index % 3, .018, .012, INK.paper, scenery, 0, 2.5 - index * .8, -.12);
    line.rotation.z = .12;
    line.castShadow = false;
    return line;
  });
  const ground = block(40, .5, .3, INK.black, stage.content, 0, worldY(FLIGHT.ground) - .25, .25);
  const groundLine = block(40, .045, .025, INK.paper, stage.content, 0, worldY(FLIGHT.ground) - .025, .42);

  const bird = new Group(), body = new Group(), sculpture = new Group();
  stage.content.add(bird);
  bird.add(body);
  body.add(sculpture);
  sculpture.scale.setScalar(.37);
  folded([[.72, .08, 0], [-.55, .04, 0], [-.20, .35, 0], [-.08, -.28, 0], [-.05, .02, .28], [-.05, .02, -.28]], [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]], [INK.red, 0xa82f27, INK.red, 0xdd5340], sculpture);
  folded([[.69, .13, -.08], [.69, .13, .08], [.95, .03, 0], [.69, -.01, 0]], [[0, 1, 2], [1, 3, 2], [3, 0, 2], [0, 3, 1]], [INK.yellow, 0x9b6e27], sculpture);
  const eye = new Mesh(new CylinderGeometry(.052, .052, .025, 12), stage.material(INK.black));
  eye.rotation.x = Math.PI / 2;
  eye.position.set(.34, .15, .261);
  sculpture.add(eye);
  const wings = [new Group(), new Group()];
  wings.forEach((wing, index) => {
    const side = index ? -1 : 1;
    wing.position.set(-.16, .08, side * .16);
    sculpture.add(wing);
    wingPlate([[.12, 0], [-.68, side * .46], [-.47, side * .89], [.15, side * .37]], index ? 0x9b2e28 : 0xda4b39, wing);
    wingPlate([[-.12, side * .12], [-.55, side * .46], [-.40, side * .66]], INK.red, wing, .07, .015);
  });
  wingPlate([[-.43, -.12], [-.98, -.24], [-.73, .02], [-.99, .18], [-.43, .12]], 0xa22f27, sculpture, .01);
  const trail = Array.from({ length: 2 }, (_, index) => {
    const mark = block(.28 + index * .18, .018, .018, INK.paper, bird, -.51 - index * .28, -.07 - index * .07, -.03);
    mark.rotation.z = .1;
    mark.castShadow = false;
    return mark;
  });

  const pipes = Array.from({ length: 12 }, () => {
    const group = new Group();
    stage.content.add(group);
    const halves = Array.from({ length: 2 }, () => ({
      shaft: block((FLIGHT.pipeWidth + 8) / unit, 1, .8, INK.black, group),
      side: block(.1, 1, .025, INK.paper, group),
      cap: block((FLIGHT.pipeWidth + 8) / unit, .14, .86, INK.black, group),
      rim: block((FLIGHT.pipeWidth + 8) / unit, .036, .025, INK.paper, group)
    }));
    const marks = Array.from({ length: 3 }, (_, index) => block(.14, .024, .018, INK.yellow, group, -.24 + index * .24));
    return { group, halves, marks };
  });
  const popup = stage.label('', 1.9, '#f4dfad', .42);
  popup.visible = false;
  const seal = new Mesh(new TorusGeometry(.25, .022, 6, 32), stage.material(INK.yellow, 0, 'metal'));
  seal.visible = false;
  stage.content.add(seal);
  let serial = model.serial, flapAt = -1, epoch = model.epoch, layoutReady = false;
  const setHalf = (half: typeof pipes[number]['halves'][number], x: number, start: number, end: number, upper: boolean) => {
    const height = Math.max(.01, (end - start) / unit), center = worldY((start + end) / 2);
    half.shaft.position.set(x, center, 0);
    half.shaft.scale.y = height;
    half.side.position.set(x - (FLIGHT.pipeWidth + 8) / unit / 2 + .065, center, .418);
    half.side.scale.y = height;
    const edge = worldY(upper ? end : start);
    half.cap.position.set(x, edge + (upper ? .07 : -.07), .02);
    half.rim.position.set(x, edge + (upper ? .018 : -.018), .47);
  };

  return {
    draw() {
      const bounds = stage.bounds(), center = (bounds.left + bounds.right) / 2;
      model.setVisibleWidth(bounds.right * unit + FLIGHT.width / 2);
      const distance = stage.reducedMotion ? 0 : model.distance / unit;
      if (model.mode !== 'paused' || !layoutReady) {
        ground.position.x = groundLine.position.x = center;
        sun.position.x = bounds.left + .65;
        coast.position.x = bounds.left + 2.4;
        clouds.forEach((cloud, index) => {
          const span = bounds.width + 14;
          const anchor = index === 0 ? bounds.left + 1.1 : index === 1 ? bounds.right + 2.3 : bounds.right + .7;
          cloud.position.x = bounds.left - 7 + ((anchor - bounds.left + 7 - distance * (.035 + index * .018)) % span + span) % span;
          cloud.position.y = index === 0 ? -4.3 : index === 1 ? -1.85 : 5.55;
        });
        wind.forEach((line, index) => { line.position.x = bounds.left - 2 + ((index * 4.3 - distance * .28) % (bounds.width + 5) + bounds.width + 5) % (bounds.width + 5); });
        layoutReady = true;
      }
      if (epoch !== model.epoch) {
        epoch = model.epoch;
        if (model.mode !== 'paused') {
          body.scale.setScalar(1);
          body.rotation.z = 0;
          stage.tween(body, { scale: 1, rz: 0 }, 'failure', 0);
          flapAt = -1;
        }
      }
      if (serial !== model.serial && model.event === 'flap')
        flapAt = model.time;
      bird.position.set(worldX(FLIGHT.birdX), worldY(model.y), .31);
      bird.rotation.z = Math.max(-.7, Math.min(.4, -model.velocity / 550));
      const flap = Math.min(1, Math.max(0, (model.time - flapAt) / .22));
      wings.forEach((wing, index) => {
        const side = index ? -1 : 1;
        wing.rotation.x = side * (model.mode === 'over' ? .55 : -.34 + (stage.reducedMotion ? 0 : 1.14 * Math.sin(flap * Math.PI)));
      });
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
        if (model.event === 'score') {
          stage.text(popup, model.perfect ? 'PERFECT +2' : '+1');
          popup.rotation.z = model.perfect ? .09 : 0;
          popup.position.set(Math.max(bounds.left + 1, bird.position.x - .3), Math.min(4.15, bird.position.y + .55), 1);
          popup.scale.setScalar(model.perfect ? .78 : .9);
          stage.tween(popup, { scale: 1, y: popup.position.y + .18 }, 'score');
          seal.position.set(bird.position.x - .3, bird.position.y + .25, .57);
          seal.scale.setScalar(.8);
          stage.tween(seal, { scale: 1.35 }, 'score', .24);
        }
        if (model.event === 'hit') {
          body.scale.set(1.08, .82, 1);
          stage.tween(body, { scale: 1, rz: -.16 }, 'failure', .24);
        }
      }
      popup.visible = model.flash > 0 && model.mode === 'playing';
      seal.visible = popup.visible && model.flash > .16 && model.perfect && !stage.reducedMotion;
    }
  };
}
