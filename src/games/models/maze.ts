export type Cell = {
  visited: boolean;
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
};
export type Point = { x: number; y: number };
/** Route steps exclude the player cell; entering the exit ends the round. */
export function mazeLayaTargets(
  stars: Point[],
  exit: Point,
  routeTo: (target: Point) => Point[],
) {
  const candidates = stars
    .map((target) => ({ target, way: routeTo(target), kind: "star" as const }))
    .filter(
      (candidate) =>
        candidate.way.length > 0 &&
        !candidate.way.some(
          (point) => point.x === exit.x && point.y === exit.y,
        ),
    );
  if (candidates.length) return candidates;
  const way = routeTo(exit);
  return way.length ? [{ target: exit, way, kind: "exit" as const }] : [];
}

export function generateMaze(size: number): Cell[][] {
  const COLS = size,
    ROWS = size;
  const grid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({
      visited: false,
      walls: { top: true, right: true, bottom: true, left: true },
    })),
  );

  const stack: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  grid[0][0].visited = true;

  const neighbors = (x: number, y: number) => {
    const dirs = [
      { x: 0, y: -1, wall: "top", opp: "bottom" },
      { x: 1, y: 0, wall: "right", opp: "left" },
      { x: 0, y: 1, wall: "bottom", opp: "top" },
      { x: -1, y: 0, wall: "left", opp: "right" },
    ] as const;
    return dirs
      .map((d) => ({ ...d, nx: x + d.x, ny: y + d.y }))
      .filter((d) => d.nx >= 0 && d.nx < COLS && d.ny >= 0 && d.ny < ROWS);
  };

  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = neighbors(current.x, current.y).filter(
      (n) => !grid[n.ny][n.nx].visited,
    );
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const pick = choices[Math.floor(Math.random() * choices.length)];
    const cell = grid[current.y][current.x];
    cell.walls[pick.wall] = false;
    grid[pick.ny][pick.nx].walls[pick.opp] = false;
    grid[pick.ny][pick.nx].visited = true;
    stack.push({ x: pick.nx, y: pick.ny });
  }

  return grid;
}
