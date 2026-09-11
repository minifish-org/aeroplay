export type CargoState = { player: number; crates: number[] };
export type CargoLevel = {
  name: string;
  tip: string;
  map: string[];
  par: number;
};
export type CargoBoard = {
  width: number;
  height: number;
  floor: number[];
  goals: number[];
  initial: CargoState;
};
export const DIRECTIONS = [
  { key: 'up', x: 0, y: -1 },
  { key: 'right', x: 1, y: 0 },
  { key: 'down', x: 0, y: 1 },
  { key: 'left', x: -1, y: 0 }
] as const;
export type CargoDirection = (typeof DIRECTIONS)[number]['key'];
export function parseCargo(map: string[]): CargoBoard {
  const width = Math.max(...map.map((row) => row.length)),
    height = map.length;
  const floor: number[] = [],
    goals: number[] = [],
    crates: number[] = [];
  let player = -1;
  map.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      const index = y * width + x;
      if (cell === '#') return;
      floor.push(index);
      if ('.+*'.includes(cell)) goals.push(index);
      if ('$*'.includes(cell)) crates.push(index);
      if ('@+'.includes(cell)) player = index;
    })
  );
  return { width, height, floor, goals, initial: { player, crates } };
}
export function neighbor(
  board: CargoBoard,
  cell: number,
  direction: CargoDirection
) {
  const d = DIRECTIONS.find((d) => d.key === direction)!;
  const x = (cell % board.width) + d.x,
    y = Math.floor(cell / board.width) + d.y;
  return x < 0 || x >= board.width || y < 0 || y >= board.height
    ? -1
    : y * board.width + x;
}
export function moveCargo(
  board: CargoBoard,
  state: CargoState,
  direction: CargoDirection
): { state: CargoState; pushed: boolean } | null {
  const target = neighbor(board, state.player, direction);
  if (!board.floor.includes(target)) return null;
  const crateIndex = state.crates.indexOf(target),
    crates = [...state.crates];
  if (crateIndex >= 0) {
    const beyond = neighbor(board, target, direction);
    if (!board.floor.includes(beyond) || crates.includes(beyond)) return null;
    crates[crateIndex] = beyond;
  }
  return { state: { player: target, crates }, pushed: crateIndex >= 0 };
}
export function cargoSolved(board: CargoBoard, state: CargoState) {
  return state.crates.every((cell) => board.goals.includes(cell));
}
export function cargoCorner(board: CargoBoard, cell: number) {
  if (board.goals.includes(cell)) return false;
  const wall = DIRECTIONS.map(
    (d) => !board.floor.includes(neighbor(board, cell, d.key))
  );
  return (wall[0] || wall[2]) && (wall[1] || wall[3]);
}
