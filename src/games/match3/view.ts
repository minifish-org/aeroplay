import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { Match3Model } from './model';

const colors = [INK.red, INK.yellow, INK.blue, INK.green, INK.purple];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function createMatch3View(stage: Stage, model: Match3Model) {
  stage.framing('board', 8.35, 8.35);
  stage.relief(35);
  printBackdrop(stage, 'pattern');
  const base = stage.box(8.3, 8.3, .48, INK.black, .045);
  base.position.z = -.37;
  const panel = stage.box(8.22, 8.22, .13, INK.black, .025);
  panel.position.z = -.065;
  stage.content.add(base, panel);
  stage.gridBounds(8, 8, 8, 8);
  const templates = colors.map((color, index) => {
    let geometry;
    if (index === 0) {
      geometry = new CylinderGeometry(.38, .38, .26, 40);
      geometry.rotateX(Math.PI / 2);
    } else {
      const shape = new Shape();
      const points = index === 1 ? [[0, -.43], [.40, .32], [-.40, .32]]
        : index === 2 ? [[0, -.43], [.40, 0], [0, .43], [-.40, 0]]
        : index === 3 ? [[-.13, -.40], [.13, -.40], [.13, -.13], [.40, -.13], [.40, .13], [.13, .13], [.13, .40], [-.13, .40], [-.13, .13], [-.40, .13], [-.40, -.13], [-.13, -.13]]
        : [[-.35, -.35], [.35, -.35], [.35, .35], [-.35, .35]];
      points.forEach(([x, y], point) => { if (point) shape.lineTo(x, y); else shape.moveTo(x, y); });
      shape.closePath();
      geometry = new ExtrudeGeometry(shape, { depth: .26, bevelEnabled: true, bevelSize: .025, bevelThickness: .02, bevelSegments: 2, steps: 1 });
      geometry.translate(0, 0, -.13);
    }
    const gem = new Mesh(geometry, stage.material(color, 0, 'ceramic'));
    gem.visible = false;
    gem.castShadow = gem.receiveShadow = true;
    stage.content.add(gem);
    return gem;
  });
  const cells = Array.from({ length: 64 }, (_, index) => {
    const point = { x: index % 8, y: Math.floor(index / 8) }, x = point.x - 3.5, y = 3.5 - point.y;
    const socket = stage.tile(x, y, .95, .95, 0x263134, .045, point);
    socket.position.z = .035;
    const gem = templates[model.grid[point.y][point.x]].clone();
    gem.visible = true;
    gem.userData.input = point;
    gem.position.set(x, y, .23);
    stage.content.add(gem);
    const mark = new Group();
    for (const [dx, dy, w, h] of [[0, .45, .90, .022], [0, -.45, .90, .022], [-.45, 0, .022, .90], [.45, 0, .022, .90]]) {
      const edge = stage.box(w, h, .014, INK.paper, .002);
      edge.position.set(dx, dy, .035);
      mark.add(edge);
    }
    mark.visible = false;
    socket.add(mark);
    return { socket, gem, mark, x, y, point, highlight: 0, from: 0, to: 0, age: 1 };
  });
  const popup = stage.label('', 2.8, '#' + INK.paper.toString(16), .55);
  const popupPlate = stage.box(2.85, .58, .012, INK.black, .005);
  popupPlate.position.z = -.018;
  popup.add(popupPlate);
  popup.visible = false;
  const result = new Group();
  for (const [x, y, w, h] of [[0, 4.10, 8.20, .025], [0, -4.10, 8.20, .025], [-4.10, 0, .025, 8.20], [4.10, 0, .025, 8.20]]) {
    const edge = stage.box(w, h, .025, INK.yellow, .003);
    edge.material = stage.material(INK.yellow, 0, 'metal');
    edge.position.set(x, y, .025);
    result.add(edge);
  }
  result.visible = model.mode === 'won';
  stage.content.add(result);
  let score = model.score, popupUntil = 0, popupAt = 0, popupY = 0, time = 0, epoch = model.epoch, won = model.mode === 'won';
  let swap: Match3Model['swap'] = null;

  return {
    draw(dt = 0) {
      time += Math.max(0, dt);
      if (stage.reducedMotion)
        for (let count = 0; count < 128 && ['clearing', 'falling'].includes(model.phase); count++) model.step(.4);
      if (epoch !== model.epoch || model.score < score) {
        popupUntil = 0;
        epoch = model.epoch;
      }
      if (model.swap !== swap) {
        swap = model.swap;
        popupUntil = 0;
        if (swap && !swap.accepted) {
          stage.text(popup, 'No match');
          popup.position.set(Math.max(-2.2, Math.min(2.2, (swap.a.x + swap.b.x) / 2 - 3.5)), Math.max(-3.2, Math.min(3.2, 3.5 - (swap.a.y + swap.b.y) / 2)), .9);
          popupAt = time;
          popupY = popup.position.y;
          popupUntil = time + .28;
        }
      }
      if (model.score > score) {
        stage.text(popup, `+${model.score - score}${model.chain > 1 ? ' · ×' + model.chain : ''}`);
        const center = model.matching[0] ?? { x: 3, y: 3 };
        popup.position.set(Math.max(-2.2, Math.min(2.2, center.x - 3.5)), Math.max(-3.2, Math.min(3.2, 3.5 - center.y)), .9);
        popupAt = time;
        popupY = popup.position.y;
        popupUntil = time + .32;
      }
      popup.visible = !stage.reducedMotion && model.mode === 'playing' && time < popupUntil;
      if (popup.visible) popup.position.y = popupY + .30 * ease((time - popupAt) / .32);
      score = model.score;
      cells.forEach(cell => {
        const { gem, mark, point, x, y } = cell;
        const value = model.grid[point.y][point.x], selected = model.selected?.x === point.x && model.selected?.y === point.y;
        const hinted = model.hinted.some(hint => hint.x === point.x && hint.y === point.y);
        const swapped = swap && (swap.a.x === point.x && swap.a.y === point.y ? swap.b : swap.b.x === point.x && swap.b.y === point.y ? swap.a : null);
        const age = swap ? Math.max(0, model.clock - swap.at) : 1;
        const rejected = !!(swap && !swap.accepted && age < .28 && swapped);
        const clearing = model.phase === 'clearing' && model.matching.some(match => match.x === point.x && match.y === point.y);
        const highlight = Number(selected || hinted);
        if (highlight !== cell.to) { cell.from = cell.highlight; cell.to = highlight; cell.age = 0; }
        cell.age = stage.reducedMotion ? 1 : Math.min(1, cell.age + Math.max(0, dt));
        cell.highlight = cell.from + (cell.to - cell.from) * ease(cell.age / .12);
        mark.visible = rejected || selected || hinted || clearing;
        mark.children.forEach(edge => { (edge as Mesh).material = stage.material(rejected ? INK.red : selected ? INK.yellow : INK.paper); });
        gem.visible = value >= 0;
        if (value >= 0) { gem.geometry = templates[value].geometry; gem.material = templates[value].material; }
        gem.position.set(x, y, .23 + .035 * cell.highlight);
        gem.scale.setScalar(1 + .025 * cell.highlight);
        gem.rotation.set(0, 0, 0);
        if (swapped && age < (swap!.accepted ? .16 : .28) && !stage.reducedMotion) {
          const progress = swap!.accepted ? ease(age / .16) : age < .12 ? ease(age / .12) : 1 - ease((age - .12) / .16);
          const offset = swap!.accepted ? 1 - progress : progress * .32;
          const lift = Math.sin(progress * Math.PI);
          const first = swap!.a.x === point.x && swap!.a.y === point.y;
          gem.position.set(x + (swapped.x - point.x) * offset, y - (swapped.y - point.y) * offset, .23 + lift * (first ? .24 : .12));
          gem.rotation.x = lift * (first ? .06 : -.06);
        }
        if (clearing) {
          // The first clear follows its 160 ms swap; cascades retain the model's 180 ms phase.
          const duration = model.chain === 1 ? .28 : .18;
          const progress = stage.reducedMotion ? 1 : ease((duration - model.timer - (duration - .12)) / .12);
          gem.scale.multiplyScalar(Math.max(.04, 1 - progress * .92));
          gem.position.z -= progress * .12;
        } else if (model.phase === 'falling') {
          const fall = model.falls.find(move => move.x === point.x && move.to === point.y);
          if (fall && !stage.reducedMotion) {
            const progress = clamp((.24 - model.timer) / .24), landing = ease(progress);
            gem.position.y = (3.5 - fall.from) + (fall.from - fall.to) * landing;
            gem.position.z = .23 + (fall.isNew ? .42 * (1 - landing) : .04 * Math.sin(progress * Math.PI));
            gem.scale.z = 1 - .08 * Math.sin(progress * Math.PI);
          }
        }
      });
      result.visible = model.mode === 'won';
      if (result.visible && !won) {
        result.scale.setScalar(.98);
        stage.tween(result, { scale: 1 }, 'entry', .22);
      }
      won = result.visible;
    },
    active: () => !stage.reducedMotion && (time < popupUntil || !!model.swap && model.clock - model.swap.at < (model.swap.accepted ? .16 : .28) || cells.some(cell => cell.age < .12)),
    inspect: () => ({ time, popup: popup.visible, swapAge: model.swap ? model.clock - model.swap.at : null })
  };
}
