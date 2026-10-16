import { Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { LightsModel } from './model';

/** Every board keeps the same footprint, so only the cell spacing shrinks as it grows. */
const SPAN = 5.6;
const UNIT = SPAN / 5;
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
type Lamp = { cap: Mesh; material: MeshStandardMaterial; hint: Group; scale: number; level: number; from: number; to: number; age: number; fromZ: number };

export function createView(stage: Stage, model: LightsModel) {
  stage.framing('board', 6.5, 6.5);
  stage.relief(32);
  printBackdrop(stage, 'night');
  const base = stage.box(6.3, 6.3, .48, INK.black, .045);
  base.position.z = -.37;
  const panel = stage.box(6.22, 6.22, .13, INK.blue, .025);
  panel.material = stage.material(INK.blue, 0, 'paint');
  panel.position.z = -.065;
  stage.content.add(base, panel);
  const socketGeometry = new CylinderGeometry(.49, .49, .12, 48);
  socketGeometry.rotateX(Math.PI / 2);
  const capGeometry = new SphereGeometry(.39, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  capGeometry.rotateX(Math.PI / 2);
  const rimGeometry = new TorusGeometry(.428, .029, 12, 48);
  const dark = new Color(INK.black), light = new Color(INK.yellow);
  const board = new Group();
  stage.content.add(board);
  let size = 0, lamps: Lamp[] = [];
  // Rebuilding the board keeps one geometry set per size; the shared stage caches the rest.
  const build = (next: number) => {
    size = next;
    board.clear();
    const spacing = SPAN / size, scale = spacing / UNIT, cells = size * size;
    const point = (cell: number) => ({ x: (cell % size - (size - 1) / 2) * spacing, y: ((size - 1) / 2 - Math.floor(cell / size)) * spacing });
    for (let cell = 0; cell < cells; cell++) {
      const p = point(cell);
      if (cell % size < size - 1) {
        const connector = stage.tile(p.x + spacing / 2, p.y, .25 * scale, .022 * scale, INK.yellow, .018 * scale);
        connector.position.z = .025;
        board.add(connector);
      }
      if (cell < cells - size) {
        const connector = stage.tile(p.x, p.y - spacing / 2, .022 * scale, .25 * scale, INK.yellow, .018 * scale);
        connector.position.z = .025;
        board.add(connector);
      }
    }
    lamps = Array.from({ length: cells }, (_, cell) => {
      const p = point(cell);
      const socket = new Mesh(socketGeometry, stage.material(INK.black, 0, 'paint'));
      socket.position.set(p.x, p.y, .08);
      socket.castShadow = socket.receiveShadow = true;
      socket.userData.input = cell;
      socket.scale.setScalar(scale);
      const material = stage.material(INK.black, 0, 'ceramic').clone();
      material.roughness = .36;
      material.emissive.copy(light);
      const cap = new Mesh(capGeometry, material);
      cap.scale.set(scale, scale, .36 * scale);
      cap.position.set(p.x, p.y, .14);
      cap.castShadow = cap.receiveShadow = true;
      cap.userData.input = cell;
      const rim = new Mesh(rimGeometry, stage.material(INK.yellow, 0, 'metal'));
      rim.position.set(p.x, p.y, .165);
      rim.castShadow = rim.receiveShadow = true;
      rim.userData.input = cell;
      rim.scale.setScalar(scale);
      const hint = new Group();
      for (const [x, y, w, h] of [[-.37, .51, .24, .035], [.37, .51, .24, .035], [-.51, .37, .035, .24], [.51, .37, .035, .24], [-.37, -.51, .24, .035], [.37, -.51, .24, .035], [-.51, -.37, .035, .24], [.51, -.37, .035, .24]]) {
        const mark = stage.box(w, h, .018, INK.paper, .003);
        mark.position.set(x, y, .19);
        hint.add(mark);
      }
      hint.position.set(p.x, p.y, 0);
      hint.scale.setScalar(scale);
      hint.visible = false;
      board.add(socket, cap, rim, hint);
      return { cap, material, hint, scale, level: model.board[cell], from: model.board[cell], to: model.board[cell], age: 1, fromZ: .14 };
    });
    stage.gridBounds(size, size, SPAN, SPAN);
    signature = '';
    previous = [...model.board];
    won = model.mode === 'won';
  };
  const celebration = new Group();
  for (const [x, y, w, h] of [[0, 3.02, 6.04, .025], [0, -3.02, 6.04, .025], [-3.02, 0, .025, 6.04], [3.02, 0, .025, 6.04]]) {
    const margin = stage.box(w, h, .025, INK.yellow, .003);
    margin.material = stage.material(INK.yellow, 0, 'metal');
    margin.position.set(x, y, .025);
    celebration.add(margin);
  }
  celebration.visible = model.mode === 'won';
  stage.content.add(celebration);
  let signature = '', previous: number[] = [], won = model.mode === 'won', initialized = false;
  build(model.size);
  const draw = (dt: number) => {
    if (size !== model.size)
      build(model.size);
    const next = model.board.join('') + ':' + model.hinted + ':' + model.epoch + ':' + model.mode;
    if (signature !== next) {
      signature = next;
      lamps.forEach((lamp, cell) => {
        if (previous[cell] !== model.board[cell]) {
          lamp.from = lamp.level;
          lamp.to = model.board[cell];
          lamp.fromZ = lamp.cap.position.z;
          lamp.age = initialized && !stage.reducedMotion ? 0 : 1;
        }
        const hinted = model.hinted === cell;
        if (hinted && !lamp.hint.visible) {
          lamp.hint.scale.setScalar(.90 * lamp.scale);
          stage.tween(lamp.hint, { scale: lamp.scale }, 'settle', .12);
        }
        lamp.hint.visible = hinted;
      });
      celebration.visible = model.mode === 'won';
      if (celebration.visible && !won) {
        celebration.scale.setScalar(.97);
        stage.tween(celebration, { scale: 1 }, 'entry', .22);
      }
      won = celebration.visible;
      previous = [...model.board];
      initialized = true;
    }
    lamps.forEach(lamp => {
      lamp.age = stage.reducedMotion ? 1 : Math.min(1, lamp.age + Math.max(0, dt));
      lamp.level = lamp.from + (lamp.to - lamp.from) * ease((lamp.age - .04) / .12);
      const press = lamp.age < .07 ? ease(lamp.age / .07) : 1 - ease((lamp.age - .07) / .21);
      lamp.cap.position.z = lamp.age < .07 ? lamp.fromZ + (.04 - lamp.fromZ) * press : .14 - .10 * press;
      lamp.material.color.copy(dark).lerp(light, lamp.level);
      lamp.material.emissiveIntensity = lamp.level * .12;
    });
  };
  return Object.assign(draw, {
    active: () => lamps.some(lamp => lamp.age < .30),
    inspect: () => ({ active: lamps.some(lamp => lamp.age < .30), size, levels: lamps.map(lamp => lamp.level), heights: lamps.map(lamp => lamp.cap.position.z) })
  });
}
