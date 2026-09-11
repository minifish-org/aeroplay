import { solveCargo } from './solver';
import { CargoBoard, CargoState } from './model';
self.onmessage = (
  event: MessageEvent<{ id: number; board: CargoBoard; state: CargoState }>
) => {
  const { id, board, state } = event.data;
  self.postMessage({ id, result: solveCargo(board, state) });
};
