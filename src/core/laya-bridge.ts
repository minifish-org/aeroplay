export interface LayaObservation {
  /** Stable until an action is no longer valid; exclude animation-only changes. */
  key: string;
  context: string;
  question: string;
  choices: Record<string, string>;
}

export interface LayaGameBridge {
  game: string;
  observe: () => LayaObservation | null;
  /** Validate the observation key and move again before applying it. */
  act: (choice: string, key: string) => boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  isFinished: () => boolean;
  isPaused: () => boolean;
  intervalMs?: number;
  assistance?: string;
}

let bridge: LayaGameBridge | null = null;
let controlling = false;
const listeners = new Set<() => void>();

export function registerLayaGame(next: LayaGameBridge) {
  bridge = next;
  listeners.forEach((listener) => listener());
  return () => {
    if (bridge !== next) return;
    bridge = null;
    controlling = false;
    listeners.forEach((listener) => listener());
  };
}

export function getLayaGame() {
  return bridge;
}

export function isLayaControlling() {
  return controlling;
}

export function setLayaControlling(value: boolean) {
  controlling = value;
}

export function subscribeLayaGame(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
