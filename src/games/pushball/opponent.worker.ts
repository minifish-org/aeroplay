import { createPushballPlans } from './policy';
import type { PlanningState } from '../../core/ai-planning-state';
// Same AIPlanner protocol; keep unrelated puzzle solvers out of this real-time worker.
self.onmessage = ({ data }: MessageEvent<{ id: number; state: PlanningState }>) => {
  try {
    if (data.state.game !== 'pushball') throw new Error('Wrong planning state.');
    self.postMessage({ id: data.id, plans: createPushballPlans(data.state) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Planning failed.' });
  }
};
