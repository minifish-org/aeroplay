import { CanvasTexture, Color, Group, MeshBasicMaterial, SRGBColorSpace, type Mesh } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { SudokuModel } from './model';

const tint = (ink: number, amount: number) => new Color(INK.paper).lerp(new Color(ink), amount).getHex();
const css = (ink: number) => '#' + ink.toString(16).padStart(6, '0');
const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function createSudokuView(stage: Stage, model: SudokuModel) {
  stage.framing('board', 9.3, 9.3);
  stage.relief(13);
  printBackdrop(stage, 'measure');
  const base = stage.box(9.25, 9.25, .48, INK.black, .045);
  base.position.z = -.37;
  const backing = stage.box(9.12, 9.12, .13, 0xd7cbb3, .025);
  backing.position.set(.035, -.025, -.065);
  backing.material = stage.material(0xd7cbb3, 0, 'paper');
  const paper = stage.box(9.04, 9.04, .04, INK.paper, .015);
  paper.position.z = .035;
  paper.material = stage.material(INK.paper, 0, 'paper');
  stage.content.add(base, backing, paper);
  stage.gridBounds(9, 9, 9, 9);
  const semantic = { peer: tint(INK.black, .055), same: tint(INK.blue, .14), selected: tint(INK.yellow, .08), error: tint(INK.red, .17) };

  function digit(mesh: Mesh, value: number, color: number) {
    const key = value + ':' + color;
    if (mesh.userData.printKey === key) return;
    mesh.userData.printKey = key;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ink = canvas.getContext('2d')!;
    ink.fillStyle = css(color);
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    ink.font = '600 370px Georgia, ui-serif, serif';
    if (value) ink.fillText(String(value), 256, 275);
    const material = mesh.material as MeshBasicMaterial;
    material.map?.dispose();
    material.map = new CanvasTexture(canvas);
    material.map.colorSpace = SRGBColorSpace;
    material.needsUpdate = true;
  }
  const cells = Array.from({ length: 81 }, (_, index) => {
    const x = index % 9 - 4, y = 4 - Math.floor(index / 9);
    const tile = stage.tile(x, y, .982, .982, INK.paper, .012, { type: 'select', index });
    tile.position.z = .065;
    tile.material = stage.material(INK.paper, 0, 'paper').clone();
    const text = stage.label('', .94, css(INK.black), .94);
    tile.add(text);
    text.position.set(0, .015, .043);
    const error = stage.box(.36, .035, .012, INK.red, .002);
    error.position.set(0, -.345, .049);
    error.visible = false;
    tile.add(error);
    return { tile, text, error, value: model.board[index], pencil: null as ReturnType<Stage['label']> | null, notes: '',
      color: new Color(INK.paper), from: new Color(INK.paper), to: new Color(INK.paper), colorAge: 1,
      printAge: 1, erasing: false, noteAge: 1, noteVisible: false };
  });
  for (let index = 0; index <= 9; index++) {
      const position = index - 4.5, thickness = index % 3 ? .012 : .045;
      const vertical = stage.tile(position, 0, thickness, 9.04, INK.black, .006);
      vertical.position.z = .080;
      const horizontal = stage.tile(0, position, 9.04, thickness, INK.black, .006);
      horizontal.position.z = .080;
  }
  const selector = stage.box(.94, .94, .018, tint(INK.yellow, .19), .004);
  selector.material = stage.material(tint(INK.yellow, .19), 0, 'paper');
  selector.visible = false;
  stage.content.add(selector);
  const focus = new Group();
  for (const [x, y, w, h] of [[0, .465, .96, .025], [0, -.465, .96, .025], [-.465, 0, .025, .96], [.465, 0, .025, .96]]) {
    const edge = stage.box(w, h, .014, INK.red, .002);
    edge.position.set(x, y, .12);
    focus.add(edge);
  }
  focus.visible = false;
  stage.content.add(focus);
  const completion = new Group();
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const horizontal = stage.box(.46, .025, .014, INK.red, .002);
    horizontal.position.set(x * 4.35, y * 4.57, .085);
    const vertical = stage.box(.025, .46, .014, INK.red, .002);
    vertical.position.set(x * 4.57, y * 4.35, .085);
    completion.add(horizontal, vertical);
  }
  completion.visible = model.mode === 'won';
  stage.content.add(completion);
  let won = model.mode === 'won', initialized = false, selected: number | null = null, selectAge = 1;
  let fromX = 0, fromY = 0, epoch = model.epoch, puzzle = model.number;

  return {
    draw(dt = 0) {
      const reset = initialized && epoch !== model.epoch && (puzzle !== model.number || model.selected === null);
      const instant = stage.reducedMotion || !initialized || reset;
      if (selected !== model.selected) {
        const hadSelection = selected !== null;
        selected = model.selected;
        if (selected !== null) {
          fromX = hadSelection ? selector.position.x : selected % 9 - 4;
          fromY = hadSelection ? selector.position.y : 4 - Math.floor(selected / 9);
          selectAge = instant ? 1 : 0;
          focus.position.set(selected % 9 - 4, 4 - Math.floor(selected / 9), 0);
        }
      }
      const row = selected === null ? -1 : Math.floor(selected / 9), column = selected === null ? -1 : selected % 9;
      focus.visible = selector.visible = selected !== null;
      selectAge = instant ? 1 : Math.min(1, selectAge + Math.max(0, dt));
      const selection = ease(selectAge / .12);
      selector.position.set(fromX + (column - 4 - fromX) * selection, fromY + (4 - row - fromY) * selection, .086 - .014 * Math.sin(selection * Math.PI));
      cells.forEach((cell, index) => {
        const { tile, text, error } = cell, given = model.givens.includes(index), current = index === selected, y = Math.floor(index / 9), x = index % 9;
        const peer = selected !== null && (y === row || x === column || Math.floor(y / 3) === Math.floor(row / 3) && Math.floor(x / 3) === Math.floor(column / 3));
        const same = selected !== null && model.board[index] && model.board[index] === model.board[selected];
        const invalid = model.invalid(index) || !given && model.conflict(index);
        const color = invalid ? semantic.error : current ? semantic.selected : same ? semantic.same : peer ? semantic.peer : INK.paper;
        if (cell.to.getHex() !== color || instant) {
          cell.from.copy(cell.color);
          cell.to.setHex(color);
          cell.colorAge = instant ? 1 : 0;
        }
        cell.colorAge = instant ? 1 : Math.min(1, cell.colorAge + Math.max(0, dt));
        cell.color.copy(cell.from).lerp(cell.to, ease(cell.colorAge / .12));
        tile.material.color.copy(cell.color);
        error.visible = !!invalid;
        if (cell.value !== model.board[index]) {
          cell.value = model.board[index];
          cell.erasing = !cell.value;
          cell.printAge = instant ? 1 : 0;
          if (cell.value) digit(text, cell.value, invalid ? INK.red : given ? INK.black : INK.blue);
          if (invalid && !instant) {
            error.scale.x = .7;
            stage.tween(error, { sx: 1 }, 'failure', .20);
          }
        }
        cell.printAge = instant ? 1 : Math.min(1, cell.printAge + Math.max(0, dt));
        if (cell.value || !cell.erasing || cell.printAge >= .08) digit(text, cell.value, invalid ? INK.red : given ? INK.black : INK.blue);
        const print = ease(cell.printAge / (cell.erasing ? .08 : .14));
        text.position.z = .043 + (cell.erasing ? 0 : .13 * (1 - print));
        text.scale.setScalar(cell.erasing ? 1 : .82 + .18 * print);
        (text.material as MeshBasicMaterial).opacity = cell.erasing ? 1 - print : print;
        const notes = model.notes[index].join('');
        if (notes && !cell.pencil) {
          cell.pencil = stage.label('', .94, css(INK.blue), .94);
          tile.add(cell.pencil);
          cell.pencil.position.set(0, 0, .043);
        }
        if (cell.pencil) {
          if (notes !== cell.notes) {
            cell.noteAge = instant ? 1 : 0;
            if (notes) {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 256;
              const ink = canvas.getContext('2d')!;
              ink.fillStyle = css(INK.blue);
              ink.font = '500 72px ui-monospace, monospace';
              ink.textAlign = 'center';
              ink.textBaseline = 'middle';
              model.notes[index].forEach(value => ink.fillText(String(value), ((value - 1) % 3 + .5) * 256 / 3, (Math.floor((value - 1) / 3) + .5) * 256 / 3));
              const material = cell.pencil.material as MeshBasicMaterial;
              material.map?.dispose();
              material.map = new CanvasTexture(canvas);
              material.map.colorSpace = SRGBColorSpace;
              material.needsUpdate = true;
            }
            cell.notes = notes;
          }
          cell.noteAge = instant ? 1 : Math.min(1, cell.noteAge + Math.max(0, dt));
          const note = ease(cell.noteAge / .12);
          cell.noteVisible = !cell.value && (!!notes || cell.noteAge < .12);
          cell.pencil.visible = cell.noteVisible;
          (cell.pencil.material as MeshBasicMaterial).opacity = notes ? .55 + .45 * note : 1 - note;
        }
      });
      completion.visible = model.mode === 'won';
      if (completion.visible && !won) {
        completion.scale.setScalar(.99);
        stage.tween(completion, { scale: 1 }, 'entry', .20);
      }
      won = completion.visible;
      initialized = true;
      epoch = model.epoch;
      puzzle = model.number;
    },
    active: () => selectAge < .12 || cells.some(cell => cell.colorAge < .12 || cell.printAge < (cell.erasing ? .08 : .14) || cell.noteAge < .12),
    inspect: () => ({ selectAge, printing: cells.filter(cell => cell.printAge < .14).length })
  };
}
