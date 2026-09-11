import { GameModule } from './gameTypes';
export type GameEntry = Omit<GameModule, 'mount'> & {
  category: 'Arcade' | 'Puzzles';
  accent: string;
  dimension?: '3D';
  load: () => Promise<{ default: GameModule }>;
};
export const games: GameEntry[] = [
  {
    id: 'sky',
    name: 'Sky Rush',
    description:
      'Bank through the clouds. Chase rings, build a streak, hit the boost.',
    icon: '✈️',
    category: 'Arcade',
    accent: '#f5cb8b',
    dimension: '3D',
    load: () => import('./sky')
  },
  {
    id: 'cargo',
    name: 'Pocket Cargo',
    description:
      'Twelve little islands. Twelve clever deliveries. Take the scenic route.',
    icon: '📦',
    category: 'Puzzles',
    accent: '#9bd3bd',
    dimension: '3D',
    load: () => import('./cargo')
  },
  {
    id: 'snake',
    name: 'Snake',
    description: 'Chase golden fruit. Find your rhythm as the pace rises.',
    icon: '🐍',
    category: 'Arcade',
    accent: '#a9dfba',
    load: () => import('./snake')
  },
  {
    id: 'tetris',
    name: 'Tetris',
    description:
      'Hold your next move. Stack, rotate, and build a clearing streak.',
    icon: '🧱',
    category: 'Arcade',
    accent: '#c2b1ef',
    load: () => import('./tetris')
  },
  {
    id: '2048',
    name: '2048',
    description: 'Build your next milestone. Undo a move and try another path.',
    icon: '🧮',
    category: 'Puzzles',
    accent: '#a4d6e5',
    load: () => import('./game2048')
  },
  {
    id: 'flappy',
    name: 'Flappy Bird',
    description: 'Find the perfect flight. Thread the gaps for bonus points.',
    icon: '🐤',
    category: 'Arcade',
    accent: '#f2d495',
    load: () => import('./flappy')
  },
  {
    id: 'maze',
    name: 'Maze Escape',
    description: 'Explore, collect three stars, and find your way home.',
    icon: '🧭',
    category: 'Puzzles',
    accent: '#a4d8bf',
    load: () => import('./maze')
  },
  {
    id: 'match3',
    name: 'Match-3',
    description: '30 moves. One goal. Set off a spectacular chain reaction.',
    icon: '💎',
    category: 'Puzzles',
    accent: '#d4b4ed',
    load: () => import('./match3')
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    description:
      'A quiet challenge, with pencil notes and a nudge when you need it.',
    icon: '🔢',
    category: 'Puzzles',
    accent: '#adcaeb',
    load: () => import('./sudoku')
  },
  {
    id: 'lightsout',
    name: 'Lights Out',
    description: 'A ripple of light. Solve each puzzle in the fewest taps.',
    icon: '💡',
    category: 'Puzzles',
    accent: '#ecd196',
    load: () => import('./lightsout')
  }
];
