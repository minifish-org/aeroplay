import { Group } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { MergeModel } from './model';

const point = (cell: number) => ({ x: (cell % 4 - 1.5) * 1.5, y: (1.5 - Math.floor(cell / 4)) * 1.5 });
const settle = (t: number) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;
const colors = [INK.paper, INK.paper, INK.yellow, INK.yellow, INK.red, INK.red, INK.black];
const css = (ink: number) => '#' + ink.toString(16).padStart(6, '0');

export function createView(stage: Stage, model: MergeModel) {
  stage.framing('board', 6.6, 6.6);
  printBackdrop(stage, 'numbers');
  const frame = new Group();
  stage.content.add(frame);
  frame.add(stage.board(6.4, 6.4, INK.black));
  const paper = stage.box(6.3, 6.3, .12, INK.paper, .015);
  paper.position.z = -.18;
  frame.add(paper);
  stage.gridBounds(4, 4, 6, 6);

  function plate() {
    const group = new Group();
    const edge = stage.box(1.36, 1.36, .16, INK.black, .015);
    const face = stage.box(1.31, 1.31, .16, INK.paper, .015);
    face.position.set(-.015, .015, .08);
    const label = stage.label('', 1.13, css(INK.black), .76);
    label.position.set(-.015, .005, .17);
    group.add(edge, face, label);
    frame.add(group);
    return { group, face, label };
  }
  function ink(tile: ReturnType<typeof plate>, value: number) {
    const color = colors[Math.min(colors.length - 1, Math.max(0, Math.log2(value) - 1))];
    tile.face.material = stage.material(color);
    const textColor = css(color === INK.black ? INK.paper : INK.black);
    if (tile.label.userData.label.color !== textColor) {
      tile.label.userData.label.color = textColor;
      tile.label.userData.text = undefined;
    }
    stage.text(tile.label, String(value));
  }
  const tiles = Array.from({ length: 16 }, (_, cell) => {
    const p = point(cell), well = stage.tile(p.x, p.y, 1.40, 1.40, INK.black, .06);
    well.position.z = -.09;
    frame.add(well);
    const tile = plate();
    tile.group.position.set(p.x, p.y, .02);
    return tile;
  });
  // A move has at most sixteen source plates, including both sides of every merge.
  const ghosts = Array.from({ length: 16 }, () => {
    const tile = plate();
    tile.group.visible = false;
    return { ...tile, from: point(0), to: point(0) };
  });
  let signature = '', epoch = -1, elapsed = 1, moving = false;
  const merged = new Set<number>();

  return Object.assign((dt: number) => {
    const next = model.grid.flat().join(',') + ':' + model.moves + ':' + model.epoch;
    if (next !== signature) {
      signature = next;
      moving = epoch === model.epoch && model.changes.length > 0 && !stage.reducedMotion;
      elapsed = moving ? 0 : 1;
      merged.clear();
      ghosts.forEach(({ group }) => { group.visible = false; });
      let source = 0;
      if (moving) {
        for (const change of model.changes) {
          if (change.merged) merged.add(change.target);
          for (const origin of change.sources) {
            const ghost = ghosts[source++];
            ghost.from = point(origin);
            ghost.to = point(change.target);
            ink(ghost, change.merged ? change.value / 2 : change.value);
            ghost.group.visible = true;
            ghost.group.scale.setScalar(1);
            ghost.group.position.set(ghost.from.x, ghost.from.y, .04);
          }
        }
        frame.position.z = -.018;
        stage.tween(frame, { z: 0 }, 'settle');
      }
      tiles.forEach((tile, cell) => {
        const value = model.grid[Math.floor(cell / 4)][cell % 4], p = point(cell);
        tile.group.visible = !!value && !moving;
        tile.group.position.set(p.x, p.y, .02);
        tile.group.scale.setScalar(1);
        if (value) ink(tile, value);
      });
      epoch = model.epoch;
    }
    if (!moving) return;
    elapsed = Math.min(.36, elapsed + Math.max(0, dt));
    const travel = settle(elapsed / .14);
    ghosts.forEach(ghost => {
      if (!ghost.group.visible) return;
      ghost.group.position.set(ghost.from.x + (ghost.to.x - ghost.from.x) * travel, ghost.from.y + (ghost.to.y - ghost.from.y) * travel, .04);
      ghost.group.visible = elapsed < .14;
    });
    if (elapsed >= .14) {
      const impression = Math.min(1, (elapsed - .14) / .20);
      tiles.forEach((tile, cell) => {
        const value = model.grid[Math.floor(cell / 4)][cell % 4];
        tile.group.visible = !!value;
        if (merged.has(cell)) {
          tile.group.position.z = .02 - Math.sin(impression * Math.PI) * .065;
          tile.group.scale.setScalar(1 + Math.sin(impression * Math.PI) * .035);
        } else if (cell === model.spawned) {
          tile.group.scale.setScalar(.82 + .18 * settle(impression));
        }
      });
    }
    if (elapsed >= .36) {
      moving = false;
      tiles.forEach(({ group }) => { group.position.z = .02; group.scale.setScalar(1); });
    }
  }, { bump(input: unknown) {
    const direction = ({ left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] } as Record<string, number[]>)[String(input)];
    if (!direction || stage.reducedMotion) return;
    frame.position.set(direction[0] * .07, direction[1] * .07, frame.position.z);
    stage.tween(frame, { x: 0, y: 0 }, 'failure');
  } });
}
