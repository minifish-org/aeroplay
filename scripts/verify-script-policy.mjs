import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const engines = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const base = process.env.TEST_URL ?? "http://127.0.0.1:4181";
const url = "https://beacon.invalid/injected.js";
for (const name of ["chromium", "webkit"]) {
  const browser = await engines[name].launch({ headless: true });
  const page = await browser.newPage();
  let networkDispatches = 0;
  await page.route(url, (route) => {
    networkDispatches++;
    return route.fulfill({ body: "window.injectedScriptRan = true;" });
  });
  try {
    await page.goto(base);
    await page.waitForSelector(".hub-card");
    assert.equal(await page.locator(".hub-card").count(), 10);
    const violation = await page.evaluate(
      (url) =>
        new Promise((resolve) => {
          document.addEventListener(
            "securitypolicyviolation",
            function blocked(event) {
              if (event.blockedURI !== url) return;
              document.removeEventListener("securitypolicyviolation", blocked);
              resolve(event.effectiveDirective);
            },
          );
          const script = document.createElement("script");
          script.src = url;
          script.addEventListener("load", () => resolve("unexpected-load"));
          document.body.append(script);
        }),
      url,
    );
    assert.match(violation, /^script-src/);
    assert.equal(
      networkDispatches,
      0,
      "Policy must block scripts before network dispatch",
    );
    assert.equal(await page.evaluate(() => !!window.injectedScriptRan), false);
    console.log(
      `PASS ${name}: injected external scripts blocked before network or execution; local hub loads.`,
    );
  } finally {
    await browser.close();
  }
}
