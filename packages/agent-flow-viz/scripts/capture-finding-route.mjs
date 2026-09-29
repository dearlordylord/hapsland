import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-finding-retained.png");
const routesOutput = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-finding-routes.png");
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  assert.ok(url, "Vite must expose a local browser URL");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1392, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url);
  const replay = page.locator("#canonical-replay");
  await replay.getByRole("button", { name: "finding is a distinct observed request result and duplicate is rejected", exact: true }).click();
  for (let step = 1; step <= 7; step++) {
    await replay.getByRole("button", { name: /^Next canonical step:/ }).click();
    await page.waitForFunction((expected) =>
      document.querySelector(".canonical-progress")?.textContent?.includes(expected), `Guided step ${step} of 8`);
  }
  assert.match(await page.locator(".topology-step").innerText(), /jevRequestSettled accepted.*reviewRecorded.*retainFinding/s);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "finding retained" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "clear / stale / unavailable" }).count(), 0);
  await page.locator(".production-flow").screenshot({ path: output });
  await page.locator(".topology-routes").screenshot({ path: routesOutput });
  console.log(`Captured guided finding result, step 7 of 8: ${output} and ${routesOutput}`);
} finally {
  await browser?.close();
  await server.close();
}
