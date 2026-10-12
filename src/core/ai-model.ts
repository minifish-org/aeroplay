import type { LocalModelInfo } from './decision-model';

type ModelState = { status: 'idle' | 'loading' | 'ready' | 'error'; message: string };
let state: ModelState = { status: 'idle', message: 'Load TAMEV to play offline with AI.' };
let loading: Promise<LocalModelInfo> | null = null;
const listeners = new Set<() => void>();
export const getAIModelState = () => state;
export function subscribeAIModel(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: ModelState) {
  state = next;
  listeners.forEach(listener => listener());
}
export function prepareTamev() {
  if (loading) return loading;
  publish({ status: 'loading', message: 'Loading TAMEV on this device…' });
  loading = import('./local-decision').then(model => model.prepareLocalDecision()).then(info => {
    publish({ status: 'ready', message: 'TAMEV ready · Offline' });
    return info;
  }).catch(error => {
    loading = null;
    publish({ status: 'error', message: error instanceof Error ? error.message : 'TAMEV could not load.' });
    throw error;
  });
  return loading;
}
