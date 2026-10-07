import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import { preview } from "vite";

const isWebKit = process.env.TEST_BROWSER === "webkit";
const pagesRedirects = process.env.TEST_PAGES_REDIRECTS === "1";
const pagesPreview =
  pagesRedirects || isWebKit
    ? await preview({
        preview: { host: "127.0.0.1", port: 0, open: false },
        plugins: [
          {
            name: "pages-html-redirect",
            configurePreviewServer(server) {
              server.middlewares.use((request, response, next) => {
                if (
                  new URL(request.url, "http://localhost").pathname !==
                    "/index.html" ||
                  !pagesRedirects
                ) {
                  next();
                  return;
                }
                response.writeHead(308, { Location: "/" });
                response.end();
              });
            },
          },
        ],
      })
    : null;
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const browser = await (isWebKit ? webkit : chromium).launch({ headless: true });
const base = pagesPreview
  ? `http://127.0.0.1:${pagesPreview.httpServer.address().port}`
  : (process.env.TEST_URL ?? "http://127.0.0.1:4173");
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [],
  external = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (new URL(request.url()).origin !== new URL(base).origin)
    external.push(request.url());
});
try {
  await page.goto(base);
  await page.waitForFunction(() =>
    document
      .querySelector(".offline-badge")
      ?.textContent.includes("Offline ready"),
  );
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.reload();
  await page.waitForSelector(".hub-card");
  assert.equal(await page.locator(".hub-card").count(), 10);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await (
        await caches.open(names.find((n) => n.startsWith("aeroplay-")))
      ).keys()
    ).map((r) => new URL(r.url).pathname);
  });
  assert(cached.some((p) => p.endsWith(".js")));
  assert(cached.some((p) => p.endsWith(".css")));
  assert(cached.includes("/"));
  assert.equal(
    await page.evaluate(async () => {
      const response = await caches.match("/");
      return response.redirected;
    }),
    false,
  );
  if (isWebKit) {
    // Playwright WebKit's offline override rejects cached SW navigations internally.
    // Stopping this isolated server checks actual offline responses instead.
    await new Promise((resolve, reject) => {
      pagesPreview.httpServer.close((error) =>
        error ? reject(error) : resolve(),
      );
      pagesPreview.httpServer.closeAllConnections();
    });
  } else await context.setOffline(true);
  await page.reload();
  await page.waitForSelector(".hub-card");
  assert.equal(await page.locator(".hub-card").count(), 10);
  for (const id of [
    "sky",
    "cargo",
    "snake",
    "tetris",
    "2048",
    "flappy",
    "maze",
    "match3",
    "sudoku",
    "lightsout",
  ]) {
    await page.evaluate((id) => {
      location.hash = id;
    }, id);
    await page.waitForFunction(
      (id) =>
        window.render_game_to_text &&
        JSON.parse(window.render_game_to_text()).game === id,
      id,
    );
    assert(await page.locator(".game-area").isVisible());
  }
  await page.evaluate(() => {
    location.hash = "cargo";
  });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === "cargo",
  );
  await page.getByRole("button", { name: "Hint", exact: true }).tap();
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).hintDirection !== null,
  );
  assert.equal(
    await page.evaluate(
      () => JSON.parse(window.render_game_to_text()).hintDirection,
    ),
    "right",
  );
  assert(cached.some((p) => p.includes("solver.worker")));
  assert(
    cached.some((p) => /phaser-.*\.js/.test(p)),
    "Shared Phaser engine is precached",
  );
  assert(
    cached.some((p) => p.includes("/sounds/win.wav")),
    "Local audio is precached",
  );
  await page.evaluate(() => {
    localStorage.setItem(
      "aeroplay:game2048:state",
      JSON.stringify({
        grid: [
          [2, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        score: 0,
        moves: 0,
      }),
    );
    location.hash = "2048";
  });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === "2048",
  );
  const box = await page.locator(".pocket-stage canvas").boundingBox();
  const session = isWebKit ? null : await context.newCDPSession(page);
  async function touchMove(box, direction, button) {
    if (!session) {
      await page.getByRole("button", { name: button, exact: true }).tap();
      return;
    }
    const vertical = direction === "up";
    const first = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const last = { ...first };
    if (vertical) {
      first.y = box.y + box.height - 30;
      last.y = box.y + 30;
    } else if (direction === "left") {
      first.x = box.x + box.width - 30;
      last.x = box.x + 30;
    } else {
      first.x = box.x + 60;
      last.x = box.x + box.width - 60;
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [first],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [last],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  await touchMove(box, "left", "Left");
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).moves === 1,
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).score),
    4,
  );
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text);
  assert.equal(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).score),
    4,
  );
  const output = `output/offline-${isWebKit ? "webkit" : "chromium"}`;
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({
    path: `${output}/2048-swipe.png`,
    fullPage: true,
  });
  await page.evaluate(() => {
    location.hash = "snake";
  });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === "snake",
  );
  const snakeBox = await page.locator("canvas").boundingBox();
  await touchMove(snakeBox, "up", "Up");
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).direction.y === -1,
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode),
    "playing",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await page.screenshot({
    path: `${output}/snake-touch.png`,
    fullPage: true,
  });
  await page.evaluate(() => {
    location.hash = "sky";
  });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === "sky",
  );
  await page.getByRole("button", { name: "Take flight →", exact: true }).tap();
  const skyBox = await page.locator("canvas").boundingBox();
  await touchMove(skyBox, "right", "Steer right");
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).lane === 2,
  );
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await page.screenshot({
    path: `${output}/sky-touch.png`,
    fullPage: true,
  });
  await page.evaluate(() => {
    location.hash = "cargo";
  });
  await page.waitForFunction(
    () =>
      window.render_game_to_text &&
      JSON.parse(window.render_game_to_text()).game === "cargo",
  );
  const cargoBox = await page.locator("canvas").boundingBox();
  await touchMove(cargoBox, "right", "Right");
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).pushes === 1,
  );
  await page.screenshot({
    path: `${output}/cargo-touch.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    `PASS Offline: ${cached.length} cached resources, online/offline reload${pagesRedirects ? " with Pages HTML redirects" : ""}, all ten games, saved scores, ${isWebKit ? "WebKit native touch controls" : "real 2D/3D touch swipes"} and offline worker hints, no external requests or page errors`,
  );
} finally {
  await browser.close();
  if (pagesPreview?.httpServer.listening) {
    await new Promise((resolve, reject) => {
      pagesPreview.httpServer.close((error) =>
        error ? reject(error) : resolve(),
      );
      pagesPreview.httpServer.closeAllConnections();
    });
  }
}
