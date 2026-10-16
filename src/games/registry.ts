export const games = [
  { id: '2048', name: '2048', accent: '#c43c2f', load: () => import('./2048/index') },
  { id: 'lightsout', name: 'Lights Out', accent: '#194d83', load: () => import('./lightsout/index') },
  { id: 'flappy', name: 'Flappy Bird', accent: '#c43c2f', load: () => import('./flappy/index') },
  { id: 'sudoku', name: 'Sudoku', accent: '#194d83', load: () => import('./sudoku/index') },
  { id: 'match3', name: 'Match-3', accent: '#775a7b', load: () => import('./match3/index') },
  { id: 'cargo', name: 'Pocket Cargo', accent: '#194d83', load: () => import('./cargo/index') },
  { id: 'sky', name: 'Sky Rush', accent: '#c43c2f', load: () => import('./sky/index') },
  { id: 'pushball', name: 'Robot Pushball', accent: '#194d83', load: () => import('./pushball/index') },
];
export type GameEntry = (typeof games)[number];
