const PREFIX = 'aeroplay:';
export type PlayProfile = 'human' | 'ai';
let run = { owner: 'human' as PlayProfile };
export function setPlayProfile(owner: PlayProfile) {
  run = { owner }; const captured = run; return () => { captured.owner = 'ai'; };
}
export const getPlayProfile = () => run.owner;
export function save<T>(key: string, value: T, game?: string) {
  try { localStorage.setItem(PREFIX + (game ? game + ':' : '') + key, JSON.stringify(value)); }
  catch { console.warn('Progress could not be saved.'); }
}
export function load<T>(key: string, fallback: T, game?: string): T {
  try { const value = localStorage.getItem(PREFIX + (game ? game + ':' : '') + key); return value === null ? fallback : JSON.parse(value) as T; }
  catch { return fallback; }
}
export function namespace(game: string) {
  const captured = run;
  const owner = () => captured.owner === 'human' ? game : 'ai:' + game;
  return { save: <T>(key: string, value: T) => save(key, value, owner()),
    load: <T>(key: string, fallback: T) => load(key, fallback, owner()) };
}
export type Store = ReturnType<typeof namespace>;
