import type { Player } from '../core/player';

export type GameMount = (root: HTMLElement, goBack: () => void, player: Player) => () => void;

export interface GameModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  playMode?: 'versus-ai';
  mount: GameMount;
}
