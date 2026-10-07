import { PocketScene } from "../../core/phaser/pocket";
import { BoardView } from "../../core/phaser/board";
import { hasConflict } from "../models/sudoku";

export class SudokuView extends BoardView {
  private readonly notesText;
  constructor(scene: PocketScene) {
    super(scene, 9, 12);
    this.notesText = Array.from({ length: 81 }, (_, i) => {
      const p = this.center(i);
      return scene.add
        .text(p.x, p.y, "", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#597b8b",
          align: "center",
          lineSpacing: 0,
          resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(4);
    });
    const lines = scene.add
      .graphics()
      .lineStyle(2.5, 0x95b2b0, 0.65)
      .setDepth(6);
    for (let i = 0; i <= 9; i += 3) {
      const p = 12 + i * this.cell;
      lines.lineBetween(12, p, 388, p).lineBetween(p, 12, p, 388);
    }
  }
  draw(
    board: number[],
    givens: Set<number>,
    selected: number | null,
    notes: number[][],
    solution: number[],
  ) {
    const row = selected === null ? -1 : Math.floor(selected / 9),
      col = selected === null ? -1 : selected % 9;
    this.render(
      board.map((value, index) => {
        const y = Math.floor(index / 9),
          x = index % 9;
        const peer =
          y === row ||
          x === col ||
          (Math.floor(y / 3) === Math.floor(row / 3) &&
            Math.floor(x / 3) === Math.floor(col / 3));
        const invalid =
          value &&
          (value !== solution[index] || hasConflict(board, index, value));
        return {
          color: invalid
            ? 0xffd4cb
            : selected === index
              ? 0xa8dccc
              : value && selected !== null && board[selected] === value
                ? 0xd1e8b9
                : peer
                  ? 0xe0ede6
                  : (Math.floor(x / 3) + Math.floor(y / 3)) % 2
                    ? 0xf3edf9
                    : 0xfafbf7,
          label: value ? String(value) : "",
          ink: givens.has(index) ? "#344f60" : invalid ? "#b46156" : "#258e82",
        };
      }),
      [],
      selected ?? -1,
      false,
    );
    this.notesText.forEach((text, i) =>
      text.setText(
        board[i] || !notes[i].length
          ? ""
          : [0, 1, 2]
              .map((row) =>
                [1, 2, 3]
                  .map((col) =>
                    notes[i].includes(row * 3 + col) ? row * 3 + col : "·",
                  )
                  .join(" "),
              )
              .join("\n"),
      ),
    );
  }
}
