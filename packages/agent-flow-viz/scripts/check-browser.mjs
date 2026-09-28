import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

// Focused browser check of the controls changed by the Bend UI migration.
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

  assert.match(await page.locator(".page-header").innerText(), /COMPILED BEND FLOW MODEL/);
  assert.match(await page.locator(".policy-scope").innerText(), /not a trace of the production resident/);
  const closedStop = page.locator(".event-row").filter({ hasText: "finish attempt; runtime calls Stop hook" }).first();
  assert.equal(await closedStop.isDisabled(), true);
  assert.match(await closedStop.innerText(), /This virtual round is closed/);

  await page.getByRole("button", { name: /^Next: proven fresh edit admitted/ }).click();
  await waitForText(".progress", "Guided step 1 of 13");
  assert.match(await page.locator(".progress").innerText(), /Guided step 1 of 13/);
  assert.match(await page.locator(".state-line").innerText(), /Virtual round 1 \(active\)/);
  await page.getByRole("button", { name: /^Previous:/ }).click();
  await waitForText(".progress", "Guided step 0 of 13");
  assert.match(await page.locator(".progress").innerText(), /Guided step 0 of 13/);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await waitForText(".progress", "Guided step 1 of 13");
  assert.match(await page.locator(".progress").innerText(), /Guided step 1 of 13/);

  await page.getByRole("button", { name: "Finish-decision wait expires", exact: true }).click();
  await waitForText(".progress", "Guided step 0 of 5");
  for (let step = 0; step < 4; step++) {
    await page.getByRole("button", { name: /^Next:/ }).click();
    await waitForText(".progress", `Guided step ${step + 1} of 5`);
  }
  assert.match(await page.locator(".state-line").innerText(), /Virtual round 1 \(closed\)/);
  assert.match(await page.locator(".finish-panel").innerText(), /Cancel Jev requests: #1/);
  assert.match(await page.locator(".status").first().innerText(), /allow-finish response/);
  await page.getByRole("button", { name: /^Previous:/ }).click();
  await waitForText(".progress", "Guided step 3 of 5");
  assert.match(await page.locator(".state-line").innerText(), /Virtual round 1 \(active\)/);
  await page.getByRole("button", { name: /^Redo:/ }).click();
  await waitForText(".progress", "Guided step 4 of 5");
  assert.match(await page.locator(".state-line").innerText(), /Virtual round 1 \(closed\)/);

  await page.getByRole("button", { name: "Send advice after a tool" }).click();
  await waitForText(".progress", "Guided step 0 of 5");
  const sourceCapacity = page.getByLabel("Concurrent source readings");
  await sourceCapacity.fill("1");
  await sourceCapacity.press("Tab");
  await waitForText(".status", "Source-reading capacity set to 1");
  await page.locator(".event-row.available").filter({ hasText: "proven fresh edit admitted" }).first().click();
  await waitForText(".state-line", "Virtual round 1 (active)");
  assert.match(await page.locator(".state-line").innerText(), /source readings 1\/1/);
  assert.match(await page.locator(".progress").innerText(), /2 manual events/);
  const imports = page.locator("#import-graph");
  assert.match(await imports.innerText(), /Native: resolution, permission facts, source capture/);
  const fileDiagram = imports.locator("svg").first();
  assert.match(await fileDiagram.textContent(), /IMPORT \/ REFERENCE GRAPH/);
  assert.match(await imports.locator("svg").nth(1).textContent(), /TreeLimit: skip that import, inspect later edges/);
  assert.equal(await imports.locator(".trace-options button").count(), 2);
  assert.doesNotMatch(await fileDiagram.textContent(), /C\.ts|Excluded/, "future outcomes are absent before replay");
  for (let step = 1; step <= 9; step++) {
    await imports.getByRole("button", { name: "Next import step", exact: true }).click();
    await waitForText(".import-graph-progress", `Import step ${step} of 9`);
  }
  assert.match(await imports.locator(".import-graph-facts").innerText(), /A.ts · incomplete/);
  assert.doesNotMatch(await imports.locator(".import-graph-facts").innerText(), /D.ts/);
  assert.match(await imports.locator(".import-graph-facts").innerText(), /Jev: no request for this unit/);
  assert.match(await fileDiagram.textContent(), /A\.ts.*B\.ts.*C\.ts/s);
  assert.doesNotMatch(await fileDiagram.textContent(), /D\.ts/);
  assert.match(await fileDiagram.textContent(), /A\.ts review unit · incomplete/);
  assert.match(await fileDiagram.textContent(), /C\.tsExcluded/);
  assert.match(await fileDiagram.textContent(), /A\.tscaptured rootaccepted tree \+400 Baccepted source 1000 B/);
  assert.match(await fileDiagram.textContent(), /C\.tsExcludedtree size unknownsource size unknown/);
  await imports.getByRole("button", { name: "Previous import step", exact: true }).click();
  await waitForText(".import-graph-progress", "Import step 8 of 9");
  await imports.getByRole("button", { name: "Cumulative tree cap skips E and G", exact: true }).click();
  await waitForText(".import-graph-progress", "Import step 0 of 29");
  assert.equal(await imports.getByRole("button", { name: "Previous import step", exact: true }).isDisabled(), true);
  const budget = imports.locator(".import-tree-budget");
  const bar = budget.getByRole("img");
  assert.match(await bar.getAttribute("aria-label"), /0 KiB of 20 KiB accepted; 20 KiB remaining/);
  assert.equal(await budget.locator(".import-tree-segment").count(), 0);
  for (let step = 1; step <= 29; step++) {
    await imports.getByRole("button", { name: "Next import step", exact: true }).click();
    await waitForText(".import-graph-progress", `Import step ${step} of 29`);
    if (step === 12) {
      assert.match(await fileDiagram.textContent(), /X\.tsExcludedtree size unknownsource size unknown/);
      assert.match(await imports.locator(".import-graph-facts").innerText(), /Import skipped for denied permission: yes/);
    }
    if (step === 20) {
      assert.match(await fileDiagram.textContent(), /E\.tsTreeLimitreported tree \+2048 B.*accepted total 19456 B/s);
      assert.match(await imports.locator(".import-graph-facts").innerText(), /A.ts · ready/);
      assert.match(await bar.getAttribute("aria-label"), /19 KiB of 20 KiB accepted; 1 KiB remaining/);
      assert.deepEqual(await budget.locator(".import-tree-segment").allTextContents(), ["A", "B", "C", "D"]);
      assert.equal(await budget.locator(".import-tree-remaining").evaluate((element) => element.style.width), "5%");
      assert.match(await budget.locator(".import-tree-skipped").innerText(), /E.ts \(2 KiB reported\)/);
    }
  }
  assert.match(await bar.getAttribute("aria-label"), /20 KiB of 20 KiB accepted; 0 KiB remaining/);
  assert.deepEqual(await budget.locator(".import-tree-segment").allTextContents(), ["A", "B", "C", "D", "F"]);
  assert.deepEqual(await budget.locator(".import-tree-segment").evaluateAll((elements) => elements.map((element) => element.style.width)), ["25%", "25%", "25%", "20%", "5%"]);
  assert.equal(await budget.locator(".import-tree-remaining").count(), 0);
  assert.match(await budget.locator(".import-tree-contributions").innerText(), /F.ts: 1 KiB accepted; cumulative 20 KiB/);
  assert.match(await budget.locator(".import-tree-skipped").innerText(), /E.ts \(2 KiB reported\), G.ts \(2 KiB reported\)/);
  assert.match(await fileDiagram.textContent(), /A\.ts.*B\.ts.*C\.ts.*X\.ts.*D\.ts.*E\.ts.*F\.ts.*G\.ts/s);
  const filePosition = async (name) => {
    const label = fileDiagram.locator("text").filter({ hasText: new RegExp(`^${name.replace(".", "\\.")}$`) });
    return { x: Number(await label.getAttribute("x")), y: Number(await label.getAttribute("y")) };
  };
  const [a, b, c, d, e, f, g, x] = await Promise.all(["A.ts", "B.ts", "C.ts", "D.ts", "E.ts", "F.ts", "G.ts", "X.ts"].map(filePosition));
  assert.ok(a.x < b.x && b.x < d.x, "root, children, and grandchildren occupy separate tree columns");
  assert.equal(b.x, c.x);
  assert.equal(c.x, x.x);
  assert.ok([d, e, f, g].every((file) => file.x === d.x));
  assert.ok(d.y < e.y && e.y < f.y && f.y < g.y, "the four leaves occupy separate rows");
  assert.match(await fileDiagram.textContent(), /B\.tscaptured supportaccepted tree \+5120 B.*accepted total 10240 B/s);
  assert.match(await fileDiagram.textContent(), /F\.tscaptured supportaccepted tree \+1024 B.*accepted total 20480 B/s);
  assert.match(await fileDiagram.textContent(), /G\.tsTreeLimitreported tree \+2048 B.*accepted total 20480 B/s);
  assert.match(await fileDiagram.textContent(), /X\.tsExcludedtree size unknownsource size unknown/);
  assert.match(await imports.locator(".import-graph-facts").innerText(), /A.ts · incomplete \(TreeLimit\)/);
  assert.match(await imports.locator(".import-graph-facts").innerText(), /accepted tree bytes: 20480\/20480/);
  assert.match(await imports.locator(".import-graph-facts").innerText(), /Import skipped for remaining tree budget: yes/);
  for (let step = 28; step >= 23; step--) {
    await imports.getByRole("button", { name: "Previous import step", exact: true }).click();
    await waitForText(".import-graph-progress", `Import step ${step} of 29`);
  }
  assert.match(await bar.getAttribute("aria-label"), /19 KiB of 20 KiB accepted; 1 KiB remaining/);
  assert.deepEqual(await budget.locator(".import-tree-segment").allTextContents(), ["A", "B", "C", "D"]);
  await page.setViewportSize({ width: 390, height: 844 });
  const barBounds = await bar.boundingBox();
  assert.ok(barBounds.x >= 0 && barBounds.x + barBounds.width <= 390, "tree bar fits the mobile viewport");
  await imports.getByRole("button", { name: "Reset import example", exact: true }).click();
  await waitForText(".import-graph-progress", "Import step 0 of 29");
  assert.match(await bar.getAttribute("aria-label"), /0 KiB of 20 KiB accepted; 20 KiB remaining/);
  assert.equal(await budget.locator(".import-tree-segment").count(), 0);
  assert.deepEqual(errors, []);
  console.log("Browser controls passed: guided, manual, disabled rejection, capacity, finish, rewind, redo, and independent import exploration");
} finally {
  await browser?.close();
  await server.close();
}
