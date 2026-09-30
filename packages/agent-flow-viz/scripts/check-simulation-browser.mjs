import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  const panel = page.locator("#monkey-business");
  const status = async (text) =>
    page.waitForFunction(
      (expected) =>
        document
          .querySelector("#monkey-business .simulation-status")
          ?.textContent.includes(expected),
      text,
    );
  await panel.getByLabel("Seed", { exact: true }).fill("7");
  await panel
    .getByRole("button", { name: "Start / reset", exact: true })
    .click();
  await status("Seeded session started");
  await panel.getByRole("button", { name: "Single step", exact: true }).click();
  await status("One checked transition advanced");
  assert.match(await panel.locator(".simulation-status").innerText(), /Paused/);
  assert.equal(await panel.locator(".topology-node").count(), 13);
  assert.match(await panel.innerText(), /simulated Jev/i);
  assert.match(
    await panel.locator(".simulation-details").innerText(),
    /sequence/,
  );
  assert.match(
    await panel.locator(".simulation-history").innerText(),
    /0\. 105 ms · openRound/,
  );
  await panel.getByLabel("Burst count (1–100)", { exact: true }).fill("0");
  await panel
    .getByRole("button", { name: "Inject edit burst", exact: true })
    .click();
  await status("Burst count must be an integer");
  await panel.getByLabel("Burst count (1–100)", { exact: true }).fill("3");
  await panel
    .getByRole("button", { name: "Inject edit burst", exact: true })
    .click();
  await panel
    .getByLabel("Simulated Jev delay (virtual ms)", { exact: true })
    .fill("500");
  await panel
    .getByLabel("Simulated Jev delay (virtual ms)", { exact: true })
    .press("Tab");
  await panel
    .getByLabel("Simulated Jev outcome", { exact: true })
    .selectOption("backendFailure");
  await panel
    .getByRole("button", { name: "Apply simulated Jev profile", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Suspend edit generation", exact: true })
    .click();
  await status("edits suspended");
  for (let i = 0; i < 20; i++)
    await panel
      .getByRole("button", { name: "Single step", exact: true })
      .click();
  assert.match(
    await panel.locator(".simulation-details").innerText(),
    /before/,
  );
  await panel
    .getByRole("button", { name: "Export replay", exact: true })
    .click();
  await status("Replay inputs exported");
  const exported = await panel
    .getByLabel("Replay JSON", { exact: true })
    .inputValue();
  assert.match(exported, /monkey-business\/1/);
  assert.equal(
    JSON.parse(exported).controls.find(
      (entry) => entry.control.kind === "jevProfile",
    ).control.delayMs,
    500,
  );
  const before = await panel.locator(".simulation-details").innerText();
  await panel
    .getByRole("button", { name: "Start / reset", exact: true })
    .click();
  await panel.getByLabel("Replay JSON", { exact: true }).fill(exported);
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("Replay reconstructed");
  assert.equal(await panel.locator(".simulation-details").innerText(), before);
  const incompatible = JSON.parse(exported);
  incompatible.logicIdentity = "other-logic";
  await panel
    .getByLabel("Replay JSON", { exact: true })
    .fill(JSON.stringify(incompatible));
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("incompatible replay identity");
  await panel.getByLabel("Replay JSON", { exact: true }).fill(exported);
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("Replay reconstructed");
  await panel
    .getByLabel("Edit interval (virtual ms)", { exact: true })
    .fill("200");
  await panel
    .getByRole("button", { name: "Apply edit pace", exact: true })
    .click();
  await status("Future edit pace updated");
  await panel
    .getByLabel("Reservation bytes per edit", { exact: true })
    .fill("250");
  await panel
    .getByRole("button", { name: "Apply reservation size", exact: true })
    .click();
  await status("Synthetic reservation facts updated");
  await panel
    .getByRole("button", { name: "Resume edit generation", exact: true })
    .click();
  await status("edits enabled");
  await panel.getByRole("button", { name: "Resume", exact: true }).click();
  await status("Running");
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#monkey-business .simulation-history button")
        .length > 21,
  );
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  await status("Paused");
  const oldestDisplayed = Number((await panel.locator(".simulation-history button").first().innerText()).split(".")[0]);
  await panel.locator(".simulation-history button").first().click();
  await page.waitForFunction((sequence) =>
    document.querySelector("#monkey-business .simulation-details")?.textContent.includes(`"sequence": ${sequence}`), oldestDisplayed,
  );
  await panel
    .getByLabel("Edit interval (virtual ms)", { exact: true })
    .fill("1000");
  await panel
    .getByLabel("Playback speed (virtual ms / wall ms)", { exact: true })
    .fill("1");
  await panel
    .getByRole("button", { name: "Start / reset", exact: true })
    .click();
  await status("Seeded session started");
  await panel.getByRole("button", { name: "Resume", exact: true }).click();
  await status("Running");
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#monkey-business .simulation-history button")
        .length > 0,
    undefined,
    { timeout: 5000 },
  );
  const speed = panel.getByLabel("Playback speed (virtual ms / wall ms)", { exact: true });
  for (const draft of ["", ".", "1.", "1..5", "2.5", "invalid"]) {
    await speed.selectText();
    await speed.press("Backspace");
    if (draft) await speed.pressSequentially(draft, { delay: 100 });
    await page.waitForTimeout(150);
    await status("Running");
    assert.equal(await speed.inputValue(), draft);
    assert.equal(await speed.evaluate((element) => element === document.activeElement), true);
    assert.match(await panel.locator(".applied-speed").innerText(), /Active speed: 1×/);
  }
  await panel.getByRole("button", { name: "Apply playback speed", exact: true }).click();
  await status("Playback speed must be a number");
  await page.waitForTimeout(250);
  await status("Playback speed must be a number");
  await status("Running");
  await speed.fill(".5");
  await panel.getByRole("button", { name: "Apply playback speed", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".applied-speed")?.textContent.includes("0.5×"));
  await status("Running");
  await panel.getByLabel("Edit interval (virtual ms)", { exact: true }).fill(".");
  await panel.getByRole("button", { name: "Apply edit pace", exact: true }).click();
  await status("Edit pace must be an integer");
  await status("Running");
  await panel.locator(".simulation-history button").first().click();
  await status("Paused");
  assert.match(await panel.locator(".simulation-inspection").innerText(), /Inspecting event 0/);
  await panel.getByRole("button", { name: "Next event", exact: true }).click();
  await panel.getByRole("button", { name: "Bookmark event", exact: true }).click();
  await panel.getByRole("button", { name: "Return to latest", exact: true }).click();
  await panel.getByRole("button", { name: "Go to bookmark", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".simulation-inspection")?.textContent.includes("Inspecting event 1"));
  const publicModule = `/@fs${fileURLToPath(new URL("../../monkey-business/src/index.ts", import.meta.url))}`;
  const metadataReplay = await page.evaluate(async (moduleUrl) => {
    const { createRun } = await import(moduleUrl);
    const run = createRun({
      session: { editIntervalMs: 10, variationMs: 0 },
      outcome: "clear",
    });
    run.advance({ untilTime: 10, maxEvents: 100 });
    run.applyControl({ kind: "suspendArrivals", suspended: true });
    run.advance({ untilTime: 100, maxEvents: 100 });
    run.applyControl({ kind: "suspendArrivals", suspended: false });
    return run.exportReplay();
  }, publicModule);
  assert.equal(metadataReplay.endpoint.now, 20);
  await panel
    .getByLabel("Replay JSON", { exact: true })
    .fill(JSON.stringify(metadataReplay));
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("Replay reconstructed");
  await status("virtual time 20 ms");
  await status("edits enabled");
  await panel
    .getByRole("button", { name: "Export replay", exact: true })
    .click();
  await status("Replay inputs exported");
  const loadedMetadataReplay = JSON.parse(
    await panel.getByLabel("Replay JSON", { exact: true }).inputValue(),
  );
  assert.deepEqual(loadedMetadataReplay.endpoint, metadataReplay.endpoint);
  assert.deepEqual(loadedMetadataReplay.controls, metadataReplay.controls);
  await panel.getByRole("button", { name: "Single step", exact: true }).click();
  await status("One checked transition advanced");
  await panel.getByRole("button", { name: "Bookmark event", exact: true }).click();
  await panel.getByRole("button", { name: "Export replay", exact: true }).click();
  await status("Replay inputs exported");
  const fileReplay = await panel.getByLabel("Replay JSON", { exact: true }).inputValue();
  const bookmarkSequence = JSON.parse(fileReplay).endpoint.eventCount - 1;
  assert.equal(JSON.parse(fileReplay).dashboard.bookmark, bookmarkSequence);
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download replay file", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "hapsland-simulation-replay.json");
  const replayFilePath = "/tmp/hapsland-simulation-browser-replay.json";
  await download.saveAs(replayFilePath);
  await panel.getByRole("button", { name: "Replay from start", exact: true }).click();
  await status("Replay reset to initial inputs");
  await status("virtual time 0 ms");
  const appliedTimeline = panel.getByText("Applied control timeline (draft fields apply only when submitted)", { exact: true }).locator("..").locator("pre");
  assert.deepEqual(JSON.parse(await appliedTimeline.textContent()).controls, []);
  await panel.getByRole("button", { name: "Single step", exact: true }).click();
  await status("One checked transition advanced");
  for (let index = 1; index < JSON.parse(fileReplay).endpoint.eventCount; index++) {
    await panel.getByRole("button", { name: "Single step", exact: true }).click();
    if (index === Math.floor(JSON.parse(fileReplay).endpoint.eventCount / 2)) {
      const shown = JSON.parse(await appliedTimeline.textContent()).controls;
      assert.ok(shown.length < JSON.parse(fileReplay).controls.length);
    }
  }
  await status("Replay reached its exact recorded endpoint");
  await status(`virtual time ${JSON.parse(fileReplay).endpoint.now} ms`);
  await panel.getByRole("button", { name: "Export replay", exact: true }).click();
  await status("Replay inputs exported");
  assert.deepEqual(JSON.parse(await panel.getByLabel("Replay JSON", { exact: true }).inputValue()).endpoint, JSON.parse(fileReplay).endpoint);
  const chooserPromise = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Import replay file", exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(replayFilePath);
  await page.waitForFunction((raw) => document.querySelector("#monkey-business textarea")?.value === raw, fileReplay);
  await panel.getByRole("button", { name: "Load replay", exact: true }).click();
  await status("Replay reconstructed");
  await panel.getByRole("button", { name: "Go to bookmark", exact: true }).click();
  await page.waitForFunction((sequence) => document.querySelector(".simulation-inspection")?.textContent.includes(`Inspecting event ${sequence}`), bookmarkSequence);
  const unfilteredHistoryCount = await panel.locator(".simulation-history button").count();
  if (!(await panel.getByLabel("Diagram stage", { exact: true }).isVisible())) await panel.getByText("Inspect a diagram stage by keyboard", { exact: true }).click();
  await panel.getByLabel("Diagram stage", { exact: true }).selectOption("round");
  await panel.getByRole("button", { name: "Inspect selected stage", exact: true }).click();
  await panel.getByRole("button", { name: "round #1", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#monkey-business")?.textContent.includes("Following round:1"));
  assert.ok(await panel.locator(".simulation-history button").count() <= unfilteredHistoryCount);
  await panel.getByRole("button", { name: "Clear lifecycle filter", exact: true }).click();
  await page.waitForFunction((count) => document.querySelectorAll("#monkey-business .simulation-history button").length === count, unfilteredHistoryCount);
  const simulationModule = `/@fs${fileURLToPath(new URL("../src/simulation.ts", import.meta.url))}`;
  const identityCoverage = await page.evaluate(async ({ core, view }) => {
    const { createRun } = await import(core);
    const { followsRecord } = await import(view);
    const isolated = createRun({ inputs: [{ kind: "edit", at: 1, bytes: 100, unitBytes: [100] }, { kind: "edit", at: 2, bytes: 100, unitBytes: [100] }] });
    isolated.advance({ untilTime: 100, maxEvents: 100 });
    return { total: isolated.observations.length, focused: isolated.observations.filter((frame) => followsRecord(frame, "operation:1")).length };
  }, { core: publicModule, view: simulationModule });
  assert.ok(identityCoverage.focused > 0);
  assert.ok(identityCoverage.focused < identityCoverage.total);
  await panel.screenshot({ path: "/tmp/astra-ux-after.png" });
  await panel.getByRole("button", { name: "Slow Jev scenario", exact: true }).click();
  await panel.getByRole("button", { name: "Start / reset", exact: true }).click();
  await status("Seeded session started");
  for (let index = 0; index < 20; index++) await panel.getByRole("button", { name: "Single step", exact: true }).click();
  if (!(await panel.getByLabel("Diagram stage", { exact: true }).isVisible())) await panel.getByText("Inspect a diagram stage by keyboard", { exact: true }).click();
  await panel.getByLabel("Diagram stage", { exact: true }).selectOption("jev");
  await panel.getByRole("button", { name: "Inspect selected stage", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("#monkey-business button")].some((button) => /^request #/.test(button.textContent ?? "")));
  await panel.getByRole("button", { name: /^request #/ }).first().click();
  await page.waitForFunction(() => document.querySelector("#monkey-business")?.textContent.includes("Following request:"));
  assert.deepEqual(errors, []);
  console.log(
    "Simulation browser controls, existing diagram and inspection passed",
  );
} finally {
  await browser?.close();
  await server.close();
}
