import { Player, TamevPlayer, type PlayerGame } from '../../core/player';
import type { Action } from './model';

/** A second shared Player controls only the opponent, never the human's record ownership. */
export function connectOpponent(game: PlayerGame<Action>) {
  const player = new Player(new TamevPlayer());
  const connection = player.connect(game);
  return { player, dispose() { connection.dispose(); player.dispose(); } };
}
