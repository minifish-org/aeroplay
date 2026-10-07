import { createTouchButton } from "./ui";

export type Mode = "ready" | "playing" | "paused" | "over" | "won";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export function exposeGame(read: () => object, advance?: (ms: number) => void) {
  window.render_game_to_text = () =>
    JSON.stringify({
      coordinates: "Origin top-left; x right, y down",
      ...read(),
    });
  window.advanceTime = advance ?? (() => {});
  return () => {
    delete window.render_game_to_text;
    delete window.advanceTime;
  };
}

export function directionPad(
  area: HTMLElement,
  move: (x: number, y: number) => void,
) {
  const pad = document.createElement("div");
  pad.className = "control-grid";
  const directions: [string, number, number, string][] = [
    ["↑", 0, -1, "Up"],
    ["←", -1, 0, "Left"],
    ["→", 1, 0, "Right"],
    ["↓", 0, 1, "Down"],
  ];
  directions.forEach(([label, x, y, name], i) => {
    const button = createTouchButton(label, () => move(x, y));
    button.style.gridArea = ["1 / 2", "2 / 1", "2 / 3", "3 / 2"][i];
    button.setAttribute("aria-label", name);
    pad.appendChild(button);
  });
  area.appendChild(pad);
}
