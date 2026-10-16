import { CylinderGeometry, Group, Mesh, TorusGeometry } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { LightsModel } from './model';

const point = (cell: number) => ({ x: (cell % 5 - 2) * 1.12, y: (2 - Math.floor(cell / 5)) * 1.12 });

export function createView(stage: Stage, model: LightsModel) {
  stage.framing('board', 6.5, 6.5);
  printBackdrop(stage, 'night');
  stage.board(6.3, 6.3, INK.black);
  const panel = stage.box(6.16, 6.16, .06, INK.blue, .01);
  panel.position.z = -.16;
  stage.content.add(panel);
  stage.gridBounds(5, 5, 5.6, 5.6);
  const connectors: { mesh: Mesh; a: number; b: number }[] = [];
  const diskGeometry = new CylinderGeometry(.405, .405, .10, 48);
  diskGeometry.rotateX(Math.PI / 2);
  const rimGeometry = new TorusGeometry(.43, .012, 4, 48);
  for (let cell = 0; cell < 25; cell++) {
    const p = point(cell);
    if (cell % 5 < 4) {
      const mesh = stage.tile(p.x + .56, p.y, .28, .025, INK.paper, .012);
      mesh.position.z = -.08;
      connectors.push({ mesh, a: cell, b: cell + 1 });
    }
    if (cell < 20) {
      const mesh = stage.tile(p.x, p.y - .56, .025, .28, INK.paper, .012);
      mesh.position.z = -.08;
      connectors.push({ mesh, a: cell, b: cell + 5 });
    }
  }
  const lamps = Array.from({ length: 25 }, (_, cell) => {
    const p = point(cell);
    const base = stage.tile(p.x, p.y, 1.02, 1.02, INK.black, .055, cell);
    base.position.z = -.055;
    const disk = new Mesh(diskGeometry, stage.material(INK.black));
    disk.position.z = .065;
    disk.castShadow = true;
    disk.receiveShadow = true;
    base.add(disk);
    const rim = new Mesh(rimGeometry, stage.material(INK.muted));
    rim.position.z = .10;
    base.add(rim);
    const hint = new Group();
    for (const [x, y, w, h] of [[-.37, .47, .24, .035], [.37, .47, .24, .035], [-.47, .37, .035, .24], [.47, .37, .035, .24], [-.37, -.47, .24, .035], [.37, -.47, .24, .035], [-.47, -.37, .035, .24], [.47, -.37, .035, .24]]) {
      const mark = stage.box(w, h, .018, INK.paper, .003);
      mark.position.set(x, y, .15);
      hint.add(mark);
    }
    hint.visible = false;
    base.add(hint);
    return { disk, rim, hint };
  });
  const celebration = new Group();
  for (const [x, y, w, h] of [[0, 2.99, 5.98, .035], [0, -2.99, 5.98, .035], [-2.99, 0, .035, 5.98], [2.99, 0, .035, 5.98]]) {
    const margin = stage.box(w, h, .018, INK.yellow, .002);
    margin.position.set(x, y, -.075);
    celebration.add(margin);
  }
  celebration.visible = false;
  stage.content.add(celebration);
  let signature = '', moves = -1, previous = [...model.board], won = model.mode === 'won';

  return (_dt: number) => {
    const next = model.board.join('') + ':' + model.hinted + ':' + model.epoch + ':' + model.mode;
    if (signature === next) return;
    signature = next;
    lamps.forEach(({ disk, rim, hint }, cell) => {
      const lit = !!model.board[cell];
      disk.material = stage.material(lit ? INK.yellow : INK.black, lit ? INK.yellow : 0);
      rim.material = stage.material(lit ? INK.paper : INK.muted);
      hint.visible = model.hinted === cell;
      if (moves >= 0 && model.moves !== moves && previous[cell] !== model.board[cell]) {
        disk.position.z = .025;
        stage.tween(disk, { z: .065 }, 'score');
      }
    });
    connectors.forEach(({ mesh, a, b }) => { mesh.material = stage.material(model.board[a] || model.board[b] ? INK.yellow : INK.muted); });
    celebration.visible = model.mode === 'won';
    if (celebration.visible && !won) {
      celebration.scale.setScalar(.97);
      stage.tween(celebration, { scale: 1 }, 'entry');
    }
    won = celebration.visible;
    moves = model.moves;
    previous = [...model.board];
  };
}
