export type GameMount = (root: HTMLElement, goBack: () => void) => () => void;

export interface GameModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  mount: GameMount;
}
