import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";
import reviewFixture from "../../../conformance/canonical-review-v1.json" with { type: "json" };
import dispatchFixture from "../../../conformance/canonical-dispatch-v1.json" with { type: "json" };
import collectionFixture from "../../../conformance/canonical-collection-v1.json" with { type: "json" };

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
  const advanceGuided = async (first, last, total) => {
    for (let step = first; step <= last; step++) {
      if (total === 63 && (step === 41 || step === 44)) continue;
      while ((await canonical.getByRole("button", { name: /^Next:/ }).innerText()).includes("preparation ·")) {
        const prior = await canonical.locator(".canonical-progress").innerText();
        await canonical.getByRole("button", { name: /^Next:/ }).click();
        await page.waitForFunction(previous => document.querySelector(".canonical-progress")?.textContent !== previous, prior);
        assert.match(await canonical.locator(".preparation-mini").textContent(), /Preparation #/);
      }
      await canonical.getByRole("button", { name: /^Next:/ }).click();
      await waitForText(".canonical-progress", `Guided step ${total === 63 && (step === 40 || step === 43) ? step + 1 : step} of ${total}`);
      if (total === 63 && step === 16) {
        assert.match(await canonical.locator(".preparation-mini-counts").textContent(), /7\/8 files read.*20 KiB/);
        assert.match(await canonical.locator(".preparation-mini-status").textContent(), /Preparation #2.*incomplete/);
        await canonical.getByLabel("Inspect square").selectOption("preparation");
        await waitForText(".preparation-reference-details", "Preparation #2/operation 5 · Branching tree budget");
        const details = canonical.locator(".preparation-reference-details");
        assert.match(await details.locator(".preparation-reference-counts").innerText(), /2 artifact trees.*1 complete.*1 incomplete.*7\/8 files read.*20480\/20480/);
        const graph = await details.locator("svg").textContent();
        assert.match(graph, /IMPORT \/ REFERENCE GRAPH/);
        for (const name of ["A.ts", "B.ts", "C.ts", "D.ts", "E.ts", "F.ts", "G.ts", "X.ts"]) assert.ok(graph.includes(name));
        assert.ok(graph.includes("Excluded"));
        assert.ok(graph.includes("TreeLimit"));
        await canonical.getByLabel("Inspect square").selectOption("");
        await page.waitForFunction(() => !document.querySelector("#canonical-replay .preparation-reference-details"));
      }
    }
  };

  assert.match(await page.locator(".page-header").innerText(), /From agent edit to Jev and back/);
  assert.equal(await page.locator(".topology-node").count(), 14);
  assert.match(await page.locator(".production-flow").innerText(), /Jev request attempt/);
  assert.match(await page.locator(".production-flow").innerText(), /Jev in-flight: 0\/8 · no Jev wait queue/);
  const canonical = page.locator("#canonical-replay");
  for (const selector of [".topology-step", ".finish-decision", ".manual-event", ".replay-history"]) {
    await page.locator(selector + " summary").first().click();
  }
  const applyManual = async ({ expect: _expect, ...event }, position) => {
    await canonical.getByLabel("Event JSON").fill(JSON.stringify(event));
    await canonical.getByLabel("Event JSON").press("Tab");
    if (position === 1) await canonical.locator(".manual-event button[type=submit]").press("Enter");
    else await canonical.getByRole("button", { name: "Apply event" }).click();
    try { await waitForText(".canonical-progress", `history ${position}/`); }
    catch (error) { throw new Error(`Manual ${event.kind} at ${position}: ${await canonical.locator(".canonical-feedback").innerText()} · ${await canonical.locator(".canonical-progress").innerText()}`, { cause: error }); }
  };
  assert.match(await canonical.innerText(), /Capacity rules/);
  assert.match(await canonical.innerText(), /All agents in this Hapsland process · 0\/3 work items/);
  assert.match(await canonical.innerText(), /Two edits through findings, a clear result, and Stop output/);
  await advanceGuided(1, 1, 63);
  assert.match(await page.locator(".flow-provenance").innerText(), /Before the edit.*Bend issued a permit.*No virtual round is open yet/s);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Admission & capacity" }).textContent(), /1 edit permit: Permit #1/);
  await advanceGuided(2, 2, 63);
  assert.match(await page.locator(".flow-provenance").innerText(), /Why this round opened.*first accepted attributed edit.*Bend opened virtual round/s);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Admission & capacity" }).textContent(), /0 edit permits/);
  await advanceGuided(3, 3, 63);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Awaiting source read" }).textContent(), /1 pending source read: Source read #1/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "Source read #1/operation 1 admitted; source read not started" }).count(), 1);
  await advanceGuided(4, 4, 63);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Awaiting source read" }).textContent(), /1 pending source read: Source read #1/);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Job scheduling" }).textContent(), /1 running preparation jobs:/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "dispatch entered running" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "→ Read & prepare source" }).count(), 0);
  await advanceGuided(5, 8, 63);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Job scheduling" }).textContent(), /2 running preparation jobs:/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "entered running" }).count(), 1);
  await canonical.locator(".topology-node").filter({ hasText: "Job scheduling" }).locator("rect").click();
  await waitForText(".flow-stage-inspector", "running preparation jobs: 2");
  assert.match(await canonical.locator(".flow-stage-inspector").innerText(), /running preparation jobs: 2.*#2 · operation 2 · agent 1 · round 1 · seq 1/s);
  await canonical.getByLabel("Inspect square").selectOption("sourcePending");
  await waitForText(".flow-stage-inspector", "pending source reads: 2");
  assert.match(await canonical.locator(".flow-stage-inspector").innerText(), /pending source reads: 2/s);
  assert.match(await canonical.locator(".flow-stage-inspector").innerText(), /#1/);
  assert.match(await canonical.locator(".flow-stage-inspector").innerText(), /#2/);
  await canonical.getByRole("button", { name: "Close square details" }).click();
  await waitForText(".flow-stage-inspector", "Select a square or click one");
  assert.match(await canonical.locator(".flow-stage-inspector").innerText(), /Select a square or click one/);
  await canonical.locator(".topology-node").filter({ hasText: "Job scheduling" }).locator("rect").click();
  await waitForText(".flow-stage-inspector", "running preparation jobs: 2");
  await canonical.locator(".topology-node").filter({ hasText: "Job scheduling" }).locator("rect").click();
  await waitForText(".flow-stage-inspector", "Select a square or click one");
  assert.match(await canonical.locator(".flow-stage-inspector").innerText(), /Select a square or click one/);
  await advanceGuided(9, 13, 63);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "(pending) → dispatch" }).count(), 0);
  await advanceGuided(14, 36, 63);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Review outcomes" }).textContent(), /NOW · Review item #3 clear/);
  await advanceGuided(37, 40, 63);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "Advice #1/operation 4 leased; still ready" }).count(), 1);
  await advanceGuided(41, 59, 63);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "round #1 retired" }).count(), 1);
  await advanceGuided(60, 63, 63);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Round state" }).textContent(), /0 active rounds/);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Ready advice" }).textContent(), /0 awaiting delivery/);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Review outcomes" }).textContent(), /0 finding work/);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Host output" }).textContent(), /0 Stop output slots.*0 submitted advice records/s);
  assert.match(await page.locator(".topology-capacities").innerText(), /Review capacity ledger: 0\/3 items; 0\/100 bytes/);
  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "Shared review capacity and partial unit admission" });
  await waitForText(".canonical-progress", "Guided step 0 of 11");
  for (let step = 1; step <= 3; step++) {
    await canonical.getByRole("button", { name: /^Next:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 11`);
  }
  assert.match(await canonical.innerText(), /Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted/s);
  assert.match(await canonical.locator(".capacity-rows").innerText(), /Agent 1 · 2\/2 work items · 30\/60 reserved bytes/);
  const beforeRejection = await page.locator(".topology-scroll svg").textContent();
  await canonical.getByRole("button", { name: /^Next:/ }).click();
  await waitForText(".canonical-progress", "Guided step 4 of 11");
  assert.equal(await page.locator(".topology-scroll svg").textContent(), beforeRejection);
  assert.equal(await page.locator(".topology-route.active").count(), 0);
  assert.match(await page.locator(".topology-step").innerText(), /rejected: StaleOperation/);
  await canonical.getByRole("button", { name: "Previous history event" }).click();
  await waitForText(".canonical-progress", "Guided step 3 of 11");
  await canonical.locator(".capacity-frames").evaluate((element) => element.open = true);
  await canonical.getByRole("button", { name: /Unit 2: no capacity/ }).click();
  await waitForText(".capacity-frames", "Frame 3 of 4");
  assert.match(await canonical.innerText(), /Frame 3 of 4 · 2 shared items · 50 shared bytes/);
  await canonical.getByRole("button", { name: "Previous history event" }).click();
  await waitForText(".canonical-progress", "Guided step 2 of 11");
  await canonical.getByRole("button", { name: "Redo history event" }).click();
  await waitForText(".canonical-progress", "Guided step 3 of 11");
  await canonical.getByLabel("Event JSON").fill(
    '{"kind":"releaseCapacity","reservation":4}');
  await canonical.getByLabel("Event JSON").press("Tab");
  await canonical.getByRole("button", { name: "Apply event" }).click();
  await waitForText(".canonical-progress", "history 4/");
  await canonical.getByLabel("Event JSON").fill(
    '{"kind":"reserveCapacity","partition":3,"bytes":5,"purpose":"reviewUnit"}');
  await canonical.getByLabel("Event JSON").press("Tab");
  await canonical.getByRole("button", { name: "Apply event" }).click();
  await waitForText(".canonical-progress", "history 5/");
  assert.match(await canonical.locator(".capacity-rows").innerText(), /Agent 3/);
  await canonical.getByRole("button", { name: "Reset replay" }).click();
  await waitForText(".canonical-progress", "history 0/");
  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "unknown output is reoffered at Stop" });
  await waitForText(".canonical-progress", "Guided step 0 of 6");
  for (let step = 1; step <= 6; step++) {
    await canonical.getByRole("button", { name: /^Next:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 6`);
  }
  assert.match(await canonical.innerText(), /reofferAtStop/);
  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "many units admit in order and Stop waits" });
  await waitForText(".canonical-progress", "Guided step 0 of 7");
  for (let step = 1; step <= 3; step++) {
    await canonical.getByRole("button", { name: /^Next:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 7`);
  }
  assert.match(await canonical.innerText(), /Preparation completion decisions.*Before event.*Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted.*After event/s);
  await canonical.locator(".capacity-frames").evaluate((element) => element.open = true);
  await canonical.getByRole("button", { name: /Unit 2: no capacity/ }).click();
  await waitForText(".capacity-frames", "Frame 3 of 4");
  assert.match(await canonical.innerText(), /Frame 3 of 4 · 1 shared items · 10 shared bytes/);
  for (let step = 4; step <= 6; step++) {
    await canonical.getByRole("button", { name: /^Next:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of 7`);
  }
  assert.match(await canonical.innerText(), /reviewCompleted accepted · 2 command\(s\): reservationReleased, reviewRecorded/);
  assert.match(await page.locator(".production-flow").innerText(), /reviewCompleted accepted/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "nonfinding review outcome recorded" }).count(), 1);

  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "clear is a distinct observed request result and duplicate is rejected" });
  await waitForText(".canonical-progress", "Guided step 0 of 8");
  await advanceGuided(1, 6, 8);
  await waitForText(".canonical-progress", "Guided step 6 of 8");
  assert.match(await page.locator(".topology-capacities").innerText(), /Jev in-flight: 1\/8 · no Jev wait queue/);
  await canonical.getByRole("button", { name: /^Next:/ }).click();
  await waitForText(".canonical-progress", "Guided step 7 of 8");
  assert.match(await page.locator(".topology-capacities").innerText(), /Jev in-flight: 0\/8 · no Jev wait queue/);
  const suppliedJevResult = page.locator(".topology-route.active.external").filter({ hasText: "Awaiting Jev result → Review outcomes" });
  assert.equal(await suppliedJevResult.count(), 1);
  assert.equal(await suppliedJevResult.locator("path").first().getAttribute("stroke"), "#8a5a00");
  assert.equal(await page.locator(".topology-node").filter({ hasText: "Awaiting Jev result" }).locator("rect").getAttribute("fill"), "#e9f1ff");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "nonfinding review outcome recorded" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "retain finding command" }).count(), 0);

  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "finding is a distinct observed request result and duplicate is rejected" });
  await waitForText(".canonical-progress", "Guided step 0 of 8");
  await advanceGuided(1, 7, 8);
  await waitForText(".canonical-progress", "Guided step 7 of 8");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "retain finding command" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "nonfinding review outcome recorded" }).count(), 0);

  await canonical.getByRole("button", { name: "Reset replay" }).click();
  await waitForText(".canonical-progress", "history 0/");
  const staleTrace = reviewFixture.traces.find((trace) => trace.name === "stale completed finding never becomes pending advice");
  assert.ok(staleTrace);
  const staleEvents = staleTrace.events.slice(0, 12);
  for (const [index, event] of staleEvents.entries()) await applyManual(event, index + 1);
  await waitForText(".topology-step", "retireStaleFinding");
  assert.match(await page.locator(".topology-step").innerText(), /retireStaleFinding/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "clear, stale, or backend outcome recorded" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "retain finding command" }).count(), 0);
  await applyManual(staleTrace.events[12], 13);
  assert.match(await page.locator(".topology-step").innerText(), /rejected: StaleOperation/);
  assert.equal(await page.locator(".topology-route.active").count(), 0);

  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "eight active request permits; ninth settles immediately and release permits another" });
  await waitForText(".canonical-progress", "Guided step 0 of 34");
  await advanceGuided(1, 26, 34);
  await waitForText(".canonical-progress", "Guided step 26 of 34");
  assert.match(await page.locator(".topology-capacities").innerText(), /Jev in-flight: 8\/8 · no Jev wait queue/);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Jev request attempt" }).textContent(), /7 started requests/);
  await advanceGuided(27, 29, 34);
  await waitForText(".canonical-progress", "Guided step 29 of 34");
  assert.match(await page.locator(".topology-step").innerText(), /jevRequestReady accepted.*jevRequestUnavailable/);
  assert.match(await page.locator(".topology-capacities").innerText(), /Jev in-flight: 8\/8 · no Jev wait queue/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "request unavailable or refused" }).count(), 1);
  await canonical.getByRole("button", { name: "Previous history event" }).click();
  await waitForText(".canonical-progress", "Guided step 28 of 34");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "request unavailable or refused" }).count(), 0);
  await canonical.getByRole("button", { name: "Redo history event" }).click();
  await waitForText(".canonical-progress", "Guided step 29 of 34");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "request unavailable or refused" }).count(), 1);

  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "neverSent is a distinct observed request result and duplicate is rejected" });
  await waitForText(".canonical-progress", "Guided step 0 of 7");
  await advanceGuided(1, 6, 7);
  await waitForText(".canonical-progress", "Guided step 6 of 7");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "Jev result supplied: neverSent" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active.external").count(), 0);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "Jev result supplied: finding" }).count(), 0);
  const awaitingJev = page.locator(".topology-node").filter({ hasText: "Awaiting Jev result" });
  assert.equal(await awaitingJev.count(), 1);
  const externalResultRoute = page.locator(".topology-route").filter({ hasText: "Awaiting Jev result → Review outcomes" });
  assert.equal(await externalResultRoute.count(), 1);
  assert.equal(await externalResultRoute.evaluate((node) => node.classList.contains("active")), false);

  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "interrupted is a distinct observed request result and duplicate is rejected" });
  await waitForText(".canonical-progress", "Guided step 0 of 9");
  await advanceGuided(1, 7, 9);
  await waitForText(".canonical-progress", "Guided step 7 of 9");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "request interruption recorded" }).count(), 1);
  await canonical.getByRole("button", { name: /^Next:/ }).click();
  await waitForText(".canonical-progress", "Guided step 8 of 9");
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "Jev result supplied: interrupted" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "Jev result supplied: finding" }).count(), 0);

  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "many units admit in order and Stop waits" });
  await waitForText(".canonical-progress", "Guided step 0 of 7");
  await advanceGuided(1, 4, 7);
  await waitForText(".canonical-progress", "Guided step 4 of 7");
  assert.equal(await page.locator(".finish-branch.active").filter({ hasText: "Wait for work" }).count(), 1);
  assert.match(await page.locator(".finish-decision").innerText(), /Advice output authorized.*Continuation consumed.*Allow finish.*Cancel unfinished work/s);
  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: "deadline requests exact cancellations" });
  await waitForText(".canonical-progress", "Guided step 0 of 4");
  await advanceGuided(1, 3, 4);
  await waitForText(".canonical-progress", "Guided step 3 of 4");
  assert.equal(await page.locator(".finish-branch.active").filter({ hasText: "Cancel unfinished work" }).count(), 1);
  assert.equal(await page.locator(".finish-branch.active").filter({ hasText: "Decision ready" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "request interruption recorded" }).count(), 0);
  assert.equal(await page.locator(".topology-node.active").filter({ hasText: "Jev request attempt" }).count(), 0);

  await canonical.getByRole("button", { name: "Reset replay" }).click();
  await waitForText(".canonical-progress", "history 0/");
  const dispatchTrace = dispatchFixture.traces.find((trace) => trace.name === "available preparation starts immediately and reordered callbacks settle");
  assert.ok(dispatchTrace);
  for (let index = 0; index < 5; index++) await applyManual(dispatchTrace.events[index], index + 1);
  assert.match(await page.locator(".topology-capacities").innerText(), /Preparation running: 2\/8/);
  assert.match(await page.locator(".topology-node").filter({ hasText: "Job scheduling" }).textContent(), /2 running preparation jobs/);
  for (let index = 5; index < 10; index++) await applyManual(dispatchTrace.events[index], index + 1);
  await waitForText(".topology-step", "dispatchSettled");
  assert.match(await page.locator(".topology-node").filter({ hasText: "Job scheduling" }).textContent(), /2 running preparation jobs/);
  assert.match(await page.locator(".topology-capacities").innerText(), /Preparation running: 2\/8/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "(pending) → dispatch" }).count(), 0);

  await canonical.getByRole("button", { name: "Reset replay" }).click();
  await waitForText(".canonical-progress", "history 0/");
  const leaseTrace = collectionFixture.traces.find((trace) => trace.name === "one edit completes before advice becomes ready and exact lease excludes overlap");
  assert.ok(leaseTrace);
  let leasePosition = 0;
  for (const [index, event] of leaseTrace.events.entries()) {
    await applyManual(event, ++leasePosition);
    for (const command of event.expect.split(","))
      assert.ok((await page.locator(".topology-step").innerText()).includes(command), `fixture step ${index}: ${command}`);
    if ([12, 13, 14, 15, 16, 18].includes(index))
      assert.match(await page.locator(".topology-node").filter({ hasText: "Ready advice" }).textContent(), /1 lease: Advice #1\/operation 3/);
    if ([17, 19, 20].includes(index))
      assert.match(await page.locator(".topology-node").filter({ hasText: "Ready advice" }).textContent(), /0 leases/);
    if (event.kind === "reviewCompleted")
      assert.match(await page.locator(".topology-unmapped-relations").innerText(), /Review work items → Review outcomes/);
    if (index === 11)
      assert.equal(await page.locator(".topology-route.active").filter({ hasText: "advice eligible or selected" }).count(), 1);
  }
  await canonical.getByRole("button", { name: "Reset replay" }).click();
  await waitForText(".canonical-progress", "history 0/");
  const backgroundTrace = collectionFixture.traces.find((trace) => trace.name === "background writer claim expires by supplied clock fact");
  assert.ok(backgroundTrace);
  await applyManual(backgroundTrace.events[0], 1);
  assert.match(await page.locator(".topology-step").innerText(), /collectionBackgroundClaimed/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "advice eligible or selected" }).count(), 1);
  for (let index = 1; index < 5; index++) await applyManual(backgroundTrace.events[index], index + 1);
  assert.match(await page.locator(".topology-step").innerText(), /collectionBackgroundReleased/);
  await applyManual(backgroundTrace.events[5], 6);
  assert.match(await page.locator(".topology-step").innerText(), /collectionBackgroundClaimed/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "advice eligible or selected" }).count(), 1);

  const { ALTERNATE_LEDGER_LIMITS_SCENARIO, replayCanonical } = await server.ssrLoadModule("/src/canonical-replay.ts");
  const alternate = ALTERNATE_LEDGER_LIMITS_SCENARIO;
  const baseline = replayCanonical([], 0).projection;
  const alternateInitial = replayCanonical([], 0, alternate.limits).projection;
  assert.notDeepEqual(alternateInitial.limits, baseline.limits);
  assert.deepEqual(alternateInitial.limits, alternate.limits);
  await canonical.getByLabel("Guided scenario", { exact: true }).selectOption({ label: alternate.name });
  await waitForText(".canonical-progress", "Guided step 0 of 2");
  assert.ok((await page.locator(".topology-capacities").innerText()).includes(
    `Review capacity ledger: ${alternateInitial.global.items}/${alternateInitial.limits.globalItems} items; ${alternateInitial.global.bytes}/${alternateInitial.limits.globalBytes} bytes`));
  assert.ok((await canonical.innerText()).includes(
    `${alternateInitial.global.items}/${alternateInitial.limits.globalItems} work items · ${alternateInitial.global.bytes}/${alternateInitial.limits.globalBytes} reserved review bytes`));
  for (let step = 1; step <= alternate.events.length; step++) {
    await canonical.getByRole("button", { name: /^Next:/ }).click();
    await waitForText(".canonical-progress", `Guided step ${step} of ${alternate.events.length}`);
  }
  const alternateAfter = replayCanonical(alternate.events.map((event) => ({ event, origin: "guided" })), alternate.events.length, alternate.limits).projection;
  assert.equal(alternateAfter.global.items, 1);
  assert.equal(alternateAfter.global.bytes, 20);
  assert.ok((await page.locator(".topology-capacities").innerText()).includes(
    `Review capacity ledger: ${alternateAfter.global.items}/${alternateAfter.limits.globalItems} items; ${alternateAfter.global.bytes}/${alternateAfter.limits.globalBytes} bytes`));
  assert.ok((await canonical.locator(".capacity-rows").innerText()).includes(
    `Agent 1 · ${alternateAfter.partitions[0].items}/${alternateAfter.limits.partitionItems} work items · ${alternateAfter.partitions[0].bytes}/${alternateAfter.limits.partitionBytes} reserved bytes`));
  assert.match(await page.locator(".topology-capacities").innerText(), /Preparation running: 0\/8.*Jev in-flight: 0\/8/s);
  const coverage = page.locator(".flow-coverage");
  await coverage.locator("summary").click();
  assert.match(await coverage.innerText(), /Jev ready, command, attempt and terminal facts · guided:/);
  assert.match(await coverage.innerText(), /Background and Stop collection, leases and expiry · guided: collectionReady/);
  assert.match(await coverage.innerText(), /Native facts and effects outside Bend/);
  assert.equal(await coverage.getByRole("link", { name: "Bend source" }).count(), 12);

  await canonical.getByRole("button", { name: "Reset replay" }).click();
  await waitForText(".canonical-progress", "history 0/");
  await applyManual({ kind: "collectionFindingCheck", selectionPartition: 1, selectionRound: 1,
    unit: 1, partition: 1, round: 1, snapshot: 1, currentSnapshot: 1,
    credential: 0, currentCredential: 0, ageMs: 0, soloBytes: 100,
    collectionReady: true, selectedCount: 6, prospectiveBytes: 10241 }, 1);
  assert.match(await page.locator(".topology-step").innerText(), /collectionFindingRetained/);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "collection waits or retains advice" }).count(), 1);
  assert.equal(await page.locator(".topology-route.active").filter({ hasText: "retain finding command" }).count(), 0);
  for (const deadlineReached of [false, true]) {
    await canonical.getByRole("button", { name: "Reset replay" }).click();
    await waitForText(".canonical-progress", "history 0/");
    await applyManual({ kind: "finishReserve", group: 1, lifetime: 1, round: 1,
      attempt: 7, token: 8, selected: [], hasNotice: false, passNotices: true,
      canWrite: true, bindingValid: true, deadlineReached }, 1);
    assert.match(await page.locator(".topology-step").innerText(),
      deadlineReached ? /finishAllowedDeadline/ : /finishAllowedNoAdvice/);
    assert.equal(await page.locator(".topology-route.active").filter({ hasText: "collection waits or retains advice" }).count(), 1);
    assert.equal(await page.locator(".topology-route.active").filter({ hasText: "output fact changes round" }).count(), 0);
    assert.equal(await page.locator(".topology-route.active").filter({ hasText: "output authorized" }).count(), 0);
  }
  const imports = page.locator("#import-graph");
  assert.match(await imports.innerText(), /Native: resolution, permission facts, source capture/);
  for (let step = 1; step <= 9; step++) {
    await imports.getByRole("button", { name: "Next import step", exact: true }).click();
    await waitForText(".import-graph-progress", `Import step ${step} of 9`);
  }
  assert.match(await imports.locator(".import-graph-facts").innerText(), /A.ts · incomplete/);
  assert.doesNotMatch(await imports.locator(".import-graph-facts").innerText(), /D.ts/);
  assert.match(await page.locator("#timing-diagrams").innerText(), /When advice can reach the agent/);
  assert.deepEqual(errors, []);
  console.log("Browser controls passed: canonical replay/history, changed checked ledger limits, ordered capacity, dispatch queue, collection leases/background claims, stale findings, execution counters, ninth Jev refusal, unsent/interrupted routes, Stop fork, coverage inventory, import graph, and native timing.");
} finally {
  await browser?.close();
  await server.close();
}

await import("./check-compiled-limits.mjs");
