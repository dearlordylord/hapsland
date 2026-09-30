import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const output = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-finding-retained.png");
const routesOutput = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-finding-routes.png");
const refusalOutput = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-jev-refusal.png");
const stopWaitOutput = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-stop-wait.png");
const retainedOutput = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-collection-retained.png");
const allowOutput = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-allow-without-output.png");
const cancellationOutput = resolve(import.meta.dirname, "../docs/assets/production-flow-canonical-stop-cancellation.png");
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
    await replay.getByRole("button", { name: /^Next:/ }).click();
    await page.waitForFunction((expected) =>
      document.querySelector(".canonical-progress")?.textContent?.includes(expected), `Guided step ${step} of 8`);
  }
  assert.match(await page.locator(".topology-step").innerText(), /jevRequestSettled accepted.*reviewRecorded.*retainFinding/s);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "retain finding command" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "clear / stale / unavailable" }).count(), 0);
  await page.locator(".production-flow").screenshot({ path: output });
  await page.locator(".topology-scroll").screenshot({ path: routesOutput });
  await replay.getByRole("button", { name: "eight active request permits; ninth settles immediately and release permits another", exact: true }).click();
  for (let step = 1; step <= 29; step++) {
    await replay.getByRole("button", { name: /^Next:/ }).click();
    await page.waitForFunction((expected) =>
      document.querySelector(".canonical-progress")?.textContent?.includes(expected), `Guided step ${step} of 34`);
  }
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "immediate unavailable" }).count(), 1);
  await page.locator(".production-flow").screenshot({ path: refusalOutput });
  await replay.getByRole("button", { name: "many units admit in order and Stop waits", exact: true }).click();
  for (let step = 1; step <= 4; step++) {
    await replay.getByRole("button", { name: /^Next:/ }).click();
    await page.waitForFunction((expected) =>
      document.querySelector(".canonical-progress")?.textContent?.includes(expected), `Guided step ${step} of 7`);
  }
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "Stop waits for work or output" }).count(), 1);
  await page.locator(".production-flow").screenshot({ path: stopWaitOutput });
  await replay.getByRole("button", { name: "deadline requests exact cancellations", exact: true }).click();
  for (let step = 1; step <= 3; step++) {
    await replay.getByRole("button", { name: /^Next:/ }).click();
    await page.waitForFunction((expected) =>
      document.querySelector(".canonical-progress")?.textContent?.includes(expected), `Guided step ${step} of 4`);
  }
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "cancel unfinished work command" }).count(), 1);
  await page.locator(".production-flow").screenshot({ path: cancellationOutput });
  const applyManual = async (event) => {
    await replay.getByRole("button", { name: "Reset replay" }).click();
    await replay.getByLabel("Event JSON").fill(JSON.stringify(event));
    await replay.getByLabel("Event JSON").press("Tab");
    await replay.getByRole("button", { name: "Apply event" }).click();
    await page.waitForFunction(() =>
      document.querySelector(".canonical-progress")?.textContent?.includes("history 1/1"));
  };
  await applyManual({ kind: "collectionFindingCheck", selectionPartition: 1, selectionRound: 1,
    unit: 1, partition: 1, round: 1, snapshot: 1, currentSnapshot: 1,
    credential: 0, currentCredential: 0, ageMs: 0, soloBytes: 100,
    collectionReady: true, selectedCount: 6, prospectiveBytes: 10241 });
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "finding kept for a later collection batch" }).count(), 1);
  await page.locator(".production-flow").screenshot({ path: retainedOutput });
  await applyManual({ kind: "finishReserve", group: 1, lifetime: 1, round: 1,
    attempt: 7, token: 8, selected: [], hasNotice: false, passNotices: true,
    canWrite: true, bindingValid: true, deadlineReached: false });
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "allow finish decision; no host output or round change" }).count(), 1);
  await page.locator(".production-flow").screenshot({ path: allowOutput });
  console.log(`Captured finding, Jev refusal, Stop wait/cancellation, collection retained, and allow without output.`);
} finally {
  await browser?.close();
  await server.close();
}
