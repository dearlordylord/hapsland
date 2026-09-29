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
  assert.match(await page.locator(".production-flow").innerText(), /Native Hapsland effects/);
  assert.match(await page.locator(".production-flow").innerText(), /Jev response · external/);
  const canonical = page.locator("#canonical-replay");
  assert.match(await canonical.innerText(), /What uses review capacity/);
  assert.match(await canonical.innerText(), /All agents in this Hapsland process · 0\/3 work items/);
  for (let step = 1; step <= 3; step++) {
    await canonical.getByRole("button", { name: /^Next canonical step:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 11`);
  }
  assert.match(await canonical.innerText(), /Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted/s);
  assert.match(await canonical.locator(".capacity-rows").innerText(), /Agent 1 · 2\/2 work items · 30\/60 reserved bytes/);
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
  assert.match(await page.locator(".production-flow").innerText(), /Observed unavailable result supplied to Bend/);

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
  console.log("Browser controls passed: canonical guided/manual replay, command frames, rewind/redo, capacity rows, independent import graph, and native timing.");
} finally {
  await browser?.close();
  await server.close();
}
