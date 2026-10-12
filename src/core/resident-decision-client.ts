import type { DecisionObservation } from "./decision-model";
import type { LocalDecisionResult, LocalModelInfo } from "./decision-model";

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

  constructor(private createWorker: () => Worker) {}

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
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      id: number;
      result?: LocalDecisionResult | LocalModelInfo;
      error?: string;
    }>) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      job.cleanup();
      if (data.error || !data.result)
        job.reject(new Error(data.error ?? "Local model returned no result."));
      else job.resolve(data.result);
    };
    worker.onerror = () =>
      this.reset(
        new Error("The local model worker stopped. Load the model again."),
      );
    worker.onmessageerror = () =>
      this.reset(
        new Error("The local model worker returned an unreadable result."),
      );
    return worker;
  }

  private call(
    type: "init" | "decide",
    observation?: DecisionObservation,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted)
      return Promise.reject(new DOMException("Cancelled", "AbortError"));
    // Include cancelled kernels until their worker response arrives. Each model
    // has one running job and at most one successor, even across navigation.
    if (this.pending.size >= 2)
      return Promise.reject(
        new Error("The local model is busy. Try again shortly."),
      );
    const target = this.getWorker(),
      id = ++this.sequence;
    return new Promise<LocalDecisionResult | LocalModelInfo>(
      (resolve, reject) => {
        const abort = () => {
          target.postMessage({ type: "cancel", id });
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const timer = window.setTimeout(
          () =>
            this.reset(new Error("The local model timed out. Load it again.")),
          type === "init" ? 120000 : 10000,
        );
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
      },
    );
  }

  async prepare(signal?: AbortSignal): Promise<LocalModelInfo> {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (this.info) return this.info;
    this.info = (await this.call("init", undefined, signal)) as LocalModelInfo;
    return this.info;
  }

  async request(observation: DecisionObservation, signal: AbortSignal) {
    const started = performance.now();
    const result = (await this.call(
      "decide",
      observation,
      signal,
    )) as LocalDecisionResult;
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
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
