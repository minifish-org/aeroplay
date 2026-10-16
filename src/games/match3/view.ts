import { Color, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { Match3Model } from './model';

const colors = [INK.red, INK.yellow, INK.blue, INK.green, INK.purple].map((color, index) => index < 2 ? color : new Color(color).lerp(new Color(INK.paper), .12).getHex());
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function createMatch3View(stage: Stage, model: Match3Model) {
  stage.framing('board', 8.35, 8.35);
  printBackdrop(stage, 'pattern');
  stage.board(8.3, 8.3, INK.black);
  stage.gridBounds(8, 8, 8, 8);
  const templates = colors.map((color, index) => {
    const shape = new Shape();
    const points = index === 0 ? Array.from({ length: 48 }, (_, i) => [Math.cos(i * Math.PI / 24) * .37, Math.sin(i * Math.PI / 24) * .37])
      : index === 1 ? [[0, .42], [-.40, -.32], [.40, -.32]]
      : index === 2 ? [[0, .42], [-.39, 0], [0, -.42], [.39, 0]]
      : index === 3 ? [[-.15, .40], [.15, .40], [.15, .15], [.40, .15], [.40, -.15], [.15, -.15], [.15, -.40], [-.15, -.40], [-.15, -.15], [-.40, -.15], [-.40, .15], [-.15, .15]]
      : [[-.35, .35], [.35, .35], [.35, -.35], [-.35, -.35]];
    points.forEach(([x, y], point) => { if (point) shape.lineTo(x, y); else shape.moveTo(x, y); });
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth: .14, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 1, steps: 1 });
    const gem = new Mesh(geometry, stage.material(color));
    gem.visible = false;
    gem.castShadow = true;
    gem.receiveShadow = true;
    stage.content.add(gem);
    return gem;
  });
  const cells = Array.from({ length: 64 }, (_, index) => {
    const point = { x: index % 8, y: Math.floor(index / 8) }, x = point.x - 3.5, y = 3.5 - point.y;
    const socket = stage.tile(x, y, .95, .95, INK.black, .075, point);
    const gem = templates[model.grid[point.y][point.x]].clone();
    gem.visible = true;
    gem.userData.input = point;
    gem.position.set(x, y, .11);
    stage.content.add(gem);
    const mark = new Group();
    for (const [dx, dy, w, h] of [[0, .435, .87, .025], [0, -.435, .87, .025], [-.435, 0, .025, .87], [.435, 0, .025, .87]]) {
      const edge = stage.box(w, h, .012, INK.paper, .001);
      edge.position.set(dx, dy, .05);
      mark.add(edge);
    }
    mark.visible = false;
    socket.add(mark);
    return { socket, gem, mark, x, y, point };
  });
  const popup = stage.label('', 2.8, '#f0e5cc', .55);
  const popupPlate = stage.box(2.85, .58, .012, INK.black, .005);
  popupPlate.position.z = -.018;
  popup.add(popupPlate);
  popup.visible = false;
  const result = new Group();
  for (const [x, y, w, h] of [[0, 4.10, 8.20, .025], [0, -4.10, 8.20, .025], [-4.10, 0, .025, 8.20], [4.10, 0, .025, 8.20]]) {
    const edge = stage.box(w, h, .014, INK.yellow, .002);
    edge.position.set(x, y, -.13);
    result.add(edge);
  }
  result.visible = false;
  stage.content.add(result);
  let serial = model.serial, phase = model.phase, score = model.score, popupUntil = 0, phaseAt = model.clock, won = model.mode === 'won';
  let swap: Match3Model['swap'] = null;

  return {
    draw() {
      if (stage.reducedMotion)
        for (let count = 0; count < 128 && ['clearing', 'falling'].includes(model.phase); count++)
          model.step(.4);
      if (model.score < score) popupUntil = 0;
      const changed = serial !== model.serial || phase !== model.phase;
      if (changed) phaseAt = model.clock;
      if (model.swap !== swap) {
        swap = model.swap;
        popupUntil = 0;
        if (swap && !swap.accepted) {
          stage.text(popup, 'No match');
          popup.position.set(Math.max(-2.2, Math.min(2.2, (swap.a.x + swap.b.x) / 2 - 3.5)), Math.max(-3.2, Math.min(3.2, 3.5 - (swap.a.y + swap.b.y) / 2)), .9);
          popupUntil = model.clock + .24;
          const socket = cells[swap.a.y * 8 + swap.a.x].socket;
          socket.position.z = -.035;
          stage.tween(socket, { z: 0 }, 'failure');
        }
      }
      if (model.score > score) {
        stage.text(popup, `+${model.score - score}${model.chain > 1 ? ' · ×' + model.chain : ''}`);
        const center = model.matching[0] ?? { x: 3, y: 3 };
        popup.position.set(Math.max(-2.2, Math.min(2.2, center.x - 3.5)), Math.max(-3.2, Math.min(3.2, 3.5 - center.y)), .9);
        stage.tween(popup, { y: popup.position.y + .3 }, 'settle');
        popupUntil = model.clock + .32;
      }
      popup.visible = !stage.reducedMotion && model.mode === 'playing' && model.clock < popupUntil;
      score = model.score;
      cells.forEach(({ socket, gem, mark, point, x, y }) => {
        const value = model.grid[point.y][point.x], selected = model.selected?.x === point.x && model.selected?.y === point.y;
        const hinted = model.hinted.some(hint => hint.x === point.x && hint.y === point.y);
        const swapped = swap && (swap.a.x === point.x && swap.a.y === point.y ? swap.b : swap.b.x === point.x && swap.b.y === point.y ? swap.a : null);
        const age = swap ? model.clock - swap.at : 1;
        const rejected = !!(swap && !swap.accepted && age < .28 && swapped);
        const clearing = model.phase === 'clearing' && model.matching.some(match => match.x === point.x && match.y === point.y);
        socket.material = stage.material(INK.black);
        mark.visible = rejected || selected || hinted || clearing;
        mark.children.forEach(edge => { (edge as Mesh).material = stage.material(rejected ? INK.red : selected ? INK.yellow : INK.paper); });
        gem.visible = value >= 0;
        if (value >= 0) {
          gem.geometry = templates[value].geometry;
          gem.material = templates[value].material;
          gem.rotation.set(0, 0, 0);
        }
        if (swapped && age < (swap!.accepted ? .16 : .28)) {
          const offset = stage.reducedMotion ? 0 : swap!.accepted ? 1 - clamp(age / .16) : Math.sin(age / .28 * Math.PI) * .24;
          gem.position.set(x + (swapped.x - point.x) * offset, y - (swapped.y - point.y) * offset, .11);
        } else if (model.phase !== 'falling') {
          gem.position.set(x, y, .11);
        }
        if (clearing) {
          const starts = Math.max(phaseAt, swap?.accepted ? swap.at + .14 : 0);
          const progress = stage.reducedMotion ? 1 : clamp(Math.max(0, model.clock - starts) / .14);
          gem.scale.setScalar(Math.max(.04, 1 - progress));
          gem.position.z = .11 - progress * .07;
        } else if (changed && model.phase === 'falling') {
          const fall = model.falls.find(move => move.x === point.x && move.to === point.y);
          gem.scale.setScalar(1);
          gem.position.set(x, fall ? 3.5 - fall.from : y, .11);
          if (fall) stage.tween(gem, { y }, 'score');
        } else if (changed) {
          gem.scale.setScalar(1);
        }
      });
      result.visible = model.mode === 'won';
      if (result.visible && !won) {
        result.scale.setScalar(.98);
        stage.tween(result, { scale: 1 }, 'entry');
      }
      won = result.visible;
      serial = model.serial;
      phase = model.phase;
    }
  };
}
