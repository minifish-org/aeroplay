export type Board = number[];

export interface Puzzle {
  puzzle: string;
  solution: string;
}

export const PUZZLES: Puzzle[] = [
  {
    puzzle:
      "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    solution:
      "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
  },
  {
    puzzle:
      "000260701680070090190004500820100040004602900050003028009300074040050036703018000",
    solution:
      "435269781682571493197834562826195347374682915951743628519326874248957136763418259",
  },
  {
    puzzle:
      "300200000000107000706030500070009080900020004010800050009040301000702000000008006",
    solution:
      "351286497492157638786934512275469183938521764614873259829645371163792845547318926",
  },
];

export const parseBoard = (value: string): Board => [...value].map(Number);
export function hasConflict(board: Board, index: number, value: number) {
  const row = Math.floor(index / 9),
    col = index % 9;
  return board.some(
    (other, i) =>
      i !== index &&
      other === value &&
      (Math.floor(i / 9) === row ||
        i % 9 === col ||
        (Math.floor(i / 27) === Math.floor(row / 3) &&
          Math.floor((i % 9) / 3) === Math.floor(col / 3))),
  );
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Permute validated unique puzzles; adding starter clues preserves uniqueness. */
export function createPuzzle(index: number, starter: boolean) {
  const base = PUZZLES[index % PUZZLES.length];
  const digits = [0, ...shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])];
  const order = () =>
    shuffled([0, 1, 2]).flatMap((band) =>
      shuffled([0, 1, 2]).map((offset) => band * 3 + offset),
    );
  const rows = order(),
    cols = order();
  const transform = (value: string) =>
    rows.flatMap((row) =>
      cols.map((col) => digits[Number(value[row * 9 + col])]),
    );
  const puzzle = transform(base.puzzle),
    solution = transform(base.solution);
  if (starter) {
    const blanks = shuffled(puzzle.flatMap((v, i) => (v ? [] : [i])));
    for (const i of blanks.slice(
      0,
      Math.max(0, 52 - puzzle.filter(Boolean).length),
    ))
      puzzle[i] = solution[i];
  }
  return { puzzle, solution };
}
