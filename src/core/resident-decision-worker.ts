import type { DecisionObservation } from "./decision-model";
import type { LocalDecisionResult, LocalModelInfo } from "./decision-model";

export function serveDecisions(
  prepare: () => Promise<LocalModelInfo>,
  decide: (observation: DecisionObservation) => Promise<LocalDecisionResult>,
) {
  let queue = Promise.resolve();
  const jobs = new Set<number>(),
    cancelled = new Set<number>();
  self.onmessage = ({
    data,
  }: MessageEvent<{
    id: number;
    type: "cancel" | "init" | "decide";
    observation: DecisionObservation;
  }>) => {
    // JavaScript kernels cannot process cancellation while computing. Ignore a
    // cancellation arriving after completion so its ID cannot accumulate.
    if (data.type === "cancel") {
      if (jobs.has(data.id)) cancelled.add(data.id);
      return;
    }
    jobs.add(data.id);
    queue = queue.then(async () => {
      try {
        if (cancelled.has(data.id)) throw new Error("Cancelled");
        const result =
          data.type === "init"
            ? await prepare()
            : await decide(data.observation);
        self.postMessage({ id: data.id, result });
      } catch (error) {
        self.postMessage({
          id: data.id,
          error:
            error instanceof Error ? error.message : "Local inference failed.",
        });
      } finally {
        jobs.delete(data.id);
        cancelled.delete(data.id);
      }
    });
  };
}
