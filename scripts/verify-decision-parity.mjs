import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Tokenizer } from "@huggingface/tokenizers";

// Optional native reference, kept out of the frontend's dependencies. Install
// onnxruntime-node@1.30.0 separately and provide its entry as ORT_NODE_MODULE.
const ort = await import(
  process.env.ORT_NODE_MODULE
    ? pathToFileURL(process.env.ORT_NODE_MODULE).href
    : "onnxruntime-node"
);
const directory = "public/models/tamev-nano/";
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const tokenizer = new Tokenizer(
  await readJson(`${directory}tokenizer.json`),
  await readJson(`${directory}tokenizer_config.json`),
);
const config = await readJson(`${directory}config.json`);
const corpus = (await readJson("output/decision/corpus.json")).samples;
const browser = (await readJson("output/decision/benchmark-chromium.json"))
  .localRows;
// Extended/all native CPU optimization changed choices in this corpus. Basic
// agrees with the deployed WASM choices; probability drift is measured separately.
const session = await ort.InferenceSession.create(
  `${directory}model_int8.onnx`,
  { intraOpNumThreads: 1, graphOptimizationLevel: "basic" },
);
const tensor = (rows, option = false) => {
  const width = Math.max(...rows.map((row) => row.length));
  const ids = new BigInt64Array(rows.length * width),
    mask = new BigInt64Array(ids.length);
  rows.forEach((row, i) =>
    row.forEach((v, j) => {
      ids[i * width + j] = BigInt(v);
      mask[i * width + j] = 1n;
    }),
  );
  const dims = option ? [1, rows.length, width] : [1, width];
  return [
    new ort.Tensor("int64", ids, dims),
    new ort.Tensor("int64", mask, dims),
  ];
};
let matches = 0,
  count = 0,
  maxProbabilityDrift = 0;
try {
  for (const row of browser.filter((row) => row.repeat === 0 && !row.error)) {
    const o = corpus.find((sample) => sample.id === row.id).observation;
    const [ctx, ctxMask] = tensor([
      tokenizer.encode(`${o.context}\n${o.question}`.trim()).ids,
    ]);
    const [options, optionsMask] = tensor(
      Object.values(o.choices).map((text) => tokenizer.encode(text).ids),
      true,
    );
    const feeds = {
      ctx_input_ids: ctx,
      ctx_attention_mask: ctxMask,
      opt_input_ids: options,
      opt_attention_mask: optionsMask,
    };
    const out = await session.run(feeds);
    const raw = Array.from(
      out.probs.data,
      (p) =>
        Math.max(p, 1e-12) **
        (config.calibration_by_k[Object.keys(o.choices).length] ?? 1),
    );
    const sum = raw.reduce((a, b) => a + b, 0),
      probabilities = raw.map((p) => p / sum);
    const choice = Object.keys(o.choices)[
      probabilities.indexOf(Math.max(...probabilities))
    ];
    matches += Number(choice === row.choice);
    count++;
    maxProbabilityDrift = Math.max(
      maxProbabilityDrift,
      ...probabilities.map((p, i) => Math.abs(p - row.probabilities[i])),
    );
    Object.values(feeds).forEach((t) => t.dispose());
    Object.values(out).forEach((t) => t.dispose());
  }
  const result = {
    count,
    matches,
    maxProbabilityDrift,
    probabilityParity: false,
    artifact: "model_int8.onnx",
    runtime: "ONNX Runtime 1.30.0",
    nativeGraphOptimization: "basic",
  };
  await writeFile(
    "output/decision/parity.json",
    JSON.stringify(result, null, 2),
  );
  assert.equal(matches, count);
  console.log(
    `PASS ${count} WASM/native choices. Probabilities are not identical: maximum drift ${maxProbabilityDrift}.`,
  );
} finally {
  await session.release();
}
