export type GameMount = (
  root: HTMLElement,
  goBack: () => void,
  signal?: AbortSignal,
) => (() => void) | Promise<() => void>;

export interface GameModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  mount: GameMount;
}
