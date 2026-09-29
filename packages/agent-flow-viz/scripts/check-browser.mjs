import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) throw new Error("Vite did not expose a local browser URL");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  const waitForText = (selector, text) => page.waitForFunction(([target, expected]) =>
    document.querySelector(target)?.textContent?.includes(expected), [selector, text]);

  assert.match(await page.locator(".page-header").innerText(), /CANONICAL BEND PRODUCTION MODEL/);
  assert.equal(await page.locator(".topology-node").count(), 13);
  assert.match(await page.locator(".production-flow").innerText(), /Native Jev effect attempt/);
  assert.match(await page.locator(".production-flow").innerText(), /Jev in-flight: 0\/8 · no Jev wait queue/);
  const canonical = page.locator("#canonical-replay");
  assert.match(await canonical.innerText(), /What uses review capacity/);
  assert.match(await canonical.innerText(), /All agents in this Hapsland process · 0\/3 work items/);
  for (let step = 1; step <= 3; step++) {
    await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 11`);
  }
  assert.match(await canonical.innerText(), /Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted/s);
  assert.match(await canonical.locator(".capacity-rows").innerText(), /Agent 1 · 2\/2 work items · 30\/60 reserved bytes/);
  const beforeRejection = await page.locator(".topology-grid").innerText();
  await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 4 of 11");
  assert.equal(await page.locator(".topology-grid").innerText(), beforeRejection);
  assert.equal(await page.locator(".topology-route.active").count(), 0);
  assert.match(await page.locator(".topology-step").innerText(), /rejected: StaleOperation/);
  await canonical.getByRole("button", { name: "Previous canonical step" }).click();
  await waitForText(".canonical-progress", "Guided step 3 of 11");
  await canonical.getByRole("button", { name: /Unit 2: no capacity/ }).click();
  await waitForText(".capacity-frames", "Frame 3 of 4");
  assert.match(await canonical.innerText(), /Frame 3 of 4 · 2 shared items · 50 shared bytes/);
  await canonical.getByRole("button", { name: "Previous canonical step" }).click();
  await waitForText(".canonical-progress", "Guided step 2 of 11");
  await canonical.getByRole("button", { name: "Redo canonical step" }).click();
  await waitForText(".canonical-progress", "Guided step 3 of 11");
  await canonical.getByLabel("Manual source-free canonical event (JSON)").fill(
    '{"kind":"releaseCapacity","reservation":4}');
  await canonical.getByLabel("Manual source-free canonical event (JSON)").press("Tab");
  await canonical.getByRole("button", { name: "Apply canonical event" }).click();
  await waitForText(".canonical-progress", "history 4/4");
  await canonical.getByLabel("Manual source-free canonical event (JSON)").fill(
    '{"kind":"reserveCapacity","partition":3,"bytes":5,"purpose":"reviewUnit"}');
  await canonical.getByLabel("Manual source-free canonical event (JSON)").press("Tab");
  await canonical.getByRole("button", { name: "Apply canonical event" }).click();
  await waitForText(".canonical-progress", "history 5/5");
  assert.match(await canonical.locator(".capacity-rows").innerText(), /Agent 3/);
  await canonical.getByRole("button", { name: "Reset canonical replay" }).click();
  await waitForText(".canonical-progress", "history 0/0");
  await canonical.getByRole("button", { name: "unknown output is reoffered at Stop", exact: true }).click();
  await waitForText(".canonical-progress", "Guided step 0 of 6");
  for (let step = 1; step <= 6; step++) {
    await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 6`);
  }
  assert.match(await canonical.innerText(), /reofferAtStop/);
  await canonical.getByRole("button", { name: "many units admit in order and Stop waits", exact: true }).click();
  await waitForText(".canonical-progress", "Guided step 0 of 7");
  for (let step = 1; step <= 3; step++) {
    await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 7`);
  }
  assert.match(await canonical.innerText(), /Preparation completion decisions.*Before event.*Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted.*After event/s);
  await canonical.getByRole("button", { name: /Unit 2: no capacity/ }).click();
  await waitForText(".capacity-frames", "Frame 3 of 4");
  assert.match(await canonical.innerText(), /Frame 3 of 4 · 1 shared items · 10 shared bytes/);
  for (let step = 4; step <= 6; step++) {
    await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 7`);
  }
  assert.match(await canonical.innerText(), /reviewRecorded · outcome: unavailable/);
  assert.match(await page.locator(".production-flow").innerText(), /reviewCompleted accepted/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "clear / stale / unavailable" }).count(), 1);

  await canonical.getByRole("button", { name: "clear is a distinct observed request result and duplicate is rejected", exact: true }).click();
  for (let step = 1; step <= 7; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 7 of 8");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "clear / stale / unavailable" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "finding retained" }).count(), 0);

  await canonical.getByRole("button", { name: "finding is a distinct observed request result and duplicate is rejected", exact: true }).click();
  for (let step = 1; step <= 7; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 7 of 8");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "finding retained" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "clear / stale / unavailable" }).count(), 0);

  await canonical.getByRole("button", { name: "Reset canonical replay" }).click();
  const staleEvents = [
    { kind: "openRound", partition: 1, lifetime: 1 },
    { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 10 },
    { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, unitBytes: [10] },
    { kind: "startReview", partition: 1, lifetime: 1, round: 1, operation: 2 },
    { kind: "reviewObserved", partition: 1, lifetime: 1, round: 1, operation: 2, outcome: "finding", currentWork: false },
  ];
  for (const [index, event] of staleEvents.entries()) {
    await canonical.getByLabel("Manual source-free canonical event (JSON)").fill(JSON.stringify(event));
    await canonical.getByLabel("Manual source-free canonical event (JSON)").press("Tab");
    await canonical.getByRole("button", { name: "Apply canonical event" }).click();
    await waitForText(".canonical-progress", `history ${index + 1}/${index + 1}`);
  }
  await waitForText(".canonical-progress", "history 5/5");
  assert.match(await page.locator(".topology-step").innerText(), /retireStaleFinding/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "clear / stale / unavailable" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "finding retained" }).count(), 0);

  await canonical.getByRole("button", { name: "eight active request permits; ninth settles immediately and release permits another", exact: true }).click();
  for (let step = 1; step <= 26; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 26 of 34");
  assert.match(await page.locator(".topology-capacities").innerText(), /Jev in-flight: 8\/8 · no Jev wait queue/);
  assert.match(await page.locator(".topology-node").nth(6).innerText(), /observed started requests/);
  for (let step = 27; step <= 29; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 29 of 34");
  assert.match(await page.locator(".topology-step").innerText(), /jevRequestReady accepted.*jevRequestUnavailable/);
  assert.match(await page.locator(".topology-capacities").innerText(), /Jev in-flight: 8\/8 · no Jev wait queue/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "immediate unavailable" }).count(), 1);
  await canonical.getByRole("button", { name: "Previous canonical step" }).click();
  await waitForText(".canonical-progress", "Guided step 28 of 34");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "immediate unavailable" }).count(), 0);
  await canonical.getByRole("button", { name: "Redo canonical step" }).click();
  await waitForText(".canonical-progress", "Guided step 29 of 34");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "immediate unavailable" }).count(), 1);

  await canonical.getByRole("button", { name: "neverSent is a distinct observed request result and duplicate is rejected", exact: true }).click();
  for (let step = 1; step <= 6; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 6 of 7");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "command never sent" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "external finding or clear response" }).count(), 0);
  assert.equal(await page.locator(".topology-node.active").filter({ hasText: "Jev response" }).count(), 0);

  await canonical.getByRole("button", { name: "interrupted is a distinct observed request result and duplicate is rejected", exact: true }).click();
  for (let step = 1; step <= 7; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 7 of 9");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "attempt interrupted / cancelled" }).count(), 1);
  await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 8 of 9");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "attempt interrupted / cancelled" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "external finding or clear response" }).count(), 0);

  await canonical.getByRole("button", { name: "many units admit in order and Stop waits", exact: true }).click();
  for (let step = 1; step <= 4; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 4 of 7");
  assert.equal(await page.locator(".finish-branch.active").filter({ hasText: "Wait for work" }).count(), 1);
  assert.match(await page.locator(".finish-decision").innerText(), /Continue with advice.*Allow finish.*Cancel unfinished work/s);
  await canonical.getByRole("button", { name: "deadline requests exact cancellations", exact: true }).click();
  for (let step = 1; step <= 3; step++) await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
  await waitForText(".canonical-progress", "Guided step 3 of 4");
  assert.equal(await page.locator(".finish-branch.active").filter({ hasText: "Cancel unfinished work" }).count(), 1);
  assert.equal(await page.locator(".finish-branch.active").filter({ hasText: "Decision ready" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "attempt interrupted / cancelled" }).count(), 0);
  assert.equal(await page.locator(".topology-node.active").filter({ hasText: "Native Jev effect attempt" }).count(), 0);
  const coverage = page.locator(".flow-coverage");
  await coverage.locator("summary").click();
  assert.match(await coverage.innerText(), /Jev ready, command, attempt and terminal facts · guided:/);
  assert.match(await coverage.innerText(), /Background and Stop collection, leases and expiry · manual replay only/);
  assert.match(await coverage.innerText(), /Native facts and effects outside Bend/);
  assert.equal(await coverage.getByRole("link", { name: "Bend source" }).count(), 12);

  const imports = page.locator("#import-graph");
  assert.match(await imports.innerText(), /Native: resolution, permission facts, source capture/);
  for (let step = 1; step <= 9; step++) {
    await imports.getByRole("button", { name: "Next import step", exact: true }).click();
    await waitForText(".import-graph-progress", `Import step ${step} of 9`);
  }
  assert.match(await imports.locator(".import-graph-facts").innerText(), /A.ts · incomplete/);
  assert.doesNotMatch(await imports.locator(".import-graph-facts").innerText(), /D.ts/);
  assert.match(await page.locator("#timing-diagrams").innerText(), /Native timing evidence/);
  assert.deepEqual(errors, []);
  console.log("Browser controls passed: canonical replay/history, ordered capacity, ninth Jev refusal, unsent/interrupted routes, Stop fork, coverage inventory, import graph, and native timing.");
} finally {
  await browser?.close();
  await server.close();
}
