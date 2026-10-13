export const LOCAL_MODEL = {
  name: "TAMEV-Nano INT8",
  repository: "Tamkimd/tamev-nano-tinybert",
  revision: "ad15b45f35526070d48fb91f6597d2805a2d80af",
  parameters: 14390185,
  directory: "/models/tamev-nano/",
  modelBytes: 14872474,
  modelHash: "a83a4604a803df9efed89ed2e419184c2a1de995174ae6e8b3682de985c47484",
  games: [
    "sky",
    "cargo",
    "snake",
    "tetris",
    "2048",
    "flappy",
    "maze",
    "match3",
    "sudoku",
    "lightsout",
  ],
} as const;

export interface LocalDecisionResult {
  choice: string;
  probabilities: number[];
  inferenceMs: number;
  totalMs: number;
  contextTokens: number;
  optionTokens: number[];
  questionTokens?: number;
}

export interface DecisionObservation {
  /** Identifies a decision window; the game owns its validity and deadline. */
  key: string;
  context: string;
  question: string;
  choices: Record<string, string>;
}

export interface LocalModelInfo {
  model: string;
  backend: "wasm" | "javascript";
  threads: 1;
  loadMs: number;
  initializations: number;
  modelBytes: number;
  residentTensorBytes?: number;
}

