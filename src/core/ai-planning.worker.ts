import { createInputPlans } from './ai-plans';
import type { PlannedInput, PlanningState } from './ai-planning-state';

self.onmessage = ({ data }: MessageEvent<{ id: number; state: PlanningState; ahead: PlannedInput[] }>) => {
  try { self.postMessage({ id: data.id, plans: createInputPlans(data.state, data.ahead) }); }
  catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Planning failed.' }); }
};
