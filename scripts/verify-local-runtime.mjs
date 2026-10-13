import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const base = process.env.TEST_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/#hub`);
  await page.waitForSelector(".hub-card");
  const result = await page.evaluate(async () => {
    const model = await import("/src/core/local-decision.ts");
    const [first, second] = await Promise.all([
      model.prepareLocalDecision(),
      model.prepareLocalDecision(),
    ]);
    const o = {
      key: "probe",
      context:
        "The golden ring is in the right lane. The middle lane has a barrier.",
      question: "Which lane contains the golden ring?",
      choices: { left: "left", middle: "middle", right: "right" },
    };
    const errorOf = async (operation) => {
      try {
        await operation();
        return "";
      } catch (error) {
        return error.name + ": " + error.message;
      }
    };
    const original = await model.requestLocalDecision(
      o,
      new AbortController().signal,
    );
    const reordered = await model.requestLocalDecision(
      { ...o, choices: { right: "right", left: "left", middle: "middle" } },
      new AbortController().signal,
    );
    const overBudget = await errorOf(() =>
      model.requestLocalDecision(
        { ...o, context: "word ".repeat(150) },
        new AbortController().signal,
      ),
    );
    const singleOption = await errorOf(() =>
      model.requestLocalDecision(
        { ...o, choices: { right: "right" } },
        new AbortController().signal,
      ),
    );
    const questionBudget = await errorOf(() =>
      model.requestLocalDecision(
        {
          ...o,
          choices: Object.fromEntries(
            Array.from({ length: 16 }, (_, i) => [
              String(i),
              "word ".repeat(20),
            ]),
          ),
        },
        new AbortController().signal,
      ),
    );
    const cancelled = new AbortController();
    cancelled.abort();
    const preAborted = await errorOf(() =>
      model.requestLocalDecision(o, cancelled.signal),
    );
    const inFlight = new AbortController();
    const aborted = errorOf(() =>
      model.requestLocalDecision(o, inFlight.signal),
    );
    inFlight.abort();
    const next = model.requestLocalDecision(o, new AbortController().signal);
    const busy = await errorOf(() =>
      model.requestLocalDecision(o, new AbortController().signal),
    );
    await next;
    return {
      first,
      second,
      original,
      reordered,
      overBudget,
      singleOption,
      questionBudget,
      preAborted,
      aborted: await aborted,
      busy,
      diagnostics: model.getLocalDecisionDiagnostics(),
    };
  });
  assert.equal(result.first.initializations, 1);
  assert.equal(result.second.initializations, 1);
  assert.equal(
    result.original.choice,
    ["left", "middle", "right"][
      result.original.probabilities.indexOf(
        Math.max(...result.original.probabilities),
      )
    ],
  );
  assert.equal(
    result.reordered.choice,
    ["right", "left", "middle"][
      result.reordered.probabilities.indexOf(
        Math.max(...result.reordered.probabilities),
      )
    ],
  );
  assert.match(result.overBudget, /token budget exceeded/);
  assert.match(result.preAborted, /AbortError/);
  assert.match(result.aborted, /AbortError/);
  assert.match(result.busy, /busy/);
  assert.equal(result.diagnostics.pending, 0);
  assert.equal(result.diagnostics.info.initializations, 1);
  console.log(
    "PASS TAMEV: singleton loading, option-key mapping, strict input budgets, cancellation and bounded queue",
  );
} finally {
  await browser.close();
}
