import type { Stage } from '../../core/stage';
import type { SudokuModel } from './model';
export function createSudokuView(stage: Stage, model: SudokuModel) {
  stage.framing('board', 9.7, 9.7);
  stage.board(9.6, 9.6, 0x1d364b);
  stage.gridBounds(9, 9, 9, 9);
  const cells = Array.from({ length: 81 }, (_, index) => {
    const x = index % 9 - 4, y = 4 - Math.floor(index / 9);
    const tile = stage.tile(x, y, .94, .94, 0x405978, .22, { type: 'select', index });
    const text = stage.label('', .82, '#eef5f8', .82);
    tile.add(text);
    text.position.set(0, 0, .14);
    tile.position.z = -.14;
    stage.tween(tile, { z: 0 }, 'entry');
    return { tile, text, value: model.board[index] };
  });
  for (const position of [-1.5, 1.5]) {
    const vertical = stage.tile(position, 0, .065, 9.1, 0x8eaebf, .26);
    vertical.position.z = .1;
    const horizontal = stage.tile(0, position, 9.1, .065, 0x8eaebf, .26);
    horizontal.position.z = .1;
  }
  return {
    draw() {
      const selected = model.selected, row = selected === null ? -1 : Math.floor(selected / 9), column = selected === null ? -1 : selected % 9;
      cells.forEach(({ tile, text }, index) => {
        const given = model.givens.includes(index), current = index === selected, y = Math.floor(index / 9), x = index % 9;
        const peer = selected !== null && (y === row || x === column || Math.floor(y / 3) === Math.floor(row / 3) && Math.floor(x / 3) === Math.floor(column / 3));
        const sameValue = selected !== null && model.board[index] && model.board[index] === model.board[selected];
        const color = model.invalid(index) || !given && model.conflict(index) ? 0xa7545a : current ? 0x799ebc : sameValue ? 0x638f94 : peer ? 0x496780 : given ? 0x31495e : 0x405978;
        tile.material = stage.material(color);
        tile.position.z = current ? .09 : 0;
        const notes = model.notes[index];
        const label = model.board[index] ? String(model.board[index]) : notes.length
          ? Array.from({ length: 3 }, (_, line) => Array.from({ length: 3 }, (_, col) => {
            const digit = line * 3 + col + 1;
            return notes.includes(digit) ? String(digit) : '·';
          }).join(' ')).join('\n') : '';
        stage.text(text, label);
        if (cells[index].value !== model.board[index]) {
          cells[index].value = model.board[index];
          if (model.board[index]) {
            text.scale.setScalar(.65);
            stage.tween(text, { scale: 1 }, 'score');
          }
        }
      });
    }
  };
}
