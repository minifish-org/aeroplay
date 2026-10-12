import type { FlightPipe } from '../games/flappyFlight';
import type { CargoBoard, CargoState } from '../games/cargo/model';

export type Point = { x: number; y: number };
type Base = { epoch: string };
export type PlanningState = Base & (
  | { game: 'flappy'; time: number; y: number; velocity: number; pipes: FlightPipe[]; passed: number }
  | { game: 'snake'; tick: number; segments: Point[]; direction: Point; food: Point | null; bonus: Point | null; size: number; wrap: boolean }
  | { game: 'tetris'; board: number[][]; piece: { matrix: number[][]; x: number; y: number } }
  | { game: 'maze'; size: number; walls: { top: boolean; right: boolean; bottom: boolean; left: boolean }[][]; position: Point; stars: Point[] }
  | { game: 'cargo'; board: CargoBoard; state: CargoState }
  | { game: 'lightsout'; board: number[] }
  | { game: 'sudoku'; board: number[]; givens: number[]; selected: number | null; notes: boolean }
  | { game: '2048'; board: number[][] }
  | { game: 'match3'; board: number[][]; selected: Point | null }
  | { game: 'sky'; row: number; lane: number; target: number; obstacles: number[] }
);

export type PlannedInput = {
  input: unknown;
  expected: string;
  tick?: number;
  at?: number;
  until?: number;
  y?: number;
  velocity?: number;
};
export type InputPlan = { label: string; steps: PlannedInput[] };

export function planningSignature(state: PlanningState): string {
  const prefix = `${state.game}:${state.epoch}:`;
  switch (state.game) {
    case 'flappy': return prefix;
    case 'snake': return prefix + JSON.stringify([state.tick, state.segments, state.direction, state.food, state.bonus]);
    // Gravity remains live. A changed pose or locked piece invalidates the plan.
    case 'tetris': return prefix + JSON.stringify([state.piece.x, state.piece.matrix]);
    case 'maze': return prefix + JSON.stringify([state.position, state.stars]);
    case 'cargo': return prefix + JSON.stringify(state.state);
    case 'sudoku': return prefix + JSON.stringify([state.board, state.selected, state.notes]);
    case 'match3': return prefix + JSON.stringify([state.board, state.selected]);
    case 'sky': return prefix + `${state.row}:${state.lane}`;
    default: return prefix + JSON.stringify(state.board);
  }
}

export function inspectPlannedInput(state: PlanningState, step: PlannedInput): 'ready' | 'wait' | 'invalid' {
  if (!step.expected.startsWith(`${state.game}:${state.epoch}:`)) return 'invalid';
  if (state.game === 'snake' && step.tick !== undefined && state.tick < step.tick) return 'wait';
  if (planningSignature(state) !== step.expected) return 'invalid';
  if (state.game === 'flappy' && step.at !== undefined) {
    if (state.time < step.at) return 'wait';
    if (state.time > (step.until ?? step.at + 0.1)) return 'invalid';
    const elapsed = state.time - step.at;
    const expectedY = step.y! + step.velocity! * elapsed + 325 * elapsed * elapsed;
    if (Math.abs(state.y - expectedY) > 10 || Math.abs(state.velocity - (step.velocity! + 650 * elapsed)) > 55) return 'invalid';
  }
  return 'ready';
}
