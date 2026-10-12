import { ResidentDecisionClient } from "./resident-decision-client";
import type { DecisionObservation } from "./decision-model";

const client = new ResidentDecisionClient(
  () =>
    new Worker(new URL("./local-decision.worker.ts", import.meta.url), {
      type: "module",
    }),
);
export const prepareLocalDecision = (signal?: AbortSignal) =>
  client.prepare(signal);
export const requestLocalDecision = (
  observation: DecisionObservation,
  signal: AbortSignal,
) => client.request(observation, signal);
export const getLocalDecisionDiagnostics = () => client.diagnostics();
