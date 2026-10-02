import { load, save } from './storage';
import type { LayaObservation } from './laya-bridge';

const PROTOCOL = 'aeroplay-laya-v1';
export type ConnectionState = 'unconfigured' | 'checking' | 'ready' | 'offline' | 'unavailable';
export interface LayaHealth {
  ready: boolean;
  protocol: string;
  model: string;
  games: string[];
}
export interface LayaConnection {
  state: ConnectionState;
  message: string;
  model: string;
  games: string[];
}

const saved = load<{ endpoint?: unknown }>('laya-settings', {});
let endpoint = typeof saved.endpoint === 'string' ? saved.endpoint : '';
let revision = 0;
let healthRequest: AbortController | null = null;
let connection: LayaConnection = {
  state: endpoint ? 'checking' : 'unconfigured',
  message: endpoint ? 'Checking Laya…' : 'Set up Laya to watch it play.',
  model: '', games: []
};
const listeners = new Set<() => void>();

export function normalizeLayaAddress(value: string) {
  if (!value.trim()) return '';
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter a full service address, starting with https://.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Use the base service address without a password, query or fragment.');
  if (location.protocol === 'https:' && url.protocol !== 'https:')
    throw new Error('This site needs an HTTPS Laya service.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function getLayaAddress() { return endpoint; }
export function getLayaConnection() { return connection; }
export function subscribeLaya(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(state: ConnectionState, message: string, health?: LayaHealth) {
  connection = { state, message, model: health?.model ?? '', games: health?.games ?? [] };
  listeners.forEach(listener => listener());
}

export async function probeLaya(address: string, signal?: AbortSignal): Promise<LayaHealth> {
  const base = normalizeLayaAddress(address);
  if (!base) throw new Error('Enter your Laya service address first.');
  if (!navigator.onLine) throw new Error('You’re offline. You can keep playing yourself.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 5000);
  try {
    const response = await fetch(`${base}/health`, { signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('Laya could not be reached. Check the service address.');
    const health = await response.json() as LayaHealth;
    if (health.protocol !== PROTOCOL || !Array.isArray(health.games) || !health.games.every(id => typeof id === 'string' && id.trim()) || typeof health.model !== 'string' || !health.model.trim())
      throw new Error('This address is not an AeroPlay Laya service.');
    if (health.ready !== true) throw new Error('Laya is still getting ready. Try again shortly.');
    if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return health;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The connection timed out. Check the address and try again.');
    if (error instanceof TypeError) throw new Error('Could not reach Laya. Check its address and connection.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function checkLayaConnection() {
  const version = ++revision;
  healthRequest?.abort();
  healthRequest = null;
  if (!endpoint) { publish('unconfigured', 'Set up Laya to watch it play.'); return false; }
  if (!navigator.onLine) { publish('offline', 'Offline · Play yourself'); return false; }
  const controller = new AbortController();
  healthRequest = controller;
  publish('checking', 'Checking Laya…');
  try {
    const health = await probeLaya(endpoint, controller.signal);
    if (version !== revision) return false;
    publish('ready', 'Laya available', health);
    return true;
  } catch (error) {
    if (version !== revision) return false;
    publish(navigator.onLine ? 'unavailable' : 'offline', error instanceof Error ? error.message : 'Laya is unavailable.');
    return false;
  } finally {
    if (healthRequest === controller) healthRequest = null;
  }
}

export function configureLaya(address: string) {
  const normalized = normalizeLayaAddress(address);
  endpoint = normalized;
  save('laya-settings', { endpoint });
  return checkLayaConnection();
}

export async function requestLayaMove(game: string, observation: LayaObservation, signal: AbortSignal) {
  const address = endpoint;
  if (!address || connection.state !== 'ready' || !connection.games.includes(game))
    throw new Error('Laya is unavailable for this game.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 8000);
  try {
    const response = await fetch(`${address}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game, context: observation.context, question: { type: 'choice', instructions: observation.question, criteria: observation.choices } }),
      signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Laya is busy. Try again in a moment.' : 'Laya could not choose a move. Try again or take over.');
    const decision = await response.json() as { choice?: unknown; model?: unknown };
    if (typeof decision.choice !== 'string' || !Object.hasOwn(observation.choices, decision.choice))
      throw new Error('Laya returned an unavailable move. Try again or take over.');
    if (address !== endpoint || signal.aborted || controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    return decision.choice;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

window.addEventListener('offline', () => {
  ++revision;
  healthRequest?.abort();
  publish(endpoint ? 'offline' : 'unconfigured', 'Offline · Play yourself');
});
window.addEventListener('online', () => { if (endpoint) void checkLayaConnection(); });
window.addEventListener('pageshow', () => { if (endpoint) void checkLayaConnection(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && endpoint && connection.state !== 'ready') void checkLayaConnection();
});
if (endpoint) void checkLayaConnection();
