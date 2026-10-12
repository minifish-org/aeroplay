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

export const TINY_MODEL = {
  name: "TinyDecide Q4",
  repository: "TheREZOR/TinyDecide",
  revision: "aa745b73a2db9a43bce731f0e8e5c90a6899fe2c",
  parameters: 10409613,
  directory: "/models/tinydecide/",
  modelBytes: 6181984,
  modelHash: "23fe9d93f2eafadbe4dc686a7dc5f309fbcba9ea1a4873d457e75d17c5bf3441",
  metaHash: "2fb895cfb0cdd6b11fcfb5573033e846bf4defadb3c78b9989cccfeefe06758f",
  games: LOCAL_MODEL.games,
} as const;

// Choice-only conversion of the same pinned upstream weights, without retraining
// or activation quantization. MatMulNBits retains the original Q4 projections.
export const TINY_ONNX_MODEL = {
  ...TINY_MODEL,
  name: "TinyDecide Q4 ONNX",
  sourceParameters: TINY_MODEL.parameters,
  parameters: 10114177,
  file: "choice-q4.onnx",
  modelBytes: 6955425,
  modelHash: "22a0d446964890745c1f6f5ced38369e1bfb3388922409feb6ed52aa55124aa7",
} as const;
