import type { FlightPipe } from '../games/flappy/model';
import type { CargoBoard, CargoState } from '../games/cargo/model';
import type { Action, Body, Observation, Side } from '../games/pushball/model';
export type Point = {
  x: number;
  y: number;
};
type Base = {
  epoch: string;
};
export type PlanningState = Base & ({
  game: 'flappy';
  time: number;
  y: number;
  velocity: number;
  pipes: FlightPipe[];
  passed: number;
} | {
  game: 'cargo';
  board: CargoBoard;
  state: CargoState;
} | {
  game: 'lightsout';
  board: number[];
} | {
  game: 'sudoku';
  board: number[];
  givens: number[];
  selected: number | null;
  notes: boolean;
} | {
  game: '2048';
  board: number[][];
} | {
  game: 'match3';
  board: number[][];
  selected: Point | null;
} | {
  game: 'sky';
  row: number;
  lane: number;
  target: number;
  obstacles: number[];
} | {
  game: 'pushball';
  side: Side;
  snapshot: Observation;
  control: Action;
  controlUntil: number;
});
export type PlannedInput = {
  input: unknown;
  expected: string;
  at?: number;
  until?: number;
  y?: number;
  velocity?: number;
  pushball?: {
    robot: Body;
    ball: Body;
    opponent: Body;
  };
};
export type InputPlan = {
  label: string;
  steps: PlannedInput[];
};
export function planningSignature(state: PlanningState): string {
  const prefix = `${state.game}:${state.epoch}:`;
  switch (state.game) {
    case 'flappy': return prefix;
    case 'pushball': return prefix + state.side;
    case 'cargo': return prefix + JSON.stringify(state.state);
    case 'sudoku': return prefix + JSON.stringify([state.board, state.selected, state.notes]);
    case 'match3': return prefix + JSON.stringify([state.board, state.selected]);
    case 'sky': return prefix + `${state.row}:${state.lane}`;
    default: return prefix + JSON.stringify(state.board);
  }
}
export function inspectPlannedInput(state: PlanningState, step: PlannedInput): 'ready' | 'wait' | 'invalid' {
  if (!step.expected.startsWith(`${state.game}:${state.epoch}:`))
    return 'invalid';
  if (planningSignature(state) !== step.expected)
    return 'invalid';
  if (state.game === 'pushball') {
    const guard = step.pushball;
    if (!guard || step.at === undefined || step.until === undefined)
      return 'invalid';
    const time = state.snapshot.elapsed;
    if (time > step.until)
      return 'invalid';
    if (time < step.at)
      return 'wait';
    const elapsed = time - step.at;
    const diverged = (actual: Body, expected: Body, tolerance: number) => Math.hypot(actual.x - expected.x - expected.vx * elapsed, actual.y - expected.y - expected.vy * elapsed) > tolerance;
    if (diverged(state.snapshot.robots[state.side], guard.robot, 0.9)
      || diverged(state.snapshot.ball, guard.ball, 1.2)
      || diverged(state.snapshot.robots[state.side === 0 ? 1 : 0], guard.opponent, 1.4))
      return 'invalid';
  }
  if (state.game === 'flappy' && step.at !== undefined) {
    if (state.time < step.at)
      return 'wait';
    if (state.time > (step.until ?? step.at + 0.1))
      return 'invalid';
    const elapsed = state.time - step.at;
    const expectedY = step.y! + step.velocity! * elapsed + 325 * elapsed * elapsed;
    if (Math.abs(state.y - expectedY) > 10 || Math.abs(state.velocity - (step.velocity! + 650 * elapsed)) > 55)
      return 'invalid';
  }
  return 'ready';
}
export const LOCAL_MODEL = {
  name: 'TAMEV-Nano INT8', repository: 'Tamkimd/tamev-nano-tinybert',
  revision: 'ad15b45f35526070d48fb91f6597d2805a2d80af',
  directory: '/models/tamev-nano/', modelBytes: 14872474,
  modelHash: 'a83a4604a803df9efed89ed2e419184c2a1de995174ae6e8b3682de985c47484',
  games: ['2048', 'lightsout', 'flappy', 'sudoku', 'match3', 'cargo', 'sky', 'pushball'],
} as const;
export interface DecisionObservation {
  key: string;
  context: string;
  question: string;
  choices: Record<string, string>;
}
export interface LocalDecisionResult {
  choice: string;
  probabilities: number[];
  inferenceMs: number;
  totalMs: number;
  contextTokens: number;
  optionTokens: number[];
}
export interface LocalModelInfo {
  model: string;
  backend: 'wasm';
  threads: 1;
  loadMs: number;
  initializations: number;
  modelBytes: number;
}
type Pending = {
  resolve: (value: LocalDecisionResult | LocalModelInfo) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
export class ResidentDecisionClient {
  private worker: Worker | null = null;
  private sequence = 0;
  private info: LocalModelInfo | null = null;
  private lastDecision: LocalDecisionResult | null = null;
  private pending = new Map<number, Pending>();
  constructor(private createWorker: () => Worker) { }
  private reset(error: Error) {
    this.worker?.terminate();
    this.worker = null;
    this.info = null;
    for (const job of this.pending.values()) {
      job.cleanup();
      job.reject(error);
    }
    this.pending.clear();
  }
  private getWorker() {
    if (this.worker)
      return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    worker.onmessage = ({ data, }: MessageEvent<{
      id: number;
      result?: LocalDecisionResult | LocalModelInfo;
      error?: string;
    }>) => {
      const job = this.pending.get(data.id);
      if (!job)
        return;
      this.pending.delete(data.id);
      job.cleanup();
      if (data.error || !data.result)
        job.reject(new Error(data.error ?? "Local model returned no result."));
      else
        job.resolve(data.result);
    };
    worker.onerror = () => this.reset(new Error("The local model worker stopped. Load the model again."));
    worker.onmessageerror = () => this.reset(new Error("The local model worker returned an unreadable result."));
    return worker;
  }
  private call(type: "init" | "decide", observation?: DecisionObservation, signal?: AbortSignal) {
    if (signal?.aborted)
      return Promise.reject(new DOMException("Cancelled", "AbortError"));
    // Include cancelled kernels until their worker response arrives. Each model
    // has one running job and at most one successor, even across navigation.
    if (this.pending.size >= 2)
      return Promise.reject(new Error("The local model is busy. Try again shortly."));
    const target = this.getWorker(), id = ++this.sequence;
    return new Promise<LocalDecisionResult | LocalModelInfo>((resolve, reject) => {
      const abort = () => {
        target.postMessage({ type: "cancel", id });
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const timer = window.setTimeout(() => this.reset(new Error("The local model timed out. Load it again.")), type === "init" ? 120000 : 10000);
      this.pending.set(id, {
        resolve,
        reject,
        cleanup: () => {
          window.clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        },
      });
      signal?.addEventListener("abort", abort, { once: true });
      target.postMessage({ type, id, observation });
    });
  }
  async prepare(signal?: AbortSignal): Promise<LocalModelInfo> {
    if (signal?.aborted)
      throw new DOMException("Cancelled", "AbortError");
    if (this.info)
      return this.info;
    this.info = (await this.call("init", undefined, signal)) as LocalModelInfo;
    return this.info;
  }
  async request(observation: DecisionObservation, signal: AbortSignal) {
    const started = performance.now();
    const result = (await this.call("decide", observation, signal)) as LocalDecisionResult;
    if (signal.aborted)
      throw new DOMException("Cancelled", "AbortError");
    if (!Object.hasOwn(observation.choices, result.choice))
      throw new Error("The local model returned an unavailable move.");
    this.lastDecision = { ...result, totalMs: performance.now() - started };
    return this.lastDecision;
  }
  diagnostics() {
    return {
      info: this.info,
      lastDecision: this.lastDecision,
      pending: this.pending.size,
    };
  }
}
class AIPlanner {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending: {
    id: number;
    reject: (error: Error) => void;
    cleanup: () => void;
  } | null = null;
  request(state: PlanningState, ahead: PlannedInput[], signal: AbortSignal, mode: 'plan' | 'hint' = 'plan'): Promise<InputPlan[]> {
    if (signal.aborted)
      return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    if (this.pending)
      return Promise.reject(new Error('The planner is busy.'));
    const worker = this.worker ??= new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const abort = () => this.dispose();
      const timer = window.setTimeout(() => this.dispose(new Error('Planning timed out.')), 4000);
      const cleanup = () => { window.clearTimeout(timer); signal.removeEventListener('abort', abort); };
      this.pending = { id, reject, cleanup };
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<{
        id: number;
        plans?: InputPlan[];
        error?: string;
      }>) => {
        if (this.pending?.id !== data.id)
          return;
        cleanup();
        this.pending = null;
        if (data.error || !data.plans)
          reject(new Error(data.error ?? 'No plans returned.'));
        else
          resolve(data.plans);
      };
      worker.onerror = () => this.dispose(new Error('The planning worker stopped.'));
      worker.onmessageerror = () => this.dispose(new Error('The planning worker returned unreadable data.'));
      worker.postMessage({ id, state, ahead, mode });
    });
  }
  dispose(error: Error = new DOMException('Cancelled', 'AbortError')) {
    this.worker?.terminate();
    this.worker = null;
    this.pending?.cleanup();
    this.pending?.reject(error);
    this.pending = null;
  }
}
/** Human hints run visible-state planning without loading or consulting TAMEV. */
export async function getHint(state: PlanningState, signal: AbortSignal): Promise<InputPlan | null> {
  const planner = new AIPlanner();
  try {
    return (await planner.request(structuredClone(state), [], signal, 'hint'))[0] ?? null;
  }
  finally {
    planner.dispose();
  }
}
const resident = new ResidentDecisionClient(() => new Worker(new URL('./tamev.ts', import.meta.url), { type: 'module' }));
export const prepareLocalDecision = (signal?: AbortSignal) => resident.prepare(signal);
export const requestLocalDecision = (observation: DecisionObservation, signal: AbortSignal) => resident.request(observation, signal);
export const getLocalDecisionDiagnostics = () => resident.diagnostics();
type ModelState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
};
let modelState: ModelState = { status: 'idle', message: 'Watch TAMEV to load the local player.' };
let loading: Promise<LocalModelInfo> | null = null;
const modelListeners = new Set<() => void>();
export const getAIModelState = () => modelState;
export function subscribeAIModel(listener: () => void) { modelListeners.add(listener); return () => { modelListeners.delete(listener); }; }
function publishModel(next: ModelState) { modelState = next; modelListeners.forEach(listener => listener()); }
export function prepareTamev() {
  if (loading && (modelState.status === 'loading' || resident.diagnostics().info))
    return loading;
  publishModel({ status: 'loading', message: 'Loading TAMEV on this device…' });
  loading = resident.prepare().then(info => { publishModel({ status: 'ready', message: 'TAMEV ready · Offline' }); return info; })
    .catch(error => { loading = null; publishModel({ status: 'error', message: error instanceof Error ? error.message : 'TAMEV could not load.' }); throw error; });
  return loading;
}
type PlayerDecision = DecisionObservation & {
  planning?: PlanningState;
  ahead?: PlannedInput[];
};
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
  /** Release held native controls when a plan is cancelled. */
  clearInput?: () => void;
  onPlanSelected?: (plan: InputPlan) => void;
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
    if (observation.planning) {
      const plans = await this.planner.request(observation.planning, observation.ahead ?? [], signal);
      if (!plans.length)
        throw new Error('No safe plan was found. The game keeps running; take over or retry.');
      const result = await requestLocalDecision({
        key: observation.key,
        context: observation.planning.game === 'pushball' ? observation.context
          : `${observation.planning.game}. Plans were calculated from visible state. Every control obeys the normal rules and speed.`,
        question: observation.planning.game === 'pushball'
          ? 'Which plan best scores in the opponent goal or prevents conceding? Prefer low own-goal risk and reaching the ball.'
          : 'Which plan achieves the goal safely with fewer controls and better outcomes?',
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
    if (document.hidden) {
      this.cancel();
      this.lastKey = '';
    }
  };
  status: PlayerStatus = 'idle';
  error = '';
  decisions = 0;
  discarded = 0;
  hasUsedAI: boolean;
  constructor(private controller: PlayerController = new HumanPlayer(), private readonly claimAIRecords = () => { }) {
    this.hasUsedAI = controller.type === 'ai';
  }
  get type() { return this.controller.type; }
  get thinking() { return this.pending !== null; }
  observe() { return this.game?.observe() ?? null; }
  diagnostics() {
    return { type: this.type, status: this.status, thinking: this.thinking, error: this.error,
      decisions: this.decisions, discarded: this.discarded, hasUsedAI: this.hasUsedAI,
      plan: this.plan.length, nextPlan: this.nextPlan.length, pending: Number(this.thinking) };
  }
  submitHumanInput(input: unknown) {
    return this.type === 'human' && this.deliver(this.controller, input);
  }
  private deliver(controller: PlayerController, input: unknown) {
    return !this.disposed && controller === this.controller && !!this.game && this.game.apply(input);
  }
  connect<Input>(game: PlayerGame<Input>) {
    if (this.disposed)
      throw new Error('A disposed player cannot control a game.');
    if (this.game)
      throw new Error('A player can control only one mounted game.');
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
    ++this.generation;
    this.pending?.abort();
    this.pending = null;
    this.controller.cancel?.();
    this.plan = [];
    this.nextPlan = [];
    this.nextInputAt = 0;
    this.game?.clearInput?.();
  }
  private startPolling() {
    if (this.type === 'ai' && !this.timer)
      this.timer = window.setInterval(() => { void this.tick(); }, 16);
  }
  private stopPolling() { window.clearInterval(this.timer); this.timer = 0; }
  start() {
    if (!this.game || this.disposed)
      return;
    this.cancel();
    this.lastKey = '';
    this.error = '';
    this.status = 'playing';
    this.game.start();
    this.startPolling();
    this.publish();
    void this.tick();
  }
  watchAI() {
    this.cancel();
    this.controller = new TamevPlayer();
    this.hasUsedAI = true;
    this.claimAIRecords();
    this.start();
  }
  pause() {
    if (!this.game || this.status === 'finished')
      return;
    this.cancel();
    this.stopPolling();
    this.game.pause();
    this.status = 'paused';
    this.publish();
  }
  resume() {
    if (!this.game || this.status === 'finished')
      return;
    this.cancel();
    this.lastKey = '';
    this.error = '';
    this.game.resume();
    this.status = 'playing';
    this.startPolling();
    this.publish();
    void this.tick();
  }
  takeOver() {
    this.cancel();
    this.stopPolling();
    this.controller = new HumanPlayer();
    this.error = '';
    this.status = 'idle';
    this.game?.resume();
    this.publish();
  }
  retry() {
    this.lastKey = '';
    this.error = '';
    this.publish();
    void this.tick();
  }
  async tick() {
    const game = this.game;
    if (!game || this.disposed || this.type !== 'ai' || this.status !== 'playing')
      return;
    if (game.isFinished()) {
      this.cancel();
      this.stopPolling();
      this.status = 'finished';
      this.publish();
      return;
    }
    if (game.isPaused()) {
      this.cancel();
      this.stopPolling();
      this.status = 'paused';
      this.publish();
      return;
    }
    if (document.hidden)
      return;
    if (this.plan.length && (game.game === 'flappy' || Date.now() >= this.nextInputAt)) {
      const state = game.planning?.();
      if (state) {
        const valid = inspectPlannedInput(state, this.plan[0]);
        if (valid === 'invalid') {
          ++this.discarded;
          this.cancel();
          this.lastKey = '';
        }
        else if (valid === 'ready') {
          // One native input per poll, with ordinary inter-input pacing.
          if (this.deliver(this.controller, this.plan[0].input)) {
            ++this.decisions;
            this.plan.shift();
            this.nextInputAt = Date.now() + 80;
          }
          else {
            ++this.discarded;
            this.cancel();
            this.lastKey = '';
          }
        }
      }
    }
    if (!this.plan.length && this.nextPlan.length) {
      this.plan = this.nextPlan;
      this.nextPlan = [];
    }
    if (this.pending)
      return;
    const state = game.planning?.();
    const prefetch = state?.game === 'flappy' && this.plan.length > 0 && !this.nextPlan.length && (this.plan.at(-1)?.at ?? Infinity) - state.time <= 0.36;
    if (this.plan.length && !prefetch)
      return;
    const observation = this.observe();
    if (!observation || observation.key === this.lastKey)
      return;
    const controller = new AbortController(), generation = this.generation;
    this.pending = controller;
    this.lastKey = observation.key;
    try {
      const choice = await this.controller.choose({ ...observation, planning: state ? structuredClone(state) : undefined, ahead: prefetch ? [...this.plan] : [] }, controller.signal);
      if (this.disposed || controller.signal.aborted || generation !== this.generation)
        return;
      if (this.status !== 'playing' || document.hidden || game.isFinished() || game.isPaused()) {
        ++this.discarded;
        return;
      }
      if (choice && typeof choice !== 'string') {
        const current = game.planning?.();
        if (!current || !choice.steps.length || inspectPlannedInput(current, choice.steps[0]) === 'invalid') {
          ++this.discarded;
          return;
        }
        if (this.plan.length)
          this.nextPlan = choice.steps;
        else
          this.plan = choice.steps;
        game.onPlanSelected?.(choice);
        this.error = '';
        return;
      }
      if (!game.isCurrent(observation.key)) {
        ++this.discarded;
        return;
      }
      if (choice === null || !Object.hasOwn(observation.inputs, choice))
        throw new Error('The AI returned an unavailable input.');
      if (this.deliver(this.controller, observation.inputs[choice]))
        ++this.decisions;
      this.error = '';
    }
    catch (error) {
      if (!this.disposed && !controller.signal.aborted && generation === this.generation) {
        // Failed or slow inference supplies no input. The game keeps running.
        this.error = error instanceof Error ? error.message : 'The AI could not choose an input.';
      }
    }
    finally {
      if (this.pending === controller)
        this.pending = null;
      this.publish();
    }
  }
  dispose() {
    this.disposed = true;
    this.cancel();
    this.stopPolling();
    document.removeEventListener('visibilitychange', this.visibility);
    this.game = null;
    this.listeners.clear();
  }
}
