import type { DecisionObservation } from './decision-model';
import { prepareTamev } from './ai-model';
import { inspectPlannedInput, type InputPlan, type PlannedInput, type PlanningState } from './ai-planning-state';
import { AIPlanner } from './ai-planning';

type PlayerDecision = DecisionObservation & { planning?: PlanningState; ahead?: PlannedInput[] };

export type PlayerType = 'human' | 'ai';
export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'finished';

export interface PlayerObservation<Input> extends DecisionObservation {
  /** Each choice is exactly one input available to the human controller. */
  inputs: Record<string, Input>;
}

export interface PlayerGame<Input> {
  game: string;
  observe: () => PlayerObservation<Input> | null;
  isCurrent: (key: string) => boolean;
  apply: (input: Input) => boolean;
  /** Read-only visible state for controller-owned planning. */
  planning?: () => PlanningState | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  isFinished: () => boolean;
  isPaused: () => boolean;
}

export interface PlayerController {
  readonly type: PlayerType;
  choose: (observation: PlayerDecision, signal: AbortSignal) => Promise<string | InputPlan> | null;
  cancel?: () => void;
}

export class HumanPlayer implements PlayerController {
  readonly type = 'human';
  choose() { return null; }
}

export class TamevPlayer implements PlayerController {
  readonly type = 'ai';
  private planner = new AIPlanner();
  cancel() { this.planner.dispose(); }
  async choose(observation: PlayerDecision, signal: AbortSignal) {
    await prepareTamev();
    const { requestLocalDecision } = await import('./local-decision');
    if (observation.planning) {
      const plans = await this.planner.request(observation.planning, observation.ahead ?? [], signal);
      if (!plans.length) throw new Error('No safe plan was found. The game keeps running; take over or retry.');
      const result = await requestLocalDecision({
        key: observation.key,
        context: `${observation.planning.game}. Plans were calculated from visible state. Every control obeys the normal rules and speed.`,
        question: 'Which plan achieves the goal safely with fewer controls and better outcomes?',
        choices: Object.fromEntries(plans.map((plan, i) => [String(i), plan.label])),
      }, signal);
      return plans[Number(result.choice)];
    }
    const { key, context, question, choices } = observation;
    return (await requestLocalDecision({ key, context, question, choices }, signal)).choice;
  }
}

/** Owns input authority and asynchronous decisions, never the simulation clock. */
export class Player {
  private game: PlayerGame<unknown> | null = null;
  private pending: AbortController | null = null;
  private generation = 0;
  private lastKey = '';
  private listeners = new Set<() => void>();
  private timer = 0;
  private disposed = false;
  private plan: PlannedInput[] = [];
  private nextPlan: PlannedInput[] = [];
  private nextInputAt = 0;
  private readonly visibility = () => {
    if (document.hidden) { this.cancel(); this.lastKey = ''; }
  };
  status: PlayerStatus = 'idle';
  error = '';
  decisions = 0;
  discarded = 0;
  hasUsedAI: boolean;

  constructor(private controller: PlayerController = new HumanPlayer(), private readonly claimAIRecords = () => {}) {
    this.hasUsedAI = controller.type === 'ai';
  }
  get type() { return this.controller.type; }
  get thinking() { return this.pending !== null; }
  observe() { return this.game?.observe() ?? null; }
  submitHumanInput(input: unknown) {
    return this.type === 'human' && this.deliver(this.controller, input);
  }
  private deliver(controller: PlayerController, input: unknown) {
    return !this.disposed && controller === this.controller && !!this.game && this.game.apply(input);
  }

