const KEY_PREFIX = 'aeroplay:';

const withPrefix = (key: string, game?: string) =>
  `${KEY_PREFIX}${game ? `${game}:` : ''}${key}`;

export function save<T>(key: string, value: T, game?: string): void {
  try {
    localStorage.setItem(withPrefix(key, game), JSON.stringify(value));
  } catch (err) {
    console.warn('Save failed', err);
  }
}

export function load<T>(key: string, fallback: T, game?: string): T {
  try {
    const raw = localStorage.getItem(withPrefix(key, game));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('Load failed', err);
    return fallback;
  }
}

export function namespace(game: string) {
  return {
    save: <T>(key: string, value: T) => save(key, value, game),
    load: <T>(key: string, fallback: T) => load(key, fallback, game)
  };
}
