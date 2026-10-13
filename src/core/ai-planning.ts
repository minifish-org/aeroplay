import type { InputPlan, PlannedInput, PlanningState } from './ai-planning-state';

/** A controller-owned worker; it reads snapshots and never updates a game. */
export class AIPlanner {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending: { id: number; reject: (error: Error) => void; cleanup: () => void } | null = null;

  request(state: PlanningState, ahead: PlannedInput[], signal: AbortSignal): Promise<InputPlan[]> {
    if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    if (this.pending) return Promise.reject(new Error('The planner is busy.'));
    const worker = this.worker ??= state.game === 'pushball'
      ? new Worker(new URL('../games/pushball/opponent.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./ai-planning.worker.ts', import.meta.url), { type: 'module' });
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const abort = () => this.dispose();
      const timer = window.setTimeout(() => this.dispose(new Error('Planning timed out.')), 4000);
      const cleanup = () => { window.clearTimeout(timer); signal.removeEventListener('abort', abort); };
      this.pending = { id, reject, cleanup };
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<{ id: number; plans?: InputPlan[]; error?: string }>) => {
        if (this.pending?.id !== data.id) return;
        cleanup(); this.pending = null;
        if (data.error || !data.plans) reject(new Error(data.error ?? 'No plans returned.'));
        else resolve(data.plans);
      };
      worker.onerror = () => this.dispose(new Error('The planning worker stopped.'));
      worker.onmessageerror = () => this.dispose(new Error('The planning worker returned unreadable data.'));
      worker.postMessage({ id, state, ahead });
    });
  }

  dispose(error: Error = new DOMException('Cancelled', 'AbortError')) {
    this.worker?.terminate(); this.worker = null;
    this.pending?.cleanup(); this.pending?.reject(error); this.pending = null;
  }
}
