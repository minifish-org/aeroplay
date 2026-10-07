import { GameModule } from "./gameTypes";
export type GameEntry = Omit<GameModule, "mount"> & {
  category: "Arcade" | "Puzzles";
  accent: string;
  dimension?: "3D";
  load: () => Promise<{ default: GameModule }>;
};
export const games: GameEntry[] = [
  {
    id: "sky",
    name: "Sky Rush",
    description:
      "Bank through the clouds. Chase rings, build a streak, hit the boost.",
    icon: "✈️",
    category: "Arcade",
    accent: "#f5cb8b",
    dimension: "3D",
    load: () => import("./sky"),
  },
  {
    id: "cargo",
    name: "Pocket Cargo",
    description:
      "Twelve little islands. Twelve clever deliveries. Take the scenic route.",
    icon: "📦",
    category: "Puzzles",
    accent: "#9bd3bd",
    dimension: "3D",
    load: () => import("./cargo"),
  },
  {
    id: "snake",
    name: "Snake",
    description: "A garden friend, juicy apples and a golden-star surprise.",
    icon: "🐍",
    category: "Arcade",
    accent: "#a9dfba",
    load: () => import("./snake"),
  },
  {
    id: "tetris",
    name: "Tetris",
    description: "Build a rainbow. Make room for one more lovely block.",
    icon: "🧱",
    category: "Arcade",
    accent: "#c2b1ef",
    load: () => import("./tetris"),
  },
  {
    id: "2048",
    name: "2048",
    description: "Slide, pop and grow a rainbow of numbers.",
    icon: "🧮",
    category: "Puzzles",
    accent: "#a4d6e5",
    load: () => import("./game2048"),
  },
  {
    id: "flappy",
    name: "Flappy Bird",
    description: "Small wings, sunny skies. Chase the golden rings!",
    icon: "🐤",
    category: "Arcade",
    accent: "#f2d495",
    load: () => import("./flappy"),
  },
  {
    id: "maze",
    name: "Maze Escape",
    description: "Collect three stars and lead a little explorer home.",
    icon: "🧭",
    category: "Puzzles",
    accent: "#a4d8bf",
    load: () => import("./maze"),
  },
  {
    id: "match3",
    name: "Match-3",
    description: "A pocketful of candy gems. Make a sparkling chain!",
    icon: "💎",
    category: "Puzzles",
    accent: "#d4b4ed",
    load: () => import("./match3"),
  },
  {
    id: "sudoku",
    name: "Sudoku",
    description:
      "A friendly number garden. Start gently, then try a challenge.",
    icon: "🔢",
    category: "Puzzles",
    accent: "#adcaeb",
    load: () => import("./sudoku"),
  },
  {
    id: "lightsout",
    name: "Lights Out",
    description: "Tuck the little stars in. One tap makes a ripple!",
    icon: "💡",
    category: "Puzzles",
    accent: "#ecd196",
    load: () => import("./lightsout"),
  },
];
