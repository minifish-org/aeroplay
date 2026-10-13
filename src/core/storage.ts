const KEY_PREFIX = 'aeroplay:';
export type PlayProfile = 'human' | 'ai';
let runProfile: { owner: PlayProfile } = { owner: 'human' };

export function setPlayProfile(profile: PlayProfile) {
  const run = { owner: profile };
  runProfile = run;
  return () => { run.owner = 'ai'; };
}

export function getPlayProfile() {
  return runProfile.owner;
}

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
  // Capture the run, including a later handoff to AI. A new mount cannot change
  // this run's ownership, and takeover never turns AI records into personal ones.
  const run = runProfile;
  const owner = () => run.owner === 'human' ? game : `${run.owner}:${game}`;
  return {
    save: <T>(key: string, value: T) => save(key, value, owner()),
    load: <T>(key: string, fallback: T) => load(key, fallback, owner())
  };
}
