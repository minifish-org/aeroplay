export const games = [
  { id: '2048', name: '2048', accent: '#8ed3ea', load: () => import('./2048/index') },
  { id: 'lightsout', name: 'Lights Out', accent: '#f2cd83', load: () => import('./lightsout/index') },
  { id: 'flappy', name: 'Flappy Bird', accent: '#f2aa8b', load: () => import('./flappy/index') },
  { id: 'sudoku', name: 'Sudoku', accent: '#a6bde8', load: () => import('./sudoku/index') },
  { id: 'match3', name: 'Match-3', accent: '#cbb0ee', load: () => import('./match3/index') },
  { id: 'cargo', name: 'Pocket Cargo', accent: '#96d5b5', load: () => import('./cargo/index') },
  { id: 'sky', name: 'Sky Rush', accent: '#f2cd83', load: () => import('./sky/index') },
  { id: 'pushball', name: 'Robot Pushball', accent: '#8ed3ea', load: () => import('./pushball/index') },
];
export type GameEntry = (typeof games)[number];
