import { Group } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { MergeModel, TileChange } from './model';

const point = (cell: number) => ({ x: (cell % 4 - 1.5) * 1.5, y: (1.5 - Math.floor(cell / 4)) * 1.5 });
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const colors = [INK.paper, INK.paper, INK.yellow, INK.yellow, INK.red, INK.red, INK.black];
const css = (ink: number) => '#' + ink.toString(16).padStart(6, '0');

export function createView(stage: Stage, model: MergeModel) {
  stage.framing('board', 6.6, 6.6);
  stage.relief(30);
  printBackdrop(stage, 'numbers');
  const frame = new Group();
  stage.content.add(frame);
  const base = stage.box(6.4, 6.4, .48, INK.black, .045);
  base.position.z = -.37;
  const paper = stage.box(6.32, 6.32, .13, INK.paper, .025);
  paper.material = stage.material(INK.paper, 0, 'paper');
  paper.position.z = -.065;
  frame.add(base, paper);
  for (const [x, y, w, h] of [[0, 3.06, 6.12, .025], [0, -3.06, 6.12, .025], [-3.06, 0, .025, 6.12], [3.06, 0, .025, 6.12]]) {
    const edge = stage.box(w, h, .025, INK.black, .003);
    edge.position.set(x, y, .025);
    frame.add(edge);
  }
  stage.gridBounds(4, 4, 6, 6);

  function plate() {
    const group = new Group();
    const face = stage.box(1.34, 1.34, .35, INK.paper, .045);
    face.material = stage.material(INK.paper, 0, 'ceramic');
    const edge = stage.box(1.345, 1.345, .035, INK.black, .012);
    edge.position.z = -.145;
    const label = stage.label('', 1.15, css(INK.black), .82);
    label.position.set(0, .005, .183);
    group.add(edge, face, label);
    frame.add(group);
    return { group, face, label, value: 0 };
  }
  function ink(tile: ReturnType<typeof plate>, value: number) {
    tile.value = value;
    const color = colors[Math.min(colors.length - 1, Math.max(0, Math.log2(value) - 1))];
    tile.face.material = stage.material(color, 0, 'ceramic');
    const textColor = css(color === INK.black || color === INK.red ? INK.paper : INK.black);
    if (tile.label.userData.label.color !== textColor) {
      tile.label.userData.label.color = textColor;
      tile.label.userData.text = undefined;
    }
    stage.text(tile.label, String(value));
  }
  const tiles = Array.from({ length: 16 }, (_, cell) => {
    const p = point(cell), well = stage.box(1.40, 1.40, .04, 0xc6bda9, .015);
    well.material = stage.material(0xc6bda9, 0, 'paper');
    well.position.set(p.x, p.y, .03);
    frame.add(well);
    return plate();
  });
  // The pool covers both sources of every merge and remains bounded during interruption.
  const ghosts = Array.from({ length: 16 }, () => {
    const tile = plate();
    tile.group.visible = false;
    return { ...tile, from: { x: 0, y: 0, z: .24 }, to: point(0), cell: -1 };
  });
  let signature = '', epoch = model.epoch, moves = model.moves, elapsed = 1, moving = false, reversing = false;
  let previous = [...model.grid.flat()], lastChanges: TileChange[] = [], initialized = false;
  const merged = new Set<number>();

  function anchor(cell: number) {
    const tile = tiles[cell];
    if (tile.group.visible) return tile.group.position.clone();
    const sources = ghosts.filter(ghost => ghost.group.visible && ghost.cell === cell);
    if (sources.length) {
      const center = sources[0].group.position.clone().set(0, 0, 0);
      sources.forEach(source => center.add(source.group.position));
      return center.multiplyScalar(1 / sources.length);
    }
    const p = point(cell);
    return { ...p, z: .24 };
  }
  const draw = (dt: number) => {
    const values = model.grid.flat(), next = values.join(',') + ':' + model.moves + ':' + model.epoch;
    if (next !== signature) {
      const anchors = previous.map((_, cell) => anchor(cell));
      const undo = initialized && model.epoch !== epoch && model.moves < moves && model.spawned < 0;
      const forward = initialized && model.epoch === epoch && model.changes.length > 0;
      reversing = undo;
      moving = !stage.reducedMotion && (forward || undo || initialized);
      elapsed = moving ? 0 : 1;
      signature = next;
      merged.clear();
      ghosts.forEach(({ group }) => { group.visible = false; });
      let count = 0;
      const source = (cell: number, target: number, value: number, contact?: { x: number; y: number }) => {
        const ghost = ghosts[count++];
        if (!ghost) return;
        ghost.cell = target;
        ghost.from = { x: anchors[cell].x, y: anchors[cell].y, z: anchors[cell].z };
        ghost.to = contact ?? point(target);
        ink(ghost, value);
        ghost.group.visible = true;
        ghost.group.scale.setScalar(1);
        ghost.group.position.set(ghost.from.x, ghost.from.y, ghost.from.z);
      };
      if (moving && forward) {
        for (const change of model.changes) {
          if (change.merged) merged.add(change.target);
          change.sources.forEach((origin, index) => {
            const target = point(change.target), start = point(origin);
            // The trailing source touches its partner before the pair becomes one plate.
            let contact = target;
            if (change.merged && index === 1) {
              const other = point(change.sources[0]);
              const dx = start.x - other.x, dy = start.y - other.y;
              const length = Math.hypot(dx, dy) || 1;
              contact = { x: target.x + dx / length * 1.34, y: target.y + dy / length * 1.34 };
            }
            source(origin, change.target, change.merged ? change.value / 2 : change.value, contact);
          });
        }
        lastChanges = model.changes.map(change => ({ ...change, sources: [...change.sources] }));
      } else if (moving && undo) {
        const used = new Set<number>();
        values.forEach((value, cell) => {
          if (!value) return;
          const last = lastChanges.find(change => change.sources.includes(cell) && change.value === value * (change.merged ? 2 : 1));
          let origin = last?.target ?? previous.findIndex((old, index) => old === value && !used.has(index));
          if (origin < 0) origin = cell;
          used.add(origin);
          source(origin, cell, value);
        });
        lastChanges = [];
      }
      tiles.forEach((tile, cell) => {
        const p = point(cell);
        tile.group.visible = !!values[cell] && (!moving || !forward && !undo);
        tile.group.position.set(p.x, p.y, .24);
        tile.group.scale.setScalar(1);
        if (values[cell]) ink(tile, values[cell]);
      });
      previous = [...values];
      epoch = model.epoch;
      moves = model.moves;
      initialized = true;
    }
    if (!moving) return;
    elapsed = Math.min(.33, elapsed + Math.max(0, dt));
    if (stage.reducedMotion) elapsed = .33;
    const travel = ease(elapsed / .18);
    ghosts.forEach(ghost => {
      if (!ghost.group.visible) return;
      ghost.group.position.set(ghost.from.x + (ghost.to.x - ghost.from.x) * travel, ghost.from.y + (ghost.to.y - ghost.from.y) * travel, ghost.from.z + (.24 - ghost.from.z) * travel);
      ghost.group.visible = elapsed < .18;
    });
    tiles.forEach((tile, cell) => {
      if (!values[cell]) return;
      const isSpawn = !reversing && cell === model.spawned;
      tile.group.visible = elapsed >= (isSpawn ? .23 : .18) || !ghosts.some(ghost => ghost.cell === cell);
      if (isSpawn) {
        const arrival = ease((elapsed - .23) / .10);
        tile.group.visible = elapsed >= .23;
        tile.group.position.z = .24 + .40 * (1 - arrival);
        tile.group.scale.setScalar(.4 + .6 * arrival);
      } else if (merged.has(cell)) {
        const press = elapsed < .24 ? ease((elapsed - .18) / .06) : 1 - ease((elapsed - .24) / .09);
        tile.group.position.z = .24 - .075 * press;
        tile.group.scale.set(1 + .026 * press, 1 + .026 * press, 1 - .12 * press);
      }
    });
    if (elapsed >= (reversing ? .18 : .33)) {
      moving = false;
      ghosts.forEach(({ group }) => { group.visible = false; });
      tiles.forEach(({ group }, cell) => { group.visible = !!values[cell]; group.position.z = .24; group.scale.setScalar(1); });
    }
  };
  return Object.assign(draw, {
    active: () => moving,
    inspect: () => ({ active: moving, elapsed, reversing, ghosts: ghosts.filter(ghost => ghost.group.visible).length }),
    bump(input: unknown) {
      const direction = ({ left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] } as Record<string, number[]>)[String(input)];
      if (!direction || stage.reducedMotion) return;
      frame.position.set(direction[0] * .07, direction[1] * .07, 0);
      stage.tween(frame, { x: 0, y: 0 }, 'failure', .18);
    }
  });
}
