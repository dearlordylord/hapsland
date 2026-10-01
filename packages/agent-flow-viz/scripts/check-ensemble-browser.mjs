import assert from "node:assert/strict";
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
  await click("Start ensemble");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 3);
  assert.equal(await ensemble.locator(".ensemble-connector").count(), 4);
  for (let i = 0; i < 36; i++) await click("Step all");
  const events = [];
  const replays = [];
  for (let i = 0; i < 3; i++) {
    await click(`Select agent ${i + 1}`);
    events.push(await inspector.locator(".simulation-details pre").textContent());
    await click("Export replay");
    replays.push(JSON.parse(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue()));
  }
  assert.equal(new Set(replays.map(replay => replay.config.seed)).size, 3);
  assert.deepEqual(replays.map(replay => replay.config.session.agent), ["agent-1", "agent-2", "agent-3"]);
  assert.equal(new Set(events).size, 3, "independent generators must produce distinct event/state traces");
  await click("Select agent 2");
  await inspector.getByLabel("Edit interval (virtual ms)", { exact: true }).fill("731");
  await click("Apply edit pace");
  await click("Export replay");
  assert.equal(JSON.parse(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue()).controls.at(-1).control.intervalMs, 731);
  await click("Select agent 1");
  assert.equal(await inspector.getByLabel("Edit interval (virtual ms)", { exact: true }).inputValue(), "100");
  await click("Export replay");
  assert.deepEqual(JSON.parse(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue()).controls, replays[0].controls);
  const currentEvent = await inspector.locator(".simulation-details pre").textContent();
  await click("Load replay");
  assert.equal(await inspector.locator(".simulation-details pre").textContent(), currentEvent);
  // A pending file read must never write into another agent after switching.
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
  const unchangedReplay = await inspector.getByLabel("Replay JSON", { exact: true }).inputValue();
  await page.evaluate(() => { window.finishReplayRead("late file contents"); File.prototype.text = window.originalFileText; });
  await settle();
  assert.equal(await inspector.getByLabel("Replay JSON", { exact: true }).inputValue(), unchangedReplay);
  await click("Select agent 1");
  await page.getByLabel("Agent count", { exact: true }).fill("");
  await click("Start ensemble");
  assert.match(await ensemble.locator(".ensemble-feedback").textContent(), /integer from 1 to 6/);
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 3);
  await page.getByLabel("Agent count", { exact: true }).fill("3");
  await click("Play all");
  await page.waitForFunction(() => [...document.querySelectorAll('.ensemble-agent')].every(node => Number(node.textContent.match(/· (\d+) events/)[1]) > 36));
  await click("Pause all");
  await page.waitForFunction(() => [...document.querySelectorAll(".ensemble-agent")].every(node => node.textContent.includes("Paused")));
  assert.ok((await ensemble.locator(".ensemble-agent").allTextContents()).every(text => text.includes("Paused")));
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-three.png" });
  await click("Focus selected agent");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 1);
  assert.equal(await ensemble.locator('.topology-node[role="button"]').count(), 14);
  await ensemble.getByRole("button", { name: "Inspect Ready advice", exact: true }).click();
  await settle();
  assert.match(await inspector.locator(".simulation-stage-inspector").textContent(), /Focused lifecycle and state/);
  await ensemble.screenshot({ path: "/tmp/hapsland-ensemble-focus.png" });
  await click("3D layers");
  await page.getByLabel("Agent count", { exact: true }).fill("6");
  await click("Start ensemble");
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
  assert.deepEqual(errors, []);
  console.log("Ensemble browser checks passed: independent streams, agent-scoped controls/replay, global playback, count validation, focus, six-layer fit and mobile layout.");
} finally {
  await browser?.close();
  await server.close();
}
