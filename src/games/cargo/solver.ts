import {
  CargoBoard,
  CargoDirection,
  CargoState,
  DIRECTIONS,
  cargoCorner,
  cargoSolved,
  neighbor
} from './model';

type Node = { state: CargoState; route: CargoDirection[]; pushes: number };
// Search pushes rather than every walking step. Equivalent reachable player regions share a state.
export function solveCargo(
  board: CargoBoard,
  start: CargoState,
  limit = 20000
): { moves: CargoDirection[]; pushes: number } | null {
  const floor = new Set(board.floor);
  function reachable(state: CargoState) {
    const routes = new Map<number, CargoDirection[]>([[state.player, []]]),
      queue = [state.player],
      crates = new Set(state.crates);
    for (let i = 0; i < queue.length; i++)
      for (const d of DIRECTIONS) {
        const next = neighbor(board, queue[i], d.key);
        if (!floor.has(next) || crates.has(next) || routes.has(next)) continue;
        routes.set(next, [...routes.get(queue[i])!, d.key]);
        queue.push(next);
      }
    return routes;
  }
  const queue: Node[] = [{ state: start, route: [], pushes: 0 }],
    seen = new Set<string>();
  for (let index = 0; index < queue.length && index < limit; index++) {
    const { state, route, pushes } = queue[index];
    if (cargoSolved(board, state)) return { moves: route, pushes };
    const paths = reachable(state),
      key = `${[...state.crates].sort((a, b) => a - b)}|${Math.min(...paths.keys())}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (let i = 0; i < state.crates.length; i++)
      for (let d = 0; d < 4; d++) {
        const crate = state.crates[i],
          direction = DIRECTIONS[d].key;
        const from = neighbor(board, crate, DIRECTIONS[(d + 2) % 4].key),
          target = neighbor(board, crate, direction);
        if (
          !paths.has(from) ||
          !floor.has(target) ||
          state.crates.includes(target) ||
          cargoCorner(board, target)
        )
          continue;
        const crates = [...state.crates];
        crates[i] = target;
        queue.push({
          state: { player: crate, crates },
          route: [...route, ...paths.get(from)!, direction],
          pushes: pushes + 1
        });
      }
  }
  return null;
}
