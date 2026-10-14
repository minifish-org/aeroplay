import type { Stage } from '../../core/stage';
import type { Match3Model } from './model';
const colors = [0xf2aa8b, 0x8ed3ea, 0xcbb0ee, 0x96d5b5, 0xf2cd83];
export function createMatch3View(stage: Stage, model: Match3Model) {
  stage.framing('board', 8.7, 8.7); stage.board(8.6, 8.6, 0x1d364b); stage.gridBounds(8, 8, 8, 8);
  const templates = colors.map((color, index) => {
    const gem = stage.shape(index === 1 ? 'sphere' : index === 2 ? 'ring' : 'gem', .34, color);
    gem.removeFromParent(); return gem;
  });
  const cells = Array.from({ length: 64 }, (_, index) => {
    const point = { x: index % 8, y: Math.floor(index / 8) }, x = point.x - 3.5, y = 3.5 - point.y;
    const socket = stage.tile(x, y, .92, .92, 0x29475f, .18, point);
    const gem = templates[model.grid[point.y][point.x]].clone(); gem.userData.input = point;
    gem.position.set(x, y, .36); stage.content.add(gem); gem.scale.setScalar(.55); stage.tween(gem, { scale: 1 }, 'entry');
    return { socket, gem, x, y, point };
  });
  const popup = stage.label('', 2.7, '#f2cd83', .5); popup.visible = false;
  let serial = model.serial, phase = model.phase, score = model.score, popupUntil = 0;
  return {
    draw() {
      if (stage.reducedMotion) for (let count = 0; count < 128 && ['clearing', 'falling'].includes(model.phase); count++) model.step(.4);
      const changed = serial !== model.serial || phase !== model.phase;
      if (model.score > score) {
        stage.text(popup, `+${model.score - score}${model.chain > 1 ? ' · Cascade ×' + model.chain : ''}`);
        const center = model.matching[0] ?? { x: 3, y: 3 };
        popup.position.set(Math.max(-2.6, Math.min(2.6, center.x - 3.5)), Math.max(-3.2, Math.min(3.2, 3.5 - center.y)), .9);
        stage.tween(popup, { y: popup.position.y + .3 }, 'settle'); popupUntil = model.clock + .3;
      }
      popup.visible = model.clock < popupUntil; score = model.score;
      cells.forEach(({ socket, gem, point, x, y }) => {
        const value = model.grid[point.y][point.x], selected = model.selected?.x === point.x && model.selected?.y === point.y;
        const hinted = model.hinted.some(hint => hint.x === point.x && hint.y === point.y);
        socket.material = stage.material(selected ? 0x795b9e : hinted ? 0x957c49 : 0x29475f);
        if (value >= 0) {
          gem.geometry = templates[value].geometry; gem.material = templates[value].material;
          gem.rotation.set(value === 3 ? .35 : 0, value === 4 ? .75 : 0, value === 3 ? Math.PI / 4 : 0);
        }
        if (!changed) return;
        if (model.phase === 'clearing') {
          if (model.matching.some(match => match.x === point.x && match.y === point.y)) {
            stage.tween(gem, { scale: .05 }, 'score'); stage.effect(x, y, colors[Math.max(0, value)]);
          }
        } else if (model.phase === 'falling') {
          const fall = model.falls.find(move => move.x === point.x && move.to === point.y);
          gem.scale.setScalar(1); gem.position.set(x, fall ? 3.5 - fall.from : y, .36);
          if (fall) stage.tween(gem, { y }, 'settle');
        } else {
          gem.position.set(x, y, .36); gem.scale.setScalar(.75); stage.tween(gem, { scale: 1 }, model.phase === 'over' ? 'failure' : 'entry');
        }
      });
      serial = model.serial; phase = model.phase;
    }
  };
}
