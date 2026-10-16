export const games = [
  { id: '2048', name: '2048', accent: '#da3726', load: () => import('./2048/index') },
  { id: 'lightsout', name: 'Lights Out', accent: '#174d91', load: () => import('./lightsout/index') },
  { id: 'flappy', name: 'Flappy Bird', accent: '#da3726', load: () => import('./flappy/index') },
  { id: 'sudoku', name: 'Sudoku', accent: '#174d91', load: () => import('./sudoku/index') },
  { id: 'match3', name: 'Match-3', accent: '#78528b', load: () => import('./match3/index') },
  { id: 'cargo', name: 'Pocket Cargo', accent: '#174d91', load: () => import('./cargo/index') },
  { id: 'sky', name: 'Sky Rush', accent: '#da3726', load: () => import('./sky/index') },
  { id: 'pushball', name: 'Robot Pushball', accent: '#174d91', load: () => import('./pushball/index') },
];
export type GameEntry = (typeof games)[number];
