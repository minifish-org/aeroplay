import { ConeGeometry, Mesh } from 'three';
import type { Stage } from '../../core/stage';
import type { Match3Model } from './model';
const colors = [0xf2aa8b, 0x8ed3ea, 0xcbb0ee, 0x96d5b5, 0xf2cd83];
export function createMatch3View(stage: Stage, model: Match3Model) {
  stage.framing('board', 8.35, 8.35);
  stage.board(8.3, 8.3, 0x172e40);
  stage.gridBounds(8, 8, 8, 8);
  const templates = colors.map((color, index) => {
    const gem = index === 3 ? stage.box(.67, .67, .28, color, .09)
      : index === 4 ? new Mesh(new ConeGeometry(.39, .76, 3), stage.material(color))
      : stage.shape(index === 1 ? 'sphere' : index === 2 ? 'ring' : 'gem', .38, color);
    gem.visible = false;
    gem.castShadow = true;
    stage.content.add(gem);
    return gem;
  });
  const cells = Array.from({ length: 64 }, (_, index) => {
    const point = { x: index % 8, y: Math.floor(index / 8) }, x = point.x - 3.5, y = 3.5 - point.y;
    const socket = stage.tile(x, y, .96, .96, 0x203b50, .06, point);
    const gem = templates[model.grid[point.y][point.x]].clone();
    gem.visible = true;
    gem.userData.input = point;
    gem.position.set(x, y, .28);
    stage.content.add(gem);
    gem.scale.setScalar(.8);
    stage.tween(gem, { scale: 1 }, 'entry');
    return { socket, gem, x, y, point };
  });
  const popup = stage.label('', 3.4, '#f2cd83', .7);
  popup.visible = false;
  let serial = model.serial, phase = model.phase, score = model.score, popupUntil = 0, phaseAt = model.clock;
  let swap: Match3Model['swap'] = null;
  return {
    draw() {
      if (stage.reducedMotion)
        for (let count = 0; count < 128 && ['clearing', 'falling'].includes(model.phase); count++)
          model.step(.4);
      if (model.score < score)
        popupUntil = 0;
      const changed = serial !== model.serial || phase !== model.phase;
      if (changed)
        phaseAt = model.clock;
      if (model.swap !== swap) {
        swap = model.swap;
        popupUntil = 0;
        if (swap && !swap.accepted) {
          stage.text(popup, 'No match');
          popup.position.set(Math.max(-2.2, Math.min(2.2, (swap.a.x + swap.b.x) / 2 - 3.5)), Math.max(-3.2, Math.min(3.2, 3.5 - (swap.a.y + swap.b.y) / 2)), .9);
          popupUntil = model.clock + .24;
          stage.tween(cells[swap.a.y * 8 + swap.a.x].socket, { z: 0 }, 'failure');
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
      cells.forEach(({ socket, gem, point, x, y }) => {
        const value = model.grid[point.y][point.x], selected = model.selected?.x === point.x && model.selected?.y === point.y;
        const hinted = model.hinted.some(hint => hint.x === point.x && hint.y === point.y);
        const swapped = swap && (swap.a.x === point.x && swap.a.y === point.y ? swap.b : swap.b.x === point.x && swap.b.y === point.y ? swap.a : null);
        const age = swap ? model.clock - swap.at : 1;
        const rejected = swap && !swap.accepted && age < .28 && swapped;
        socket.material = stage.material(rejected ? 0xa7545a : selected ? 0x638f94 : hinted ? 0x957c49 : 0x203b50);
        if (value >= 0) {
          gem.geometry = templates[value].geometry;
          gem.material = templates[value].material;
          gem.rotation.set(value === 3 ? .12 : 0, value === 4 ? .25 : 0, 0);
        }
        if (swapped && age < (swap!.accepted ? .16 : .28)) {
          const offset = stage.reducedMotion ? 0 : swap!.accepted ? 1 - Math.min(1, age / .16) : Math.sin(age / .28 * Math.PI) * .24;
          gem.position.set(x + (swapped.x - point.x) * offset, y - (swapped.y - point.y) * offset, .28);
        }
        else if (model.phase !== 'falling')
          gem.position.set(x, y, .28);
        if (model.phase === 'clearing' && model.matching.some(match => match.x === point.x && match.y === point.y)) {
          const starts = Math.max(phaseAt, swap?.accepted ? swap.at + .14 : 0);
          gem.scale.setScalar(stage.reducedMotion ? .05 : Math.max(.05, 1 - Math.max(0, model.clock - starts) / .14));
          if (changed)
            stage.effect(x, y, colors[Math.max(0, value)]);
        }
        else if (changed && model.phase === 'falling') {
          const fall = model.falls.find(move => move.x === point.x && move.to === point.y);
          gem.scale.setScalar(1);
          gem.position.set(x, fall ? 3.5 - fall.from : y, .28);
          if (fall)
            stage.tween(gem, { y }, 'score');
        }
        else if (changed)
          gem.scale.setScalar(1);
      });
      serial = model.serial;
      phase = model.phase;
    }
  };
}
