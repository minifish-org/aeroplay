import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveConfig } from "vite";

const origin = "https://games.example";
const moduleURL = `${origin}/assets/game.js`;
const entries = [
  {
    request: new Request(`${origin}/`),
    response: new Response('<div id="app">Cached shell</div>'),
  },
  {
    request: new Request(moduleURL),
    response: new Response("export const ready = true;", {
      headers: { Vary: "Origin", "Content-Type": "text/javascript" },
    }),
  },
];
const lookups = [];
// Model the Cache API's documented Vary matching; execute the real worker handler below.
const cache = {
  async match(query, options = {}) {
    const request =
      typeof query === "string" ? new Request(new URL(query, origin)) : query;
    lookups.push({ url: request.url, options });
    const entry = entries.find((item) => item.request.url === request.url);
    if (!entry) return undefined;
    const vary = entry.response.headers.get("Vary");
    if (vary && !options.ignoreVary) {
      for (const header of vary.split(",").map((value) => value.trim())) {
        if (
          header === "*" ||
          entry.request.headers.get(header) !== request.headers.get(header)
        )
          return undefined;
      }
    }
    return entry.response.clone();
  },
};
const moduleRequest = new Request(moduleURL, { headers: { Origin: origin } });
assert.equal(
  await cache.match(moduleRequest),
  undefined,
  "Default Vary matching must reproduce the precache miss",
);
assert(
  await cache.match(moduleRequest, { ignoreVary: true }),
  "Static module must remain available despite Origin difference",
);

const handlers = new Map();
let networkRequests = 0;
let networkAvailable = false;
const source = readFileSync(
  new URL("../public/service-worker.js", import.meta.url),
  "utf8",
)
  .replace("__VERSION__", "test")
  .replace("__PRECACHE__", JSON.stringify(["/", "/assets/game.js"]));
vm.runInNewContext(source, {
  self: {
    location: { origin },
    addEventListener: (name, handler) => handlers.set(name, handler),
  },
  caches: { open: async () => cache },
  URL,
  fetch: async () => {
    networkRequests++;
    if (!networkAvailable) throw new Error("Network is unavailable");
    return new Response("Network response");
  },
});
async function fetchThroughWorker(request) {
  let response;
  let intercepted = false;
  handlers.get("fetch")({
    request,
    respondWith: (pending) => {
      intercepted = true;
      response = pending;
    },
  });
  return { intercepted, response: await response };
}
const offlineModule = await fetchThroughWorker(moduleRequest);
assert(offlineModule.intercepted);
assert.equal(await offlineModule.response.text(), "export const ready = true;");
assert.equal(
  networkRequests,
  0,
  "Offline module response must not contact the server",
);

// Canonical shell lookup avoids an /index.html response redirected by Pages.
const navigation = await fetchThroughWorker({
  url: `${origin}/index.html`,
  method: "GET",
  mode: "navigate",
});
assert.equal(
  await navigation.response.text(),
  '<div id="app">Cached shell</div>',
);
assert.equal(lookups.at(-1).url, `${origin}/`);
assert.equal(networkRequests, 0);
assert.equal(
  (
    await fetchThroughWorker(
      new Request(`${origin}/decision`, { method: "POST" }),
    )
  ).intercepted,
  false,
);
assert.equal(
  (await fetchThroughWorker(new Request("https://laya.example/health")))
    .intercepted,
  false,
);

networkAvailable = true;
const uncached = await fetchThroughWorker(new Request(`${origin}/uncached.js`));
assert.equal(await uncached.response.text(), "Network response");
assert.equal(
  networkRequests,
  1,
  "Uncached requests retain their network fallback",
);
console.log(
  "Offline cache checks passed: Vary regression, module cache hit, canonical navigation, request boundaries, network fallback.",
);

// Exercise the actual build hook with unchanged bundle paths and asset-only updates.
const originalDirectory = process.cwd();
const config = await resolveConfig(
  { configFile: resolve("vite.config.ts") },
  "build",
);
const plugin = config.plugins.find((item) => item.name === "offline-precache");
const template = readFileSync("public/service-worker.js", "utf8");
const fixture = await mkdtemp(join(tmpdir(), "aeroplay-precache-"));
try {
  await mkdir(join(fixture, "public"));
  await mkdir(join(fixture, "dist"));
  await writeFile(join(fixture, "public", "service-worker.js"), template);
  process.chdir(fixture);
  const bundle = {
    "index.html": { type: "asset", source: "<html>Initial page</html>" },
    "assets/game-same-hash.js": {},
  };
  const options = { dir: join(fixture, "dist") };
  const generate = async () => {
    await plugin.writeBundle(options, bundle);
    return readFile("dist/service-worker.js", "utf8");
  };
  await writeFile("public/character.svg", '<svg><circle r="10"/></svg>');
  const initial = await generate();
  await writeFile("public/character.svg", '<svg><circle r="20"/></svg>');
  const artworkUpdate = await generate();
  assert.notEqual(
    initial,
    artworkUpdate,
    "Artwork-only changes must invalidate precaching",
  );
  assert.equal(
    await generate(),
    artworkUpdate,
    "Identical content must retain its cache version",
  );
  bundle["index.html"].source = "<html>Updated page policy</html>";
  assert.notEqual(
    await generate(),
    artworkUpdate,
    "HTML-only changes must invalidate the cached navigation",
  );
  console.log(
    "Offline build checks passed: artwork-only and HTML-only updates invalidate the cache; identical content keeps its version.",
  );
} finally {
  process.chdir(originalDirectory);
  await rm(fixture, { recursive: true, force: true });
}
