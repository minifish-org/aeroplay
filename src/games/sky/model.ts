export type FlightMode = 'ready' | 'playing' | 'paused' | 'over' | 'won';
export type FlightRow = {
  distance: number;
  safeLane: number;
  obstacles: number[];
  passed: boolean;
  index: number;
};
export type FlightState = {
  mode: FlightMode;
  lane: number;
  x: number;
  distance: number;
  score: number;
  rings: number;
  combo: number;
  maxCombo: number;
  charge: number;
  boost: number;
  shield: number;
  invincible: number;
  sector: number;
  rows: FlightRow[];
  message: string;
  messageTime: number;
};
export const SECTOR_LENGTH = 1000;
export const LANE_WIDTH = 3.2;
export function createFlight(random = Math.random, sector = 1): FlightState {
  const state: FlightState = {
    mode: 'ready',
    lane: 1,
    x: 0,
    distance: 0,
    score: 0,
    rings: 0,
    combo: 0,
    maxCombo: 0,
    charge: 100,
    boost: 0,
    shield: 1,
    invincible: 0,
    sector,
    rows: [],
    message: '',
    messageTime: 0
  };
  let lane = 1;
  for (let index = 0; index < 14; index++) {
    lane = nextLane(lane, random);
    state.rows.push(makeRow(index, 38 + index * 21, lane));
  }
  return state;
}
function nextLane(previous: number, random: () => number) {
  const options = [previous - 1, previous, previous + 1].filter((lane) => lane >= 0 && lane <= 2);
  return options[Math.floor(random() * options.length)];
}
function makeRow(index: number, distance: number, safeLane: number): FlightRow {
  return {
    distance,
    safeLane,
    obstacles: index < 2 || index % 4 === 0
      ? [(safeLane + 1) % 3]
      : [0, 1, 2].filter((lane) => lane !== safeLane),
    passed: false,
    index
  };
}
export function steerFlight(state: FlightState, direction: number) {
  if (state.mode !== 'playing')
    return;
  state.lane = Math.max(0, Math.min(2, state.lane + direction));
}
export function boostFlight(state: FlightState) {
  if (state.mode !== 'playing' || state.charge < 100 || state.boost > 0)
    return false;
  state.charge = 0;
  state.boost = 3;
  state.message = 'BOOST · double ring points';
  state.messageTime = 1.5;
  return true;
}
export function stepFlight(state: FlightState, dt: number, random = Math.random): ('collect' | 'hit' | 'win')[] {
  const events: ('collect' | 'hit' | 'win')[] = [];
  if (state.mode !== 'playing')
    return events;
  state.x +=
    ((state.lane - 1) * LANE_WIDTH - state.x) * (1 - Math.exp(-15 * dt));
  state.boost = Math.max(0, state.boost - dt);
  state.invincible = Math.max(0, state.invincible - dt);
  state.messageTime = Math.max(0, state.messageTime - dt);
  const speed = Math.min(42, 24 + state.sector * 2 + state.distance / 180) *
    (state.boost > 0 ? 1.55 : 1);
  state.distance += speed * dt;
  for (const row of state.rows) {
    const previous = row.distance;
    row.distance -= speed * dt;
    if (previous >= 0 && row.distance < 0 && !row.passed) {
      row.passed = true;
      const hit = row.obstacles.some((lane) => Math.abs(state.x - (lane - 1) * LANE_WIDTH) < 1.18);
      if (hit && state.invincible === 0) {
        state.combo = 0;
        events.push('hit');
        if (state.shield > 0) {
          state.shield = 0;
          state.invincible = 1.7;
          state.message = 'Shield broken';
          state.messageTime = 2;
        }
        else {
          state.mode = 'over';
          state.message = '';
          return events;
        }
      }
      else if (Math.abs(state.x - (row.safeLane - 1) * LANE_WIDTH) < 1.1) {
        state.rings++;
        state.combo++;
        state.maxCombo = Math.max(state.combo, state.maxCombo);
        const multiplier = Math.min(5, 1 + Math.floor(state.combo / 5));
        state.score += 100 * multiplier * (state.boost > 0 ? 2 : 1);
        state.charge = Math.min(100, state.charge + 14);
        state.message =
          state.combo % 5 === 0
            ? `RING STREAK ×${multiplier}`
            : `+${100 * multiplier * (state.boost > 0 ? 2 : 1)} · clean flight`;
        state.messageTime = 0.8;
        events.push('collect');
      }
      else
        state.combo = 0;
    }
  }
  for (const row of state.rows)
    if (row.distance < -16) {
      const last = state.rows.reduce((a, b) => a.distance > b.distance ? a : b);
      Object.assign(row, makeRow(last.index + 1, last.distance + 21, nextLane(last.safeLane, random)));
    }
  if (state.distance >= SECTOR_LENGTH) {
    state.distance = SECTOR_LENGTH;
    state.mode = 'won';
    events.push('win');
  }
  return events;
}
export class SkyRun {
  state: FlightState;
  epoch = 0;
  best: number;
  events: ('collect' | 'hit' | 'win')[] = [];
  constructor(best = 0) { this.best = best; this.state = createFlight(); }
  get mode() { return this.state.mode; }
  start() { if (this.state.mode === 'ready' || this.state.mode === 'paused')
    this.state.mode = 'playing'; }
  reset() { this.state = createFlight(); this.epoch++; this.events = []; }
  nextSector() { const previous = this.state; this.state = createFlight(Math.random, previous.sector + 1); this.state.score = previous.score; this.state.rings = previous.rings; this.state.maxCombo = previous.maxCombo; this.epoch++; this.start(); }
  pause() { if (this.mode === 'playing')
    this.state.mode = 'paused'; }
  resume() { if (this.mode === 'paused')
    this.start(); }
  savedRun() {
    if (this.mode === 'ready')
      return null;
    const { mode, lane, x, distance, score, rings, combo, maxCombo, charge, boost, shield, invincible, sector, rows } = this.state;
    return { version: 1, state: { mode, lane, x, distance, score, rings, combo, maxCombo, charge, boost, shield, invincible, sector, rows: rows.map(row => ({ ...row, obstacles: [...row.obstacles] })) } };
  }
  restore(raw: unknown) {
    if (!raw || typeof raw !== 'object')
      return false;
    const saved = raw as { version: number; state: FlightState }, state = saved.state;
    const finite = (value: number, low: number, high: number) => Number.isFinite(value) && value >= low && value <= high;
    const integer = (value: number, low: number, high: number) => Number.isInteger(value) && finite(value, low, high);
    if (saved.version !== 1 || !state || !['playing', 'paused', 'over', 'won'].includes(state.mode) ||
      !integer(state.lane, 0, 2) || !finite(state.x, -LANE_WIDTH, LANE_WIDTH) || !finite(state.distance, 0, SECTOR_LENGTH) ||
      !integer(state.score, 0, 1e12) || !integer(state.rings, 0, 1e10) || !integer(state.combo, 0, state.rings) || !integer(state.maxCombo, state.combo, state.rings) ||
      !finite(state.charge, 0, 100) || !finite(state.boost, 0, 3) || !integer(state.shield, 0, 1) || !finite(state.invincible, 0, 1.7) || !integer(state.sector, 1, 1e6) ||
      !Array.isArray(state.rows) || state.rows.length !== 14 || !state.rows.every(row => row && typeof row === 'object' &&
        finite(row.distance, -20, 400) && integer(row.safeLane, 0, 2) && integer(row.index, 0, 1e9) && typeof row.passed === 'boolean' &&
        Array.isArray(row.obstacles) && row.obstacles.length <= 3 && new Set(row.obstacles).size === row.obstacles.length && row.obstacles.every(lane => integer(lane, 0, 2))))
      return false;
    const restored = structuredClone(state);
    this.state = { ...restored, mode: state.mode === 'playing' ? 'paused' : state.mode, message: '', messageTime: 0 };
    this.best = Math.max(this.best, state.score);
    this.events = [];
    this.epoch++;
    return true;
  }
  act(input: unknown) {
    if (input === 'start') {
      this.start();
      return true;
    }
    if (input === 'restart') {
      this.reset();
      this.start();
      return true;
    }
    if (input === 'next' && this.mode === 'won') {
      this.nextSector();
      return true;
    }
    if (input === 'pause') {
      this.mode === 'paused' ? this.resume() : this.pause();
      return true;
    }
    if (this.mode !== 'playing')
      return false;
    if (input === 'wait')
      return true;
    if (input === 'boost' || input === 'up')
      return boostFlight(this.state);
    if (input !== 'left' && input !== 'right')
      return false;
    const before = this.state.lane;
    steerFlight(this.state, input === 'left' ? -1 : 1);
    return before !== this.state.lane;
  }
  step(dt: number) { this.events.push(...stepFlight(this.state, dt)); this.best = Math.max(this.best, this.state.score); }
  planning() { const row = this.state.rows.filter(row => !row.passed && row.distance >= 0).sort((a, b) => a.distance - b.distance)[0]; return this.mode === 'playing' && row ? { game: 'sky' as const, epoch: this.epoch + ':' + this.state.sector, row: row.index, lane: this.state.lane, target: row.safeLane, obstacles: [...row.obstacles] } : null; }
  snapshot() { return { game: 'sky', ...structuredClone(this.state), best: this.best }; }
}
