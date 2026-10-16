import { CanvasTexture, Color, Group, MeshBasicMaterial, SRGBColorSpace, type Mesh } from 'three';
import type { Stage } from '../../core/stage';
import { INK, printBackdrop } from '../../core/print';
import type { SudokuModel } from './model';

const tint = (ink: number, amount: number) => new Color(INK.paper).lerp(new Color(ink), amount).getHex();
const css = (ink: number) => '#' + ink.toString(16).padStart(6, '0');

export function createSudokuView(stage: Stage, model: SudokuModel) {
  stage.framing('board', 9.3, 9.3);
  printBackdrop(stage, 'measure');
  stage.board(9.25, 9.25, INK.black);
  const paper = stage.box(9.16, 9.16, .13, INK.paper, .007);
  paper.position.z = -.11;
  stage.content.add(paper);
  stage.gridBounds(9, 9, 9, 9);
  const semantic = { peer: tint(INK.black, .055), same: tint(INK.blue, .14), selected: tint(INK.yellow, .13), error: tint(INK.red, .17) };

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
    const tile = stage.tile(x, y, .982, .982, INK.paper, .045, { type: 'select', index });
    const text = stage.label('', .94, css(INK.black), .94);
    tile.add(text);
    text.position.set(0, .015, .035);
    const error = stage.box(.36, .035, .012, INK.red, .002);
    error.position.set(0, -.345, .043);
    error.visible = false;
    tile.add(error);
    return { tile, text, error, value: model.board[index], pencil: null as ReturnType<Stage['label']> | null, notes: '' };
  });
  for (let index = 1; index < 9; index++) {
    const position = index - 4.5, thickness = index % 3 ? .012 : .055;
    const vertical = stage.tile(position, 0, thickness, 9.04, INK.black, .025);
    vertical.position.z = .047;
    const horizontal = stage.tile(0, position, 9.04, thickness, INK.black, .025);
    horizontal.position.z = .047;
  }
  const focus = [
    stage.tile(0, 0, .96, .035, INK.red, .014), stage.tile(0, 0, .96, .035, INK.red, .014),
    stage.tile(0, 0, .035, .96, INK.red, .014), stage.tile(0, 0, .035, .96, INK.red, .014)
  ];
  const completion = new Group();
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const horizontal = stage.box(.46, .025, .014, INK.red, .002);
    horizontal.position.set(x * 4.35, y * 4.57, .06);
    const vertical = stage.box(.025, .46, .014, INK.red, .002);
    vertical.position.set(x * 4.57, y * 4.35, .06);
    completion.add(horizontal, vertical);
  }
  completion.visible = false;
  stage.content.add(completion);
  let won = model.mode === 'won';

  return {
    draw() {
      const selected = model.selected, row = selected === null ? -1 : Math.floor(selected / 9), column = selected === null ? -1 : selected % 9;
      focus.forEach((edge, index) => {
        edge.visible = selected !== null;
        edge.position.set(column - 4 + (index === 2 ? -.465 : index === 3 ? .465 : 0), 4 - row + (index === 0 ? .465 : index === 1 ? -.465 : 0), .083);
      });
      cells.forEach((cell, index) => {
        const { tile, text, error } = cell, given = model.givens.includes(index), current = index === selected, y = Math.floor(index / 9), x = index % 9;
        const peer = selected !== null && (y === row || x === column || Math.floor(y / 3) === Math.floor(row / 3) && Math.floor(x / 3) === Math.floor(column / 3));
        const sameValue = selected !== null && model.board[index] && model.board[index] === model.board[selected];
        const invalid = model.invalid(index) || !given && model.conflict(index);
        tile.material = stage.material(invalid ? semantic.error : current ? semantic.selected : sameValue ? semantic.same : peer ? semantic.peer : INK.paper);
        error.visible = !!invalid;
        digit(text, model.board[index], invalid ? INK.red : given ? INK.black : INK.blue);
        const notes = model.notes[index].join('');
        if (notes && !cell.pencil) {
          cell.pencil = stage.label('', .94, css(INK.blue), .94);
          tile.add(cell.pencil);
          cell.pencil.position.set(0, 0, .038);
        }
        if (cell.pencil) {
          cell.pencil.visible = !model.board[index] && !!notes;
          if (notes !== cell.notes) {
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
            cell.notes = notes;
          }
        }
        if (cell.value !== model.board[index]) {
          cell.value = model.board[index];
          if (model.board[index]) {
            text.scale.setScalar(.96);
            stage.tween(text, { scale: 1 }, 'entry');
            if (invalid) {
              error.scale.x = .7;
              stage.tween(error, { sx: 1 }, 'failure');
            }
          }
        }
      });
      completion.visible = model.mode === 'won';
      if (completion.visible && !won) {
        completion.scale.setScalar(.99);
        stage.tween(completion, { scale: 1 }, 'entry');
      }
      won = completion.visible;
    }
  };
}
