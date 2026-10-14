export type PlanningState = { game: string; epoch: string; [key: string]: unknown };
export type PlannedInput = { input: unknown; expected: string; at?: number; until?: number };
export type InputPlan = { label: string; steps: PlannedInput[] };
export const planningSignature = (state: PlanningState) => state.game + ':' + state.epoch + ':' + JSON.stringify(state);
export interface PlayerGame<Input> {
  game: string; observe: () => { key: string; context: string; question: string; choices: Record<string,string>; inputs: Record<string,Input> } | null;
  isCurrent: (key: string) => boolean; apply: (input: Input) => boolean; planning?: () => PlanningState | null;
  clearInput?: () => void; onPlanSelected?: (plan: InputPlan) => void; start: () => void; pause: () => void; resume: () => void; isFinished: () => boolean; isPaused: () => boolean;
}
export class HumanPlayer { readonly type = 'human'; }
export class TamevPlayer { readonly type = 'ai'; }
export class Player {
  type: 'human' | 'ai' = 'human'; status: 'idle' | 'playing' | 'paused' | 'finished' = 'idle';
  error = ''; decisions = 0; discarded = 0; hasUsedAI = false; thinking = false;
  private game: PlayerGame<unknown> | null = null; private listeners = new Set<() => void>();
  constructor(_controller: HumanPlayer | TamevPlayer = new HumanPlayer(), private claim = () => {}) { void _controller; }
  connect<Input>(game: PlayerGame<Input>) { this.game = game as PlayerGame<unknown>; return { human: (input: Input) => this.submitHumanInput(input), dispose: () => { this.game = null; } }; }
  submitHumanInput(input: unknown) { return this.type === 'human' && !!this.game?.apply(input); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private publish() { this.listeners.forEach(listener => listener()); }
  start() { this.status = 'playing'; this.game?.start(); this.publish(); }
  pause() { this.status = 'paused'; this.game?.pause(); this.publish(); }
  resume() { this.status = 'playing'; this.game?.resume(); this.publish(); }
  watchAI() { this.claim(); this.error = 'The local player is unavailable.'; this.publish(); }
  takeOver() { this.type = 'human'; this.status = 'idle'; this.game?.resume(); this.publish(); }
  retry() { this.error = ''; this.publish(); }
  async tick() { if(this.game?.isFinished()) this.status = 'finished'; }
  diagnostics() { return { type: this.type, status: this.status, error: this.error, decisions: 0, discarded: 0, hasUsedAI: false, thinking: false, plan: 0, nextPlan: 0, pending: 0 }; }
  dispose() { this.game = null; this.listeners.clear(); }
}
export const getAIModelState = () => ({ status: 'idle', message: '' });
export const subscribeAIModel = (_listener: () => void) => { void _listener; return () => {}; };
export const prepareTamev = async () => { throw new Error('The local player is unavailable.'); };
export const getLocalDecisionDiagnostics = () => ({ info: null, pending: 0, lastDecision: null });
export async function getHint(_state: PlanningState, _signal: AbortSignal): Promise<InputPlan | null> { void _state; void _signal; throw new Error('A hint is unavailable.'); }
