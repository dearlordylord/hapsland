import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 1300 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const ensemble = page.locator("#agent-ensemble");
  const inspector = page.locator("#agent-simulation");
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = async name => { await settle(); await page.getByRole("button", { name, exact: true }).click(); await settle(); };
  await page.getByLabel("Agent count", { exact: true }).fill("3");
  await click("Start resident");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 3);
  assert.equal(await ensemble.locator(".ensemble-connector").count(), 4);
  const layerOpacity = () => ensemble.locator(".ensemble-layer").evaluateAll(layers => layers.map(layer => getComputedStyle(layer).opacity));
  await ensemble.getByRole("button", { name: "Select agent 2", exact: true }).hover();
  assert.deepEqual(await layerOpacity(), ["0.1", "1", "0.1"]);
  assert.equal(await ensemble.locator(".ensemble-agent.selected").getAttribute("aria-label"), "Select agent 1", "hover must not change selection");
  assert.equal(await ensemble.locator(".topology-resource.capacity").count(), 3);
  assert.equal(await ensemble.locator(".topology-resource.jev").count(), 3);
  assert.match(await ensemble.locator(".topology-resource.capacity").first().getAttribute("aria-label"), /Admission & capacity.*one shared resident ledger/);
  assert.match(await ensemble.locator(".topology-resource.jev").first().getAttribute("aria-label"), /Jev request attempt.*simulated responses/);
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-hover.png" });
  await ensemble.locator(".ensemble-heading").hover();
  assert.deepEqual(await layerOpacity(), ["1", "1", "1"], "leaving the card restores the stack");
  await page.keyboard.press("Tab");
  await ensemble.getByRole("button", { name: "Select agent 3", exact: true }).focus();
  assert.deepEqual(await layerOpacity(), ["0.1", "0.1", "1"], "keyboard focus also reveals its layer");
  await page.getByLabel("Agent count", { exact: true }).focus();
  assert.deepEqual(await layerOpacity(), ["1", "1", "1"]);
  const viewport = ensemble.locator(".ensemble-viewport");
  const bounds = await viewport.boundingBox();
  const beforeTransform = await ensemble.locator(".ensemble-scene").getAttribute("style");
  await page.mouse.move(bounds.x + 70, bounds.y + 150);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 340, bounds.y + 110, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Rotation"]').value) > 35);
  assert.notEqual(await ensemble.locator(".ensemble-scene").getAttribute("style"), beforeTransform);
  assert.ok(Number(await page.getByLabel("Tilt", { exact: true }).inputValue()) > 48);
  assert.equal(await ensemble.locator(".is-dragging").count(), 0);
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-drag.png" });
  await click("Reset view");
  // A drag beginning on a stage must not activate that stage on release.
  const stage = ensemble.locator(".ensemble-layer").last().locator('.topology-node[role="button"]').first();
  const stageBounds = await stage.boundingBox();
  await page.mouse.move(stageBounds.x + stageBounds.width / 2, stageBounds.y + stageBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(stageBounds.x + stageBounds.width / 2 + 50, stageBounds.y + stageBounds.height / 2, { steps: 5 });
  await page.mouse.up();
  await settle();
  assert.equal(await ensemble.locator(".ensemble-panel.is-flat").count(), 0);
  assert.ok(await ensemble.evaluate(element => element.classList.contains("is-spatial")));
  await click("Reset view");
  await stage.click();
  await page.waitForFunction(() => document.querySelector("#agent-ensemble")?.classList.contains("is-flat"));
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 1, "a click still opens agent inspection");
  const flatTransform = await ensemble.locator(".ensemble-scene").getAttribute("style");
  await page.mouse.move(bounds.x + 60, bounds.y + 120);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 180, bounds.y + 150, { steps: 4 });
  await page.mouse.up();
  assert.equal(await ensemble.locator(".ensemble-scene").getAttribute("style"), flatTransform);
  await click("3D layers");
  await click("Reset view");
  for (let i = 0; i < 36; i++) await click("Step resident");
  const events = [];
  const replays = [];
  for (let i = 0; i < 3; i++) {
    await click(`Select agent ${i + 1}`);
    events.push(await inspector.locator(".simulation-details pre").textContent());
    await click("Export replay");
    replays.push(JSON.parse(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue()));
  }
  assert.equal(new Set(replays[0].config.sessions.map(session => session.seed)).size, 3);
  assert.deepEqual(replays[0].config.sessions.map(session => session.agent), ["agent-1", "agent-2", "agent-3"]);
  assert.deepEqual(replays[1], replays[0], "agent selection must not change the resident replay");
  assert.deepEqual(replays[2], replays[0]);
  assert.equal(new Set(events).size, 1, "all agents inspect the same resident event");
  assert.equal(await ensemble.locator(".shared-jev").count(), 0, "superseded external pool panel is removed");
  assert.equal(await ensemble.locator(".stage-jev-pool").count(), await ensemble.locator(".ensemble-layer").count());
  for (const pool of await ensemble.locator(".stage-jev-pool").all()) assert.equal(await pool.locator(".stage-jev-slot").count(), 8);
  await click("Select agent 2");
  await inspector.getByLabel("Edit interval (virtual ms)", { exact: true }).fill("731");
  await click("Apply edit pace");
  await click("Export replay");
  assert.equal(JSON.parse(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue()).controls.at(-1).control.intervalMs, 731);
  await click("Select agent 1");
  assert.equal(await inspector.getByLabel("Edit interval (virtual ms)", { exact: true }).inputValue(), "100");
  await click("Export replay");
  const sharedReplay = JSON.parse(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue());
  assert.equal(sharedReplay.controls.at(-1).control.agent, "agent-2", "targeted control remains in the one shared replay");
  assert.equal(sharedReplay.controls.at(-1).control.intervalMs, 731);
  const currentEvent = await inspector.locator(".simulation-details pre").textContent();
  await click("Load replay");
  assert.equal(await inspector.locator(".simulation-details pre").textContent(), currentEvent);
  assert.equal(await inspector.getByLabel("Edit interval (virtual ms)", { exact: true }).inputValue(), "100", "replay restore selects agent 1 controls, not the latest other-agent control");
  // A pending file read is resident-owned; resetting the resident cancels stale reads.
  await page.evaluate(() => {
    window.originalFileText = File.prototype.text;
    File.prototype.text = function () { return new Promise(resolve => { window.finishReplayRead = resolve; }); };
  });
  const chooserPromise = page.waitForEvent("filechooser");
  await click("Import replay file");
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "pending-replay.json", mimeType: "application/json", buffer: Buffer.from("late file contents") });
  await page.waitForFunction(() => typeof window.finishReplayRead === "function");
  await click("Select agent 2");
  await click("Start resident");
  const unchangedReplay = await inspector.getByLabel("Replay JSON", { exact: true }).inputValue();
  await page.evaluate(() => { window.finishReplayRead("late file contents"); File.prototype.text = window.originalFileText; });
  await settle();
  assert.equal(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue(), unchangedReplay);
  await click("Select agent 1");
  await page.getByLabel("Agent count", { exact: true }).fill("");
  await click("Start resident");
  assert.match(await ensemble.locator(".ensemble-feedback").textContent(), /integer from 1 to 6/);
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 3);
  await page.getByLabel("Agent count", { exact: true }).fill("3");
  await click("Play resident");
  await page.waitForFunction(() => [...document.querySelectorAll('.ensemble-agent')].every(node => Number(node.textContent.match(/· (\d+) retained events/)[1]) > 10));
  await click("Pause resident");
  await page.waitForFunction(() => [...document.querySelectorAll(".ensemble-agent")].every(node => node.textContent.includes("Paused")));
  assert.ok((await ensemble.locator(".ensemble-agent").allTextContents()).every(text => text.includes("Paused")));
  // Load a checked three-generator history that exhausts the one shared pool.
  const saturation = await page.evaluate(async module => {
    const { createRun } = await import(module);
    const run = createRun({ seed: 7, jevDelay: 1000000,
      limits: { globalItems: 64, globalBytes: 8000, partitionItems: 16, partitionBytes: 4000 },
      sessions: Array.from({ length: 3 }, (_, index) => ({ agent: `agent-${index + 1}`, seed: index + 7,
        editIntervalMs: 1, variationMs: 0, editsPerTask: 1024, bytes: 100 })),
    });
    for (let i = 0; i < 3000 && run.projection.dispatch.requests.length < 8; i++) run.step();
    return { replay: run.exportReplay(), projection: run.projection, observations: run.observations };
  }, `/@fs${fileURLToPath(new URL("../../monkey-business/src/index.ts", import.meta.url))}`);
  assert.equal(saturation.projection.dispatch.requests.length, 8);
  assert.ok(new Set(saturation.projection.dispatch.requests.map(request => request.partition)).size > 1);
  await inspector.getByLabel("Replay JSON", { exact: true }).fill(JSON.stringify(saturation.replay));
  await click("Load replay");
  for (const pool of await ensemble.locator(".stage-jev-pool").all()) {
    assert.equal(await pool.locator(".stage-jev-slot.occupied").count(), 8, "each layer mirrors the same resident pool");
    assert.equal(await pool.locator(".stage-jev-total").textContent(), "8 / 8");
  }
  const poolOwners = await ensemble.locator(".stage-jev-pool").evaluateAll(pools => pools.map(pool => Array.from(pool.querySelectorAll(".stage-jev-slot"), slot => [slot.getAttribute("aria-label"), slot.querySelector("rect").getAttribute("fill")])));
  for (const owners of poolOwners) assert.deepEqual(owners, poolOwners[0], "all layers use the same global owners and agent colors");
  assert.match(await ensemble.locator(".shared-capacity-total").textContent(), new RegExp(`^${saturation.projection.global.items} / 64 items · ${saturation.projection.global.bytes} / 8000 bytes$`));
  const times = await ensemble.locator(".ensemble-layer-title span").allTextContents();
  assert.equal(new Set(times.map(text => text.split(" · ")[0])).size, 1, "all layers share the same resident time");
  await ensemble.screenshot({ path: "/tmp/hapsland-shared-resident.png" });
  const finalResourceText = await ensemble.locator(".shared-resident").textContent();
  await click("Previous event");
  const prior = JSON.parse(await inspector.locator(".simulation-details pre").textContent());
  assert.match(await ensemble.locator(".shared-capacity-total").textContent(), new RegExp(`^${prior.after.global.items} /`));
  for (const pool of await ensemble.locator(".stage-jev-pool").all()) assert.equal(await pool.locator(".stage-jev-slot.occupied").count(), prior.after.dispatch.requests.length);
  await click("Return to latest");
  assert.equal(await ensemble.locator(".shared-resident").textContent(), finalResourceText);
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-three.png" });
  await click("Focus selected agent");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 1);
  assert.equal(await ensemble.locator('.topology-node[role="button"]').count(), 14);
  await ensemble.getByRole("button", { name: "Inspect Ready advice", exact: true }).click();
  await settle();
  assert.match(await inspector.locator(".simulation-stage-inspector").textContent(), /Focused lifecycle and state/);
  // Focus view exposes the two resource contacts on their actual diagram stages.
  assert.equal(await ensemble.locator(".topology-resource").count(), 2);
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-focus.png" });
  await click("3D layers");
  await page.getByLabel("Agent count", { exact: true }).fill("6");
  await click("Start resident");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 6);
  // At the default camera all six complete layer bounds fit vertically.
  const fit = await ensemble.evaluate(node => {
    const viewport = node.querySelector('.ensemble-viewport').getBoundingClientRect();
    return [...node.querySelectorAll('.ensemble-layer')].every(layer => {
      const rect = layer.getBoundingClientRect();
      return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
    });
  });
  assert.ok(fit, "six-agent default camera should fit all layers");
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-six.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await click("Focus selected agent");
  assert.ok(await ensemble.getByRole("button", { name: "Select agent 6", exact: true }).isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "mobile page should not overflow horizontally");
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-mobile.png" });
  // Real touch events exercise browser pan arbitration and pointer cancellation.
  const touchPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  touchPage.on("pageerror", error => errors.push(error.message));
  await touchPage.goto(server.resolvedUrls.local[0]);
  const touchViewport = touchPage.locator(".ensemble-viewport");
  await touchViewport.evaluate(element => element.scrollIntoView({ block: "center" }));
  const touchBounds = await touchViewport.boundingBox();
  const cdp = await touchPage.context().newCDPSession(touchPage);
  const swipe = async (dx, dy) => {
    const x = touchBounds.x + 100;
    const y = Math.max(100, touchBounds.y + 180);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe(120, 0);
  await touchPage.waitForFunction(() => Number(document.querySelector('[aria-label="Rotation"]').value) > -16);
  const touchTurn = await touchPage.getByLabel("Rotation", { exact: true }).inputValue();
  const scrollBefore = await touchPage.evaluate(() => window.scrollY);
  await swipe(0, -130);
  await touchPage.waitForFunction(before => window.scrollY > before, scrollBefore);
  assert.equal(await touchPage.getByLabel("Rotation", { exact: true }).inputValue(), touchTurn, "vertical touch scroll must not rotate the scene");
  assert.equal(await touchPage.locator(".is-dragging").count(), 0);
  await touchPage.close();
  assert.deepEqual(errors, []);
  console.log("Ensemble browser checks passed: independent generators, targeted controls, shared resident replay/resources, global playback, count validation, focus, six-layer fit, mobile layout, mouse drag, stage click preservation, touch orbit/scroll, transient layer reveal and stage-linked infrastructure contacts.");
} finally {
  await browser?.close();
  await server.close();
}
