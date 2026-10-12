import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Development/build time only. The browser never downloads from the model Hub.
const repository = "Tamkimd/tamev-nano-tinybert";
const revision = "ad15b45f35526070d48fb91f6597d2805a2d80af";
const directory = fileURLToPath(
  new URL("../public/models/tamev-nano/", import.meta.url),
);
const files = {
  "model_int8.onnx":
    "a83a4604a803df9efed89ed2e419184c2a1de995174ae6e8b3682de985c47484",
  "tokenizer.json":
    "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66",
  "tokenizer_config.json":
    "9f0c2c65a70ea18113ffa2e717103e7210ea826e7acc3442b69b346686b55a48",
  "config.json":
    "05fb476ed9eda56e1de767c33b067e70ed5b5c66d42437b1b8d3c3cdfe4c2307",
  LICENSE: "492278da15fd252fd20f4a369c32d67f1bcc0eddd1c7f2da72c7fa562dd90791",
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function prepare(repository, revision, directory, files) {
  await mkdir(directory, { recursive: true });
  for (const [file, expected] of Object.entries(files)) {
    const target = `${directory}${file}`;
    const current = await readFile(target).catch(() => null);
    if (current && hash(current) === expected) {
      console.log(`Verified ${file}`);
      continue;
    }
    const response = await fetch(
      `https://huggingface.co/${repository}/resolve/${revision}/${file}`,
      { signal: AbortSignal.timeout(120000) },
    );
    if (!response.ok)
      throw new Error(`Download failed for ${file}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== expected)
      throw new Error(`Checksum failed for ${file}`);
    const temporary = `${target}.partial`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    console.log(`Prepared ${file} (${bytes.length} bytes)`);
  }
}
await prepare(repository, revision, directory, files);
