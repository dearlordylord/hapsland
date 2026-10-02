import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

// One bounded, fixed six-agent workload. Simulator execution is outside the
// timed camera exercise; timings describe this browser/host, not native throughput.
// Optional --baseline=COMMIT serves that commit's renderer for a comparison.
const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = process.argv.find(arg => arg.startsWith("--baseline="))?.slice(11);
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const rendererFiles = ["fleet-simulation.ts", "production-main.ts", "production-flow-view.ts"]
  .map(name => `packages/agent-flow-viz/src/${name}`)
  .concat("packages/agent-flow-projection/src/index.ts");
const baselineSources = baseline ? new Map(rendererFiles.map(name => [
  `${repository}${name}`, execFileSync("git", ["show", `${baseline}:${name}`], { cwd: root, encoding: "utf8" }),
])) : new Map();
const server = await createServer({ root, logLevel: "silent",
  plugins: [{ name: "renderer-comparison", enforce: "pre", load: id => baselineSources.get(id) }],
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = async name => { await page.getByRole("button", { name, exact: true }).click(); await settle(); };
  await page.getByLabel("Agent count", { exact: true }).fill("6");
  await click("Start resident");
  const processed = await page.evaluate(async () => {
    const { simulationRun } = await import("/src/simulation.ts");
    const run = simulationRun();
    run.advance({ untilTime: 1_000_000, maxEvents: 600 });
    return run.eventCount;
  });
  assert.equal(processed, 600);
  await click("Step resident");
  const ensemble = page.locator("#agent-ensemble");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 6);
  const detailsBefore = await page.locator(".simulation-details pre").textContent();
  const diagramsBefore = await ensemble.locator(".topology-scroll").allInnerTexts();
  const beforeTransform = await ensemble.locator(".ensemble-scene").getAttribute("style");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await page.getByLabel("Rotation", { exact: true }).focus();
  // Warm the renderer cache before measuring camera-only updates.
  await page.keyboard.press("ArrowRight");
  await settle();
  await cdp.send("Profiler.start");
  const start = performance.now();
  for (let index = 0; index < 30; index++) { await page.keyboard.press("ArrowRight"); await settle(); }
  const elapsedMs = performance.now() - start;
  const { profile } = await cdp.send("Profiler.stop");
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
  let viewCpuUs = 0;
  let gcCpuUs = 0;
  profile.samples.forEach((id, index) => {
    if (nodes.get(id).callFrame.functionName === "(garbage collector)") gcCpuUs += profile.timeDeltas[index];
    for (let cursor = id; cursor !== undefined; cursor = parents.get(cursor)) {
      const frame = nodes.get(cursor).callFrame;
      if (frame.functionName === "view" && frame.url.includes("/src/production-main.ts")) {
        viewCpuUs += profile.timeDeltas[index]; break;
      }
    }
  });
  assert.notEqual(await ensemble.locator(".ensemble-scene").getAttribute("style"), beforeTransform);
  assert.equal(await page.locator(".simulation-details pre").textContent(), detailsBefore, "camera preserves selected checked event");
  assert.deepEqual(await ensemble.locator(".topology-scroll").allInnerTexts(), diagramsBefore, "camera preserves all six checked diagrams");
  if (!baseline) assert.equal(await ensemble.locator(".topology-route-key, .topology-step, .finish-decision").count(), 0, "3D layers omit hidden explanatory DOM");
  // New checked snapshots still invalidate every live layer. Sample only the
  // root view's CPU stack; advancing the unchanged engine is outside that stack.
  await cdp.send("Profiler.start");
  for (let index = 0; index < 10; index++) {
    await page.evaluate(async () => {
      const { simulationRun } = await import("/src/simulation.ts");
      simulationRun().advance({ untilTime: 1_000_000, maxEvents: 50 });
    });
    await click("Step resident");
  }
  const { profile: arrivals } = await cdp.send("Profiler.stop");
  const profilePath = process.argv.find(arg => arg.startsWith("--profile="))?.slice(10);
  if (profilePath) await writeFile(profilePath, JSON.stringify(arrivals));
  const arrivalNodes = new Map(arrivals.nodes.map(node => [node.id, node]));
  const arrivalParents = new Map(arrivals.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
  let arrivalViewCpuUs = 0;
  arrivals.samples.forEach((id, index) => {
    for (let cursor = id; cursor !== undefined; cursor = arrivalParents.get(cursor)) {
      const frame = arrivalNodes.get(cursor).callFrame;
      if (frame.functionName === "view" && frame.url.includes("/src/production-main.ts")) {
        arrivalViewCpuUs += arrivals.timeDeltas[index]; break;
      }
    }
  });
  console.log(JSON.stringify({ renderer: baseline ?? "working tree", agents: 6, checkedEvents: processed + 1,
    cameraUpdates: 30, elapsedMs: Math.round(elapsedMs), sampledViewCpuMs: +(viewCpuUs / 1000).toFixed(1),
    sampledGcCpuMs: +(gcCpuUs / 1000).toFixed(1), arrivalFrames: 10, sampledArrivalViewCpuMs: +(arrivalViewCpuUs / 1000).toFixed(1), domNodes: await page.locator("*").count(),
    diagramSvgNodes: await ensemble.locator("svg *").count() }));
  // Memoized handlers must remain live and refresh on agent/history changes.
  await click("Select agent 6");
  await click("Focus selected agent");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 1);
  assert.match(await ensemble.locator(".ensemble-layer-title").textContent(), /AGENT 06/);
  await click("Step resident");
  assert.notEqual(await page.locator(".simulation-details pre").textContent(), detailsBefore);
  await click("3D layers");
  assert.equal(await ensemble.locator(".ensemble-layer").count(), 6);
  await page.getByRole("button", { name: "Next: issuePermit", exact: true }).click();
  await settle();
  assert.match(await page.locator(".canonical-progress").textContent(), /Guided step 1/);
  await click("Previous history event");
  assert.match(await page.locator(".canonical-progress").textContent(), /Guided step 0/);
  assert.deepEqual(errors, []);
  console.log("Renderer checks passed: fixed six-agent snapshot, camera isolation, history invalidation, agent focus, live guided handlers.");
} finally {
  await browser?.close();
  await server.close();
}
