import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import runtimeUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import type { DecisionObservation, LocalDecisionResult, LocalModelInfo } from './player';
const LOCAL_MODEL = {
  name: 'TAMEV-Nano INT8', directory: '/models/tamev-nano/', modelBytes: 14872474,
  modelHash: 'a83a4604a803df9efed89ed2e419184c2a1de995174ae6e8b3682de985c47484',
};
// The dedicated worker stays alive across game navigation. No CDN, remote model
// fallback, cross-origin isolation or main-thread inference is required.
ort.env.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.origin).href,
  mjs: new URL(runtimeUrl, self.location.origin).href,
};
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
interface ModelConfig {
  max_state_len: number;
  max_opt_len: number;
  calibration_by_k: Record<string, number>;
  option_fusion: string;
}
type Runtime = {
  session: ort.InferenceSession;
  tokenizer: Tokenizer;
  config: ModelConfig;
  info: LocalModelInfo;
};
let loading: Promise<Runtime> | null = null;
let initializations = 0;
async function localFile(file: string) {
  const response = await fetch(`${LOCAL_MODEL.directory}${file}`, {
    credentials: "omit",
    redirect: "error",
    // Cache Storage still serves offline files. Avoid competing HTTP-cache
    // writes when first inference and service-worker installation fetch together.
    cache: "no-store",
  });
  if (!response.ok ||
    response.headers.get("content-type")?.includes("text/html"))
    throw new Error("Local model files are missing. Use a build with the offline model included.");
  return response;
}
function loadModel(): Promise<Runtime> {
  if (loading)
    return loading;
  loading = (async (): Promise<Runtime> => {
    const started = performance.now();
    const [model, tokenizerJson, tokenizerConfig, config] = await Promise.all([
      localFile("model_int8.onnx").then((r) => r.arrayBuffer()),
      localFile("tokenizer.json").then((r) => r.json()),
      localFile("tokenizer_config.json").then((r) => r.json()),
      localFile("config.json").then((r) => r.json() as Promise<ModelConfig>),
    ]);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", model)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (model.byteLength !== LOCAL_MODEL.modelBytes ||
      digest !== LOCAL_MODEL.modelHash)
      throw new Error("Local model checksum failed. Install the pinned model files again.");
    if (config.max_state_len !== 128 ||
      config.max_opt_len !== 48 ||
      config.option_fusion !== "cross")
      throw new Error("Local model configuration does not match this adapter.");
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    if (session.inputNames.join(",") !==
      "ctx_input_ids,ctx_attention_mask,opt_input_ids,opt_attention_mask" ||
      !session.outputNames.includes("probs")) {
      await session.release();
      throw new Error("Local model graph does not match the Decision API.");
    }
    ++initializations;
    return {
      session,
      tokenizer: new Tokenizer(tokenizerJson, tokenizerConfig),
      config,
      info: {
        model: LOCAL_MODEL.name,
        backend: "wasm",
        threads: 1,
        loadMs: performance.now() - started,
        initializations,
        modelBytes: model.byteLength,
      },
    };
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
function tensor(rows: number[][], option = false) {
  const width = Math.max(...rows.map((row) => row.length));
  const ids = new BigInt64Array(rows.length * width);
  const mask = new BigInt64Array(ids.length);
  rows.forEach((row, i) => row.forEach((id, j) => {
    ids[i * width + j] = BigInt(id);
    mask[i * width + j] = 1n;
  }));
  const dims = option ? [1, rows.length, width] : [1, width];
  return {
    ids: new ort.Tensor("int64", ids, dims),
    mask: new ort.Tensor("int64", mask, dims),
  };
}
async function decide(observation: DecisionObservation): Promise<LocalDecisionResult> {
  const started = performance.now();
  const { session, tokenizer, config } = await loadModel();
  const entries = Object.entries(observation.choices);
  if (entries.length < 1 ||
    entries.length > 16 ||
    observation.context.length > 6000 ||
    observation.question.length > 600 ||
    entries.some(([key, value]) => !key || key.length > 64 || !value || value.length > 400))
    throw new Error("This observation exceeds the Decision API limits.");
  // Match the published helper's context/option encoding and cross-fusion. Reject
  // over-budget observations instead of silently losing the question or choices.
  const context = tokenizer.encode(`${observation.context}\n${observation.question}`.trim()).ids;
  const options = entries.map(([, text]) => tokenizer.encode(text).ids);
  if (context.length > config.max_state_len ||
    options.some((ids) => ids.length > config.max_opt_len))
    throw new Error(`Local model token budget exceeded (${context.length}/${config.max_state_len} state tokens; ${Math.max(...options.map((ids) => ids.length))}/${config.max_opt_len} option tokens). Take over to continue.`);
  const ctx = tensor([context]);
  const opt = tensor(options, true);
  const feeds = {
    ctx_input_ids: ctx.ids,
    ctx_attention_mask: ctx.mask,
    opt_input_ids: opt.ids,
    opt_attention_mask: opt.mask,
  };
  let outputs: ort.InferenceSession.ReturnType | undefined;
  try {
    const before = performance.now();
    outputs = await session.run(feeds);
    const inferenceMs = performance.now() - before;
    const raw = Array.from(outputs.probs.data as Float32Array, Number);
    if (raw.length !== entries.length ||
      raw.some((p) => !Number.isFinite(p) || p < 0) ||
      raw.reduce((a, b) => a + b, 0) <= 0)
      throw new Error("Local model returned invalid probabilities.");
    const delta = config.calibration_by_k[String(entries.length)] ?? 1;
    const calibrated = raw.map((p) => Math.max(p, 1e-12) ** delta);
    const sum = calibrated.reduce((a, b) => a + b, 0);
    const probabilities = calibrated.map((p) => p / sum);
    const best = probabilities.indexOf(Math.max(...probabilities));
    return {
      choice: entries[best][0],
      probabilities,
      inferenceMs,
      totalMs: performance.now() - started,
      contextTokens: context.length,
      optionTokens: options.map((ids) => ids.length),
    };
  }
  finally {
    Object.values(feeds).forEach((value) => value.dispose());
    if (outputs)
      Object.values(outputs).forEach((value) => value.dispose());
  }
}
let queue = Promise.resolve();
const jobs = new Set<number>(), cancelled = new Set<number>();
self.onmessage = ({ data }: MessageEvent<{
  id: number;
  type: 'cancel' | 'init' | 'decide';
  observation: DecisionObservation;
}>) => {
  if (data.type === 'cancel') {
    if (jobs.has(data.id))
      cancelled.add(data.id);
    return;
  }
  jobs.add(data.id);
  queue = queue.then(async () => {
    try {
      if (cancelled.has(data.id))
        throw new Error('Cancelled');
      const result = data.type === 'init' ? (await loadModel()).info : await decide(data.observation);
      self.postMessage({ id: data.id, result });
    }
    catch (error) {
      self.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Local inference failed.' });
    }
    finally {
      jobs.delete(data.id);
      cancelled.delete(data.id);
    }
  });
};