  connect<Input>(game: PlayerGame<Input>) {
    if (this.disposed) throw new Error('A disposed player cannot control a game.');
    if (this.game) throw new Error('A player can control only one mounted game.');
    this.game = game as PlayerGame<unknown>;
    document.addEventListener('visibilitychange', this.visibility);
    return {
      human: (input: Input) => this.submitHumanInput(input),
      dispose: () => { this.cancel(); this.stopPolling(); document.removeEventListener('visibilitychange', this.visibility); this.game = null; },
    };
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private publish() { this.listeners.forEach(listener => listener()); }
  private cancel() {
    ++this.generation; this.pending?.abort(); this.pending = null;
    this.controller.cancel?.(); this.plan = []; this.nextPlan = []; this.nextInputAt = 0;
  }
  private startPolling() {
    if (this.type === 'ai' && !this.timer) this.timer = window.setInterval(() => { void this.tick(); }, 16);
  }
  private stopPolling() { window.clearInterval(this.timer); this.timer = 0; }

  start() {
    if (!this.game || this.disposed) return;
    this.cancel(); this.lastKey = ''; this.error = '';
    this.status = 'playing';
    this.game.start();
    this.startPolling();
    this.publish();
    void this.tick();
  }
  watchAI() {
    this.cancel(); this.controller = new TamevPlayer(); this.hasUsedAI = true;
    this.claimAIRecords(); this.start();
  }
  pause() {
    if (!this.game || this.status === 'finished') return;
    this.cancel(); this.stopPolling(); this.game.pause(); this.status = 'paused'; this.publish();
  }
  resume() {
    if (!this.game || this.status === 'finished') return;
    this.cancel(); this.lastKey = ''; this.error = '';
    this.game.resume(); this.status = 'playing'; this.startPolling(); this.publish(); void this.tick();
  }
  takeOver() {
    this.cancel(); this.stopPolling(); this.controller = new HumanPlayer(); this.error = '';
    this.status = 'idle'; this.game?.resume(); this.publish();
  }
  retry() {
    this.lastKey = ''; this.error = ''; this.publish(); void this.tick();
  }
  async tick() {
    const game = this.game;
    if (!game || this.disposed || this.type !== 'ai' || this.status !== 'playing') return;
    if (game.isFinished()) { this.cancel(); this.stopPolling(); this.status = 'finished'; this.publish(); return; }
    if (game.isPaused()) { this.cancel(); this.stopPolling(); this.status = 'paused'; this.publish(); return; }
    if (document.hidden) return;
    if (this.plan.length && (game.game === 'flappy' || game.game === 'snake' || Date.now() >= this.nextInputAt)) {
      const state = game.planning?.();
      if (state) {
        const valid = inspectPlannedInput(state, this.plan[0]);
        if (valid === 'invalid') { ++this.discarded; this.cancel(); this.lastKey = ''; }
        else if (valid === 'ready') {
          // One native input per poll, with ordinary inter-input pacing.
          if (this.deliver(this.controller, this.plan[0].input)) {
            ++this.decisions; this.plan.shift(); this.nextInputAt = Date.now() + 80;
          } else { ++this.discarded; this.cancel(); this.lastKey = ''; }
        }
      }
    }
    if (!this.plan.length && this.nextPlan.length) { this.plan = this.nextPlan; this.nextPlan = []; }
    if (this.pending) return;
    const state = game.planning?.();
    const prefetch = state?.game === 'flappy' && this.plan.length > 0 && !this.nextPlan.length && (this.plan.at(-1)?.at ?? Infinity) - state.time <= 0.36;
    if (this.plan.length && !prefetch) return;
    const observation = this.observe();
    if (!observation || observation.key === this.lastKey) return;
    const controller = new AbortController(), generation = this.generation;
    this.pending = controller;
    this.lastKey = observation.key;
    try {
      const choice = await this.controller.choose({ ...observation, planning: state ? structuredClone(state) : undefined, ahead: prefetch ? [...this.plan] : [] }, controller.signal);
      if (this.disposed || controller.signal.aborted || generation !== this.generation) return;
      if (this.status !== 'playing' || document.hidden || game.isFinished() || game.isPaused()) {
        ++this.discarded;
        return;
      }
      if (choice && typeof choice !== 'string') {
        const current = game.planning?.();
        if (!current || !choice.steps.length || inspectPlannedInput(current, choice.steps[0]) === 'invalid') {
          ++this.discarded; return;
        }
        if (this.plan.length) this.nextPlan = choice.steps;
        else this.plan = choice.steps;
        this.error = '';
        return;
      }
      if (!game.isCurrent(observation.key)) { ++this.discarded; return; }
      if (choice === null || !Object.hasOwn(observation.inputs, choice)) throw new Error('The AI returned an unavailable input.');
      if (this.deliver(this.controller, observation.inputs[choice])) ++this.decisions;
      this.error = '';
    } catch (error) {
      if (!this.disposed && !controller.signal.aborted && generation === this.generation) {
        // Failed or slow inference supplies no input. The game keeps running.
        this.error = error instanceof Error ? error.message : 'The AI could not choose an input.';
      }
    } finally {
      if (this.pending === controller) this.pending = null;
      this.publish();
    }
  }
  dispose() {
    this.disposed = true; this.cancel(); this.stopPolling();
    document.removeEventListener('visibilitychange', this.visibility);
    this.game = null; this.listeners.clear();
  }
}
