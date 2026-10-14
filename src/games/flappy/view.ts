import { Group, type Mesh } from 'three';
import type { Stage } from '../../core/stage';
import { FLIGHT, type FlappyModel } from './model';

const unit = 50;
const worldX = (x: number) => (x - FLIGHT.width / 2) / unit;
const worldY = (y: number) => (FLIGHT.height / 2 - y) / unit;
export function createFlappyView(stage: Stage, model: FlappyModel) {
  stage.framing('board', 7.8, 10);
  stage.board(7.7, 9.9, 0x213d58);
  const moon = stage.shape('sphere', .75, 0xf2cd83);
  moon.position.set(2.2, 3.3, -.16); moon.scale.z = .25;
  const clouds = Array.from({ length: 6 }, (_, index) => {
    const cloud = stage.shape('sphere', .3 + index % 3 * .08, 0x496c88);
    cloud.scale.set(2.5, .6, .3); cloud.position.set(-3 + index * 1.2, 2 - index % 3 * 1.7, -.12);
    return { cloud, x: cloud.position.x };
  });
  for (let index = 0; index < 18; index++) {
    const star = stage.shape('sphere', .035, 0xa6bde8);
    star.position.set(-3.4 + index % 6 * 1.3, 4.2 - Math.floor(index / 6) * 2.7, -.1);
  }
  const ground = stage.tile(0, -4.58, 7.5, .65, 0x96d5b5, .3);
  const ridge = stage.tile(0, -4.25, 7.5, .12, 0xf2cd83, .28);
  ground.position.z = .1; ridge.position.z = .12;
  const bird = new Group(); stage.content.add(bird);
  const body = stage.shape('sphere', .26, 0xf2aa8b); bird.add(body); body.scale.set(1.2, 1, .75);
  const wing = stage.shape('sphere', .15, 0xf2cd83); bird.add(wing); wing.scale.set(1.2, .5, .35); wing.position.set(-.07, -.03, .23);
  const eye = stage.shape('sphere', .075, 0xeef5f8); bird.add(eye); eye.position.set(.15, .1, .18);
  const pupil = stage.shape('sphere', .035, 0x101b2b); bird.add(pupil); pupil.position.set(.18, .1, .25);
  const beak = stage.box(.2, .1, .1, 0xf2cd83); bird.add(beak); beak.position.set(.3, -.03, .1);
  const pipes = Array.from({ length: 5 }, () => {
    const parts = Array.from({ length: 4 }, (_, index) => {
      const mesh = stage.box(index % 2 ? 1.2 : 1.02, 1, .45, index % 2 ? 0x96d5b5 : 0x5cae91);
      stage.content.add(mesh); return mesh;
    });
    const dots = Array.from({ length: 6 }, () => stage.shape('sphere', .035, 0xf2cd83));
    return { parts, dots };
  });
  const popup = stage.label('', 2.2, '#f2cd83', .5); popup.visible = false;
  let serial = -1;
  bird.scale.setScalar(.2); stage.tween(bird, { scale: 1 }, 'entry');
  function pipePart(mesh: Mesh, x: number, y: number, height: number) {
    mesh.position.set(worldX(x + FLIGHT.pipeWidth / 2), worldY(y), .05);
    mesh.scale.y = Math.max(.06, height / unit);
  }
  return {
    draw() {
      bird.position.set(worldX(FLIGHT.birdX), worldY(model.y), .38);
      bird.rotation.z = Math.max(-.7, Math.min(.4, -model.velocity / 550));
      clouds.forEach(({ cloud, x }) => { cloud.position.x = stage.reducedMotion ? x : ((x - model.distance * .08 / unit + 15) % 9) - 4.5; });
      pipes.forEach(({ parts, dots }, index) => {
        const pipe = model.pipes[index]; parts.forEach(part => { part.visible = !!pipe; });
        dots.forEach((dot, position) => { dot.visible = !!pipe && !pipe.scored; if (pipe) dot.position.set(worldX(pipe.x + 4 + position * 9), worldY(pipe.gapY + pipe.gap / 2), .3); });
        if (!pipe) return;
        pipePart(parts[0], pipe.x, pipe.gapY / 2, pipe.gapY);
        pipePart(parts[1], pipe.x, pipe.gapY - 4, 12);
        const bottom = pipe.gapY + pipe.gap;
        pipePart(parts[2], pipe.x, (bottom + FLIGHT.ground) / 2, FLIGHT.ground - bottom);
        pipePart(parts[3], pipe.x, bottom + 4, 12);
      });
      if (serial !== model.serial) {
        serial = model.serial;
        if (model.event === 'flap') { wing.scale.y = .9; stage.tween(wing, { scale: 1 }, 'settle'); }
        if (model.event === 'score') {
          stage.effect(bird.position.x, bird.position.y, model.perfect ? 0xf2cd83 : 0x96d5b5);
          stage.text(popup, model.perfect ? 'Perfect +2' : '+1'); popup.position.set(bird.position.x + .9, bird.position.y + .55, .7);
          stage.tween(popup, { y: popup.position.y + .3 }, 'score');
        }
        if (model.event === 'hit') { stage.effect(bird.position.x, bird.position.y, 0xf2aa8b, 'failure'); stage.tween(bird, { scale: .8 }, 'failure'); }
      }
      popup.visible = model.flash > 0 && model.mode === 'playing';
    }
  };
}
