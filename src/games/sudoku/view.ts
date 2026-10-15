import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { Stage } from '../../core/stage';
import type { SudokuModel } from './model';
export function createSudokuView(stage: Stage, model: SudokuModel) {
  stage.framing('board', 9.3, 9.3);
  stage.board(9.25, 9.25, 0x172e40);
  stage.gridBounds(9, 9, 9, 9);
  const cells = Array.from({ length: 81 }, (_, index) => {
    const x = index % 9 - 4, y = 4 - Math.floor(index / 9);
    const tile = stage.tile(x, y, .97, .97, 0x2c4d65, .08, { type: 'select', index });
    const text = stage.label('', .96, model.givens.includes(index) ? '#eef5f8' : '#8ed3ea', .96);
    tile.add(text);
    text.position.set(0, 0, .08);
    return { tile, text, value: model.board[index], pencil: null as ReturnType<Stage['label']> | null, notes: '' };
  });
  for (const position of [-1.5, 1.5]) {
    const vertical = stage.tile(position, 0, .035, 9.04, 0x8eaebf, .04);
    vertical.position.z = .08;
    const horizontal = stage.tile(0, position, 9.04, .035, 0x8eaebf, .04);
    horizontal.position.z = .08;
  }
  const focus = [
    stage.tile(0, 0, 1, .035, 0xf2cd83, .025), stage.tile(0, 0, 1, .035, 0xf2cd83, .025),
    stage.tile(0, 0, .035, 1, 0xf2cd83, .025), stage.tile(0, 0, .035, 1, 0xf2cd83, .025)
  ];
  return {
    draw() {
      const selected = model.selected, row = selected === null ? -1 : Math.floor(selected / 9), column = selected === null ? -1 : selected % 9;
      focus.forEach((edge, index) => {
        edge.visible = selected !== null;
        edge.position.set(column - 4 + (index === 2 ? -.485 : index === 3 ? .485 : 0), 4 - row + (index === 0 ? .485 : index === 1 ? -.485 : 0), .11);
      });
      cells.forEach((cell, index) => {
        const { tile, text } = cell, given = model.givens.includes(index), current = index === selected, y = Math.floor(index / 9), x = index % 9;
        const peer = selected !== null && (y === row || x === column || Math.floor(y / 3) === Math.floor(row / 3) && Math.floor(x / 3) === Math.floor(column / 3));
        const sameValue = selected !== null && model.board[index] && model.board[index] === model.board[selected];
        const color = model.invalid(index) || !given && model.conflict(index) ? 0xa7545a : current ? 0x527d93 : sameValue ? 0x3e737b : peer ? 0x34576d : given ? 0x213b50 : 0x2c4d65;
        tile.material = stage.material(color);
        const ink = given ? '#eef5f8' : '#8ed3ea';
        if (text.userData.label.color !== ink) {
          text.userData.label.color = ink;
          text.userData.text = undefined;
        }
        stage.text(text, model.board[index] ? String(model.board[index]) : '');
        const notes = model.notes[index].join('');
        if (notes && !cell.pencil) {
          cell.pencil = stage.label('', .96, '#f2cd83', .96);
          tile.add(cell.pencil);
          cell.pencil.position.set(0, 0, .09);
        }
        if (cell.pencil) {
          cell.pencil.visible = !model.board[index] && !!notes;
          if (notes !== cell.notes) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 256;
            const ink = canvas.getContext('2d')!;
            ink.fillStyle = '#f2cd83';
            ink.font = '600 104px ui-monospace, monospace';
            ink.textAlign = 'center';
            ink.textBaseline = 'middle';
            model.notes[index].forEach(digit => ink.fillText(String(digit), ((digit - 1) % 3 + .5) * 256 / 3, (Math.floor((digit - 1) / 3) + .5) * 256 / 3));
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
            text.scale.setScalar(.88);
            stage.tween(text, { scale: 1 }, 'score');
          }
        }
      });
    }
  };
}
