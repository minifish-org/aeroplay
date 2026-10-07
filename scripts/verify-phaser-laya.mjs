import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const browser = await (
  process.env.TEST_BROWSER === "webkit" ? webkit : chromium
).launch({ headless: true });
const base = process.env.TEST_URL ?? "http://127.0.0.1:5173";
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage(),
  errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
const ids = [
  "snake",
  "flappy",
  "tetris",
  "2048",
  "match3",
  "maze",
  "sudoku",
  "lightsout",
];
let delayed = false;
await context.route("https://laya.example/**", async (route) => {
  const request = route.request();
  if (request.url().endsWith("/health"))
    return route.fulfill({
      json: {
        ready: true,
        protocol: "aeroplay-laya-v1",
        model: "Controlled verification transport",
        games: ids,
      },
    });
  const payload = request.postDataJSON();
  requests.push(payload);
  await new Promise((resolve) => setTimeout(resolve, delayed ? 450 : 80));
  await route
    .fulfill({
      json: {
        choice: Object.keys(payload.question.criteria)[0],
        model: "Controlled verification transport",
      },
    })
    .catch(() => {});
});
await page.addInitScript(() => {
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
});
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const wait = (fn, arg) => page.waitForFunction(fn, arg, { polling: 20 });
const humanSaves = () =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(
        ([key]) =>
          key.startsWith("aeroplay:") &&
          !key.startsWith("aeroplay:laya:") &&
          !["aeroplay:last-game", "aeroplay:laya-settings"].includes(key),
      ),
    ),
  );
try {
  await page.goto(`${base}/#hub`);
  await page.evaluate(() =>
    localStorage.setItem(
      "aeroplay:laya-settings",
      JSON.stringify({ endpoint: "https://laya.example" }),
    ),
  );
  await page.reload();
  await fs.mkdir("output/laya-phaser", { recursive: true });
  for (const id of ids) {
    await page.evaluate((id) => {
      location.hash = id;
    }, id);
    await wait(
      (id) =>
        window.render_game_to_text &&
        JSON.parse(window.render_game_to_text()).game === id,
      id,
    );
    await page.evaluate(() => window.advanceTime(0));
    const personal = await humanSaves();
    await page.getByRole("button", { name: "Watch Laya", exact: true }).click();
    await wait(
      () =>
        Number(document.querySelector(".game-shell")?.dataset.layaDecisions) >=
        1,
    );
    await page.evaluate(() => window.advanceTime(1000));
    assert.equal((await state()).renderer, "phaser");
    assert.deepEqual(
      await humanSaves(),
      personal,
      `${id}: AI runs cannot write personal saves`,
    );
    if (id === "sudoku") {
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("aeroplay:laya:sudoku:state-v3")),
      );
      for (const payload of requests.filter((r) => r.game === id))
        assert(
          !payload.context.includes(saved.solution.join("")),
          "Laya receives no stored answer sheet",
        );
    }
    delayed = true;
    await page.locator(".laya-pause").click();
    const paused = await state();
    await page.evaluate(() => window.advanceTime(2000));
    await page.waitForTimeout(500);
    assert.deepEqual(
      await state(),
      paused,
      `${id}: paused state ignores time and late decisions`,
    );
    await page.locator(".laya-pause").click();
    await page
      .getByRole("button", { name: "Take over →", exact: true })
      .click();
    assert.equal(
      await page.locator(".game-shell").getAttribute("data-player"),
      "human",
    );
    assert.equal(
      await page.locator(".game-area").evaluate((el) => el.inert),
      false,
    );
    await page.screenshot({
      path: `output/laya-phaser/${id}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.waitForSelector(".hub-card");
    assert.equal(await page.locator("canvas").count(), 0);
    assert.equal(
      await page.evaluate(() => typeof window.render_game_to_text),
      "undefined",
    );
    delayed = false;
    console.log(
      `PASS ${id}: real Phaser adapter, decisions, save isolation, pause, late replies, takeover, disposal`,
    );
  }
  // Deliberately supersede mounts while local audio and the scene are still booting.
  await page.evaluate(async (ids) => {
    for (const id of [...ids, ...ids, "hub"]) {
      location.hash = id;
      await new Promise((r) => setTimeout(r, 3));
    }
  }, ids);
  await page.waitForSelector(".hub-card");
  await page.waitForTimeout(600);
  assert.equal(await page.locator("canvas").count(), 0);
  assert.equal(await page.locator(".laya-session").count(), 0);
  assert.equal(
    await page.evaluate(() => typeof window.render_game_to_text),
    "undefined",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS Rapid mount cancellation, no orphan scenes, callbacks or browser errors. Transport is mocked; this does not verify real-model skill.",
  );
} finally {
  await browser.close();
}
