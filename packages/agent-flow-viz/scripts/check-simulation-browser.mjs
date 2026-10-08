import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { restoreReplay } from "../../monkey-business/src/index.ts"
import { chromium } from "playwright"
import { createServer } from "vite"
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(server.resolvedUrls.local[0])
  const panel = page.locator("#monkey-business")
  const status = async (text) =>
    page.waitForFunction(
      (expected) => document.querySelector("#monkey-business .simulation-status")?.textContent.includes(expected),
      text
    )
  const outcomeLabels = {
    neverSent: "Never sent",
    finding: "Finding",
    clear: "No finding (clear)",
    backendFailure: "Backend failure",
    timeout: "Timeout",
    interrupted: "Interrupted"
  }
  const outcomeSlider = (outcome) => panel.getByLabel(outcomeLabels[outcome], { exact: true })
  const openMix = async () => {
    if (!(await outcomeSlider("finding").isVisible())) await panel.locator(".simulation-outcome-mix summary").click()
  }
  const setOutcome = async (outcome) => {
    await openMix()
    for (const name of Object.keys(outcomeLabels)) await outcomeSlider(name).press("Home")
    await outcomeSlider(outcome).press("End")
  }
  if (!process.env.HAPSLAND_SHARED_CONTROL_BROWSER_ONLY) {
    assert.equal(await outcomeSlider("finding").inputValue(), "50")
    assert.equal(await outcomeSlider("clear").inputValue(), "50")
    await panel.locator(".simulation-file-trees summary").click()
    assert.equal(await panel.getByLabel("Generated files per artifact · minimum", { exact: true }).inputValue(), "3")
    await panel.getByRole("button", { name: "Tree budget pressure", exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Generated files per artifact · maximum"]')?.value === "16"
    )
    assert.equal(await panel.getByLabel("Generated files per artifact · maximum", { exact: true }).inputValue(), "16")
    assert.match(await panel.locator(".simulation-tree-draft").innerText(), /evidence 2048–5120/)
    await panel.getByRole("button", { name: "Balanced trees", exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Generated files per artifact · maximum"]')?.value === "8"
    )
    await panel.getByLabel("Seed", { exact: true }).fill("7")
    await panel.getByRole("button", { name: "Start / reset", exact: true }).click()
    await status("Seeded session started")
    assert.match(await panel.locator(".simulation-tree-active").innerText(), /3–8 files/)
    await panel.getByLabel("Generated files per artifact · maximum", { exact: true }).fill("9")
    await panel.getByLabel("Evidence-tree bytes per file · maximum", { exact: true }).fill("3000")
    await page.waitForFunction(() =>
      document.querySelector(".simulation-tree-draft")?.textContent.includes("evidence 256–3000")
    )
    assert.match(await panel.locator(".simulation-tree-draft").innerText(), /evidence 256–3000.*Unapplied changes/)
    assert.match(await panel.locator(".simulation-tree-active").innerText(), /3–8 files.*256–2048/)
    await panel.getByRole("button", { name: "Apply to future preparations", exact: true }).click()
    await status("Tree generation applied to future preparations")
    await page.waitForFunction(() =>
      document.querySelector(".simulation-tree-active")?.textContent.includes("3–9 files")
    )
    assert.match(await panel.locator(".simulation-tree-active").innerText(), /3–9 files.*256–3000/)
    await panel.getByLabel("Maximum import depth", { exact: true }).fill("0")
    await page.waitForFunction(() => document.querySelector(".simulation-tree-draft")?.textContent.includes("capacity"))
    assert.match(await panel.locator(".simulation-tree-draft").innerText(), /Cannot apply:.*capacity/)
    await panel.getByRole("button", { name: "Apply to future preparations", exact: true }).click()
    await status("Cannot apply")
    assert.match(await panel.locator(".simulation-tree-active").innerText(), /depth ≤ 3/)
    await panel.getByRole("button", { name: "Balanced trees", exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Generated files per artifact · maximum"]')?.value === "8"
    )
    await panel.getByRole("button", { name: "Apply to future preparations", exact: true }).click()
    await status("Tree generation applied to future preparations")

    await panel.getByRole("button", { name: "Single step", exact: true }).click()
    await status("One checked transition advanced")
    assert.match(await panel.locator(".simulation-status").innerText(), /Paused/)
    await panel.locator(".simulation-details summary").click()
    assert.equal(await panel.locator(".topology-node").count(), 14)
    assert.match(await panel.innerText(), /simulated Jev/i)
    assert.match(await panel.locator(".simulation-details").innerText(), /sequence/)
    assert.match(await panel.locator(".simulation-history").innerText(), /0\. 105 ms · agent-1 · issuePermit/)
    assert.match(await panel.locator(".simulation-details").innerText(), /permitIssued/)
    await panel.getByLabel("Burst count (1–100)", { exact: true }).fill("0")
    await panel.getByLabel("Burst count (1–100)", { exact: true }).press("Enter")
    await status("Burst count must be an integer")
    await panel.getByLabel("Burst count (1–100)", { exact: true }).fill("3")
    await panel.getByLabel("Burst count (1–100)", { exact: true }).press("Enter")
    await panel.getByLabel("Simulated Jev delay (virtual ms)", { exact: true }).fill("500")
    await panel.getByLabel("Simulated Jev delay (virtual ms)", { exact: true }).press("Tab")
    await setOutcome("backendFailure")
    await panel.getByRole("button", { name: "Suspend edit generation", exact: true }).click()
    await status("edits suspended")
    for (let i = 0; i < 20; i++) await panel.getByRole("button", { name: "Single step", exact: true }).click()
    assert.match(await panel.locator(".simulation-details").innerText(), /before/)
    await panel.getByRole("button", { name: "Export replay", exact: true }).click()
    await status("Replay inputs exported")
    const exported = await panel.getByLabel("Replay JSON", { exact: true }).inputValue()
    assert.match(exported, /monkey-business\/1/)
    assert.equal(
      JSON.parse(exported).controls.find((entry) => entry.control.kind === "jevProfile").control.delayMs,
      500
    )
    const assertCapacity = async () => {
      const projection = JSON.parse(await panel.locator(".simulation-details pre").textContent()).after
      // Ensemble layers expose resident totals in the shared inset and stage labels.
      const layer = panel.locator(".ensemble-layer.is-selected")
      assert.equal(
        await layer.locator(".resident-capacity-inset").getAttribute("aria-label"),
        `Inspect shared resident capacity: ${projection.global.items} of ${projection.limits.globalItems} items; ${projection.global.bytes} of ${projection.limits.globalBytes} bytes`
      )
      const diagram = await layer.innerText()
      const preparing = projection.dispatch.running.filter((item) => item.preparation).length
      assert.ok(
        diagram.includes(
          `Preparing: agent ${preparing} · shared ${preparing}/${projection.executionLimits.preparation}`
        )
      )
      assert.ok(
        diagram.includes(
          `Jev: agent ${projection.dispatch.requests.length} · shared ${projection.dispatch.requests.length}/${projection.executionLimits.jevRequests}`
        )
      )
      assert.equal(await panel.locator(".shared-capacity-bar").count(), 0)
    }
    await assertCapacity()
    await panel.getByRole("button", { name: "Previous event", exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector(".simulation-inspection")?.textContent.includes("Inspecting event")
    )
    await assertCapacity()
    await panel.getByRole("button", { name: "Return to latest", exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector(".simulation-inspection")?.textContent.includes("Viewing latest")
    )
    await assertCapacity()
    console.log("STAGE capacity latest/history/latest passed")
    const before = await panel.locator(".simulation-details").innerText()
    await panel.getByRole("button", { name: "Start / reset", exact: true }).click()
    await status("Seeded session started")
    await panel.getByLabel("Replay JSON", { exact: true }).fill(exported)
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    assert.equal(await panel.locator(".simulation-details").innerText(), before)
    const incompatible = JSON.parse(exported)
    incompatible.logicIdentity = "other-logic"
    await panel.getByLabel("Replay JSON", { exact: true }).fill(JSON.stringify(incompatible))
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("incompatible replay identity")
    await panel.getByLabel("Replay JSON", { exact: true }).fill(exported)
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    await panel.getByLabel("Edit interval (virtual ms)", { exact: true }).fill("200")
    await panel.getByLabel("Edit interval (virtual ms)", { exact: true }).press("Enter")
    await status("Future edit pace updated")
    await panel.getByLabel("Reservation bytes per edit", { exact: true }).fill("250")
    await panel.getByLabel("Reservation bytes per edit", { exact: true }).press("Enter")
    await status("Synthetic reservation facts updated")
    await panel.getByRole("button", { name: "Resume edit generation", exact: true }).click()
    await status("edits enabled")
    await panel.getByRole("button", { name: "Resume", exact: true }).click()
    await status("Running")
    await page.waitForFunction(
      () => document.querySelectorAll("#monkey-business .simulation-history button").length > 21
    )
    await panel.getByRole("button", { name: "Pause", exact: true }).click()
    await status("Paused")
    const oldestDisplayed = Number(
      (await panel.locator(".simulation-history button").first().innerText()).split(".")[0]
    )
    await panel.locator(".simulation-history button").first().click()
    await page.waitForFunction(
      (sequence) =>
        document.querySelector("#monkey-business .simulation-details")?.textContent.includes(`"sequence": ${sequence}`),
      oldestDisplayed
    )
    await panel.getByLabel("Edit interval (virtual ms)", { exact: true }).fill("1000")
    await panel.getByLabel("Playback speed (virtual ms / wall ms)", { exact: true }).fill("1")
    await panel.getByRole("button", { name: "Start / reset", exact: true }).click()
    await status("Seeded session started")
    await panel.getByRole("button", { name: "Resume", exact: true }).click()
    await status("Running")
    await page.waitForFunction(
      () => document.querySelectorAll("#monkey-business .simulation-history button").length > 0,
      undefined,
      { timeout: 5000 }
    )
    const speed = panel.getByLabel("Playback speed (virtual ms / wall ms)", { exact: true })
    for (const draft of ["", ".", "1.", "1..5", "2.5", "invalid"]) {
      await speed.selectText()
      await speed.press("Backspace")
      if (draft) await speed.pressSequentially(draft, { delay: 100 })
      await page.waitForTimeout(150)
      await status("Running")
      assert.equal(await speed.inputValue(), draft)
      assert.equal(await speed.evaluate((element) => element === document.activeElement), true)
      assert.match(await panel.locator(".applied-speed").innerText(), /Active speed: 1×/)
    }
    await speed.press("Enter")
    await status("Playback speed must be a number")
    await page.waitForTimeout(250)
    await status("Playback speed must be a number")
    await status("Running")
    await speed.fill(".5")
    await speed.press("Enter")
    await page.waitForFunction(() => document.querySelector(".applied-speed")?.textContent.includes("0.5×"))
    await status("Running")
    await panel.getByLabel("Edit interval (virtual ms)", { exact: true }).fill(".")
    await panel.getByLabel("Edit interval (virtual ms)", { exact: true }).press("Enter")
    await status("Edit pace must be an integer")
    await status("Running")
    await panel.getByRole("button", { name: "Inspect oldest retained event", exact: true }).click()
    await status("Paused")
    assert.match(await panel.locator(".simulation-inspection").innerText(), /Inspecting event 0/)
    await panel.getByRole("button", { name: "Next event", exact: true }).click()
    await panel.getByRole("button", { name: "Bookmark event", exact: true }).click()
    await panel.getByRole("button", { name: "Return to latest", exact: true }).click()
    await panel.getByRole("button", { name: "Go to bookmark", exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector(".simulation-inspection")?.textContent.includes("Inspecting event 1")
    )
    const publicModule = `/@fs${fileURLToPath(new URL("../../monkey-business/src/index.ts", import.meta.url))}`
    const metadataReplay = await page.evaluate(async (moduleUrl) => {
      const { createRun } = await import(moduleUrl)
      const run = createRun({ session: { editIntervalMs: 10, variationMs: 0 }, outcome: "clear" })
      run.advance({ untilTime: 10, maxEvents: 100 })
      run.applyControl({ kind: "suspendArrivals", suspended: true })
      run.advance({ untilTime: 100, maxEvents: 100 })
      run.applyControl({ kind: "suspendArrivals", suspended: false })
      return run.exportReplay()
    }, publicModule)
    assert.equal(metadataReplay.endpoint.now, 20)
    await panel.getByLabel("Replay JSON", { exact: true }).fill(JSON.stringify(metadataReplay))
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    await status("virtual time 20 ms")
    await status("edits enabled")
    await panel.getByRole("button", { name: "Export replay", exact: true }).click()
    await status("Replay inputs exported")
    const loadedMetadataReplay = JSON.parse(await panel.getByLabel("Replay JSON", { exact: true }).inputValue())
    assert.deepEqual(loadedMetadataReplay.endpoint, metadataReplay.endpoint)
    assert.deepEqual(loadedMetadataReplay.controls, metadataReplay.controls)
    console.log("STAGE metadata replay endpoint/control restoration passed")
    await panel.getByRole("button", { name: "Single step", exact: true }).click()
    await status("One checked transition advanced")
    await panel.getByRole("button", { name: "Bookmark event", exact: true }).click()
    await panel.getByRole("button", { name: "Export replay", exact: true }).click()
    await status("Replay inputs exported")
    const fileReplay = await panel.getByLabel("Replay JSON", { exact: true }).inputValue()
    const bookmarkSequence = JSON.parse(fileReplay).endpoint.eventCount - 1
    assert.equal(JSON.parse(fileReplay).dashboard.bookmark, bookmarkSequence)
    const downloadPromise = page.waitForEvent("download")
    await panel.getByRole("button", { name: "Download replay file", exact: true }).click()
    const download = await downloadPromise
    assert.equal(download.suggestedFilename(), "hapsland-simulation-replay.json")
    const replayFilePath = "/tmp/hapsland-simulation-browser-replay.json"
    await download.saveAs(replayFilePath)
    await panel.getByRole("button", { name: "Replay from start", exact: true }).click()
    await status("Replay reset to initial inputs")
    await status("virtual time 0 ms")
    await panel.getByRole("button", { name: "Apply to future preparations", exact: true }).click()
    await status("finish recorded replay before applying new environment controls")
    const appliedTimeline = panel.getByText("Control history", { exact: true }).locator("..").locator("pre")
    assert.deepEqual(JSON.parse(await appliedTimeline.textContent()).controls, [])
    await panel.getByLabel("Simulated Jev delay (virtual ms)", { exact: true }).fill("23")
    await status("finish recorded replay before changing live Jev settings")
    await outcomeSlider("finding").press("End")
    assert.deepEqual(JSON.parse(await appliedTimeline.textContent()).controls, [])

    await panel.getByRole("button", { name: "Single step", exact: true }).click()
    await status("One checked transition advanced")
    for (let index = 1; index < JSON.parse(fileReplay).endpoint.eventCount; index++) {
      await panel.getByRole("button", { name: "Single step", exact: true }).click()
      if (index === Math.floor(JSON.parse(fileReplay).endpoint.eventCount / 2)) {
        const shown = JSON.parse(await appliedTimeline.textContent()).controls
        assert.ok(shown.length < JSON.parse(fileReplay).controls.length)
      }
    }
    await status("Replay reached its exact recorded endpoint")
    console.log("STAGE recorded replay completion passed")
    await status(`virtual time ${JSON.parse(fileReplay).endpoint.now} ms`)
    await panel.getByRole("button", { name: "Export replay", exact: true }).click()
    await status("Replay inputs exported")
    assert.deepEqual(
      JSON.parse(await panel.getByLabel("Replay JSON", { exact: true }).inputValue()).endpoint,
      JSON.parse(fileReplay).endpoint
    )
    const chooserPromise = page.waitForEvent("filechooser")
    await panel.getByRole("button", { name: "Import replay file", exact: true }).click()
    const chooser = await chooserPromise
    await chooser.setFiles(replayFilePath)
    await page.waitForFunction((raw) => document.querySelector("#monkey-business textarea")?.value === raw, fileReplay)
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    await panel.getByRole("button", { name: "Go to bookmark", exact: true }).click()
    await page.waitForFunction(
      (sequence) =>
        document.querySelector(".simulation-inspection")?.textContent.includes(`Inspecting event ${sequence}`),
      bookmarkSequence
    )
    const unfilteredHistoryCount = await panel.locator(".simulation-history button").count()
    if (!(await panel.getByLabel("Diagram stage", { exact: true }).isVisible()))
      await panel.getByText("Inspect a diagram stage by keyboard", { exact: true }).click()
    await panel.getByLabel("Diagram stage", { exact: true }).selectOption("round")
    await panel.getByRole("button", { name: "Inspect selected stage", exact: true }).click()
    await panel.getByRole("button", { name: "round #1", exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector("#monkey-business")?.textContent.includes("Following round:1")
    )
    assert.ok((await panel.locator(".simulation-history button").count()) <= unfilteredHistoryCount)
    await panel.getByRole("button", { name: "Clear lifecycle filter", exact: true }).click()
    await page.waitForFunction(
      (count) => document.querySelectorAll("#monkey-business .simulation-history button").length === count,
      unfilteredHistoryCount
    )
    const simulationModule = `/@fs${fileURLToPath(new URL("../src/simulation.ts", import.meta.url))}`
    const identityCoverage = await page.evaluate(
      async ({ core, view }) => {
        const { createRun } = await import(core)
        const { followsRecord } = await import(view)
        const isolated = createRun({
          inputs: [
            { kind: "edit", at: 1, bytes: 100, unitBytes: [100] },
            { kind: "edit", at: 2, bytes: 100, unitBytes: [100] }
          ]
        })
        isolated.advance({ untilTime: 100, maxEvents: 100 })
        return {
          total: isolated.observations.length,
          focused: isolated.observations.filter((frame) => followsRecord(frame, "operation:1")).length
        }
      },
      { core: publicModule, view: simulationModule }
    )
    assert.ok(identityCoverage.focused > 0)
    assert.ok(identityCoverage.focused < identityCoverage.total)
    await panel.screenshot({ path: "/tmp/astra-ux-after.png" })
    await panel.getByRole("button", { name: "Slow Jev scenario", exact: true }).click()
    await panel.getByRole("button", { name: "Start / reset", exact: true }).click()
    await status("Seeded session started")
    for (let index = 0; index < 100; index++) {
      if (
        /[1-9]\d* at Jev work/.test(
          await panel.locator(".topology-node").filter({ hasText: "Awaiting Jev result" }).textContent()
        )
      )
        break
      const prior = await panel
        .locator(".simulation-history button")
        .last()
        .textContent()
        .catch(() => "")
      await panel.getByRole("button", { name: "Single step", exact: true }).click()
      await page.waitForFunction(
        (previous) =>
          [...document.querySelectorAll("#monkey-business .simulation-history button")].at(-1)?.textContent !==
          previous,
        prior
      )
    }
    if (!(await panel.getByLabel("Diagram stage", { exact: true }).isVisible()))
      await panel.getByText("Inspect a diagram stage by keyboard", { exact: true }).click()
    await panel.getByLabel("Diagram stage", { exact: true }).selectOption("jev")
    await panel.getByRole("button", { name: "Inspect selected stage", exact: true }).click()
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#monkey-business button")].some((button) =>
        /^Jev request #/.test(button.textContent ?? "")
      )
    )
    await panel
      .getByRole("button", { name: /^Jev request #/ })
      .first()
      .click()
    await page.waitForFunction(() =>
      document.querySelector("#monkey-business")?.textContent.includes("Following request:")
    )
    // Stage selection opens the flat inspection view; layout stays stable within it.
    if (!(await panel.locator(".ensemble-panel.is-flat").count())) {
      await panel.getByRole("button", { name: "Focus selected advicee", exact: true }).click()
      await panel.locator(".ensemble-panel.is-flat").waitFor()
    }
    const diagramTop = () =>
      panel.locator(".production-topology").evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
    const stableTop = await diagramTop()
    const awaitingSquare = panel.locator(".topology-node").filter({ hasText: "Awaiting Jev result" })
    await awaitingSquare.click()
    await page.waitForFunction(
      () =>
        !document
          .querySelector("#monkey-business .simulation-stage-inspector")
          ?.textContent.includes("Focused lifecycle")
    )
    assert.equal(await diagramTop(), stableTop)
    await awaitingSquare.click()
    await page.waitForFunction(() =>
      document
        .querySelector("#monkey-business .simulation-stage-inspector")
        ?.textContent.includes("Focused lifecycle and state: Awaiting Jev result")
    )
    assert.equal(await diagramTop(), stableTop)
    await panel.getByRole("button", { name: "Previous event", exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector(".simulation-inspection")?.textContent.includes("Inspecting event")
    )
    assert.equal(await diagramTop(), stableTop)
    await panel.getByRole("button", { name: "Resume", exact: true }).click()
    await status("Running")
    for (let sample = 0; sample < 3; sample++) {
      await page.waitForTimeout(150)
      assert.equal(await diagramTop(), stableTop)
    }
    await panel.getByLabel("Burst count (1–100)", { exact: true }).press("Enter")
    await page.waitForTimeout(150)
    assert.equal(await diagramTop(), stableTop)
    await panel.getByRole("button", { name: "Pause", exact: true }).click()
    await status("Paused")
    await panel.screenshot({ path: "/tmp/astra-ux-stable-layout.png" })
    await panel.getByRole("button", { name: "Normal findings scenario", exact: true }).click()
    await panel.getByRole("button", { name: "Start / reset", exact: true }).click()
    await status("Seeded session started")
    await panel.getByRole("button", { name: "Resume", exact: true }).click()
    await status("Running")
    await openMix()
    for (const name of Object.keys(outcomeLabels)) await outcomeSlider(name).press("Home")
    await page.waitForFunction(() =>
      document.querySelector(".simulation-mix-total")?.textContent.includes("Choose at least one nonzero weight")
    )
    await status("At least one Jev outcome weight must be greater than zero")
    await page.waitForTimeout(100)
    await status("Running")
    assert.match(await panel.locator(".simulation-active-controls").innerText(), /active mix Finding 100.0%/)
    await outcomeSlider("finding").press("End")
    await outcomeSlider("clear").press("End")
    await page.waitForFunction(() =>
      document.querySelector(".simulation-mix-total")?.textContent.includes("Total relative weight: 200")
    )
    assert.match(await panel.locator(".simulation-outcome-mix").innerText(), /weight 100 · 50.0%/)
    assert.match(
      await panel.locator(".simulation-active-controls").innerText(),
      /active mix Finding 50.0% · No finding \(clear\) 50.0%/
    )
    await page.waitForFunction(() =>
      document
        .querySelector(".simulation-active-controls")
        ?.textContent.includes("active mix Finding 50.0% · No finding (clear) 50.0%")
    )
    await status("Running")
    const liveDelay = panel.getByLabel("Simulated Jev delay (virtual ms)", { exact: true })
    for (const draft of ["", ".", "1..5"]) {
      await liveDelay.focus()
      await liveDelay.press("ControlOrMeta+A")
      await liveDelay.press("Backspace")
      await liveDelay.pressSequentially(draft, { delay: 70 })
      await page.waitForTimeout(120)
      assert.equal(await liveDelay.inputValue(), draft)
      assert.equal(await liveDelay.evaluate((element) => element === document.activeElement), true)
      await status("Running")
      assert.match(await panel.locator(".simulation-active-controls").innerText(), /Jev delay (50|1) ms/)
    }
    await outcomeSlider("finding").press("Home")
    await page.waitForFunction(() =>
      document
        .querySelector(".simulation-active-controls")
        ?.textContent.includes("active mix No finding (clear) 100.0%")
    )
    await outcomeSlider("clear").press("Home")
    await liveDelay.fill("17")
    await page.waitForFunction(() =>
      document.querySelector(".simulation-active-controls")?.textContent.includes("Jev delay 17 ms")
    )
    assert.match(
      await panel.locator(".simulation-active-controls").innerText(),
      /active mix No finding \(clear\) 100.0%/
    )
    await outcomeSlider("finding").press("End")
    await outcomeSlider("clear").press("End")
    await panel.getByLabel("Work freshness", { exact: true }).selectOption("stale")
    await panel.getByLabel("Credential availability", { exact: true }).selectOption("unavailable")
    await panel.getByLabel("Credential generation", { exact: true }).fill(".")
    await panel.getByLabel("Credential generation", { exact: true }).press("Enter")
    await status("Credential generation must be an integer")
    await page.waitForTimeout(100)
    await status("Running")
    assert.match(
      await panel.locator(".simulation-active-effects").innerText(),
      /work current · credential ready.*generation 1.*source readable/
    )
    await panel.getByLabel("Credential generation", { exact: true }).fill("2")
    await panel.getByLabel("Source readability", { exact: true }).selectOption("unreadable")
    assert.match(
      await panel.locator(".simulation-active-effects").innerText(),
      /work current · credential ready.*generation 1.*source readable/
    )
    await panel.getByLabel("Credential generation", { exact: true }).press("Enter")
    await page.waitForFunction(() =>
      document
        .querySelector(".simulation-active-effects")
        ?.textContent.includes("work stale · credential unavailable (generation 2) · source unreadable")
    )
    await status("Running")
    await panel.getByLabel("Host output outcome", { exact: true }).selectOption("uncertain")
    const hostDelay = panel.getByLabel("Host output delay (virtual ms)", { exact: true })
    await hostDelay.fill(".")
    await panel.getByLabel("Host output delay (virtual ms)", { exact: true }).press("Enter")
    await status("Host output delay must be an integer")
    await page.waitForTimeout(100)
    await status("Running")
    assert.match(
      await panel.locator(".simulation-active-effects").innerText(),
      /Future host output: certain · delay 1 ms · lease 1000 ms/
    )
    await hostDelay.fill("50")
    await panel.getByLabel("Delivery lease lifetime (virtual ms)", { exact: true }).fill("500")
    await panel.getByLabel("Host output delay (virtual ms)", { exact: true }).press("Enter")
    await page.waitForFunction(() =>
      document
        .querySelector(".simulation-active-effects")
        ?.textContent.includes("Future host output: uncertain · delay 50 ms · lease 500 ms")
    )
    await status("Running")
    await panel.getByRole("button", { name: "Pause", exact: true }).click()
    await status("Paused")
    await panel.getByRole("button", { name: "Export replay", exact: true }).click()
    await status("Replay inputs exported")
    const lifecycleReplayText = await panel.getByLabel("Replay JSON", { exact: true }).inputValue()
    const lifecycleReplay = JSON.parse(lifecycleReplayText)
    assert.equal(lifecycleReplay.controls.filter((entry) => entry.control.kind === "environment").length, 1)
    assert.equal(lifecycleReplay.controls.filter((entry) => entry.control.kind === "outputProfile").length, 1)
    assert.deepEqual(
      [...lifecycleReplay.controls].reverse().find((entry) => entry.control.kind === "jevProfile").control
        .outcomeWeights,
      { neverSent: 0, finding: 100, clear: 100, backendFailure: 0, timeout: 0, interrupted: 0 }
    )
    assert.deepEqual(lifecycleReplay.controls.find((entry) => entry.control.kind === "environment").control, {
      kind: "environment",
      currentWork: false,
      credentialReady: false,
      credentialGeneration: 2,
      sourceReadable: false
    })
    assert.deepEqual(lifecycleReplay.controls.find((entry) => entry.control.kind === "outputProfile").control, {
      kind: "outputProfile",
      outcome: "uncertain",
      delayMs: 50,
      leaseMs: 500
    })
    const lifecycleDetails = await panel.locator(".simulation-details").innerText()
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    assert.equal(await panel.getByLabel("Work freshness", { exact: true }).inputValue(), "stale")
    assert.equal(await panel.getByLabel("Host output outcome", { exact: true }).inputValue(), "uncertain")
    assert.equal(await outcomeSlider("finding").inputValue(), "100")
    assert.equal(await outcomeSlider("clear").inputValue(), "100")
    assert.equal(await panel.locator(".simulation-details").innerText(), lifecycleDetails)
    await panel.getByLabel("Work freshness", { exact: true }).selectOption("current")
    await panel.getByLabel("Credential availability", { exact: true }).selectOption("ready")
    await panel.getByLabel("Source readability", { exact: true }).selectOption("readable")
    await panel.getByLabel("Credential generation", { exact: true }).press("Enter")
    await panel.getByLabel("Host output outcome", { exact: true }).selectOption("certain")
    await hostDelay.fill("1")
    await panel.getByLabel("Delivery lease lifetime (virtual ms)", { exact: true }).fill("1000")
    await panel.getByLabel("Host output delay (virtual ms)", { exact: true }).press("Enter")
    await page.waitForFunction(() =>
      document
        .querySelector(".simulation-active-effects")
        ?.textContent.includes("Future host output: certain · delay 1 ms · lease 1000 ms")
    )
    assert.match(
      await panel.locator(".simulation-active-effects").innerText(),
      /work current · credential ready.*generation 2.*source readable/
    )
    await panel.getByRole("button", { name: "Uncertain output scenario", exact: true }).click()
    await panel.getByRole("button", { name: "Start / reset", exact: true }).click()
    await status("Seeded session started")
    await panel.getByRole("button", { name: "Resume", exact: true }).click()
    await page.waitForFunction(() =>
      /[1-9]\d* uncertain advice submissions/.test(document.querySelector(".simulation-outcomes")?.textContent ?? "")
    )
    await panel.getByRole("button", { name: "Pause", exact: true }).click()
    await status("Paused")
    await panel.getByLabel("Host output outcome", { exact: true }).selectOption("certain")
    await hostDelay.fill("1")
    await panel.getByLabel("Delivery lease lifetime (virtual ms)", { exact: true }).fill("1000")
    await panel.getByLabel("Host output delay (virtual ms)", { exact: true }).press("Enter")
    await page.waitForFunction(() =>
      document
        .querySelector(".simulation-active-effects")
        ?.textContent.includes("Future host output: certain · delay 1 ms")
    )
    await panel.getByRole("button", { name: "Resume", exact: true }).click()
    await page.waitForFunction(() =>
      /[1-9]\d* confirmed host submissions/.test(document.querySelector(".simulation-outcomes")?.textContent ?? "")
    )
    await panel.getByRole("button", { name: "Pause", exact: true }).click()
    await status("Paused")
    await panel.getByRole("button", { name: "Export replay", exact: true }).click()
    await status("Replay inputs exported")
    const recoveryReplayText = await panel.getByLabel("Replay JSON", { exact: true }).inputValue()
    const recoveryOutcomes = await panel.locator(".simulation-outcomes").innerText()
    const recoveredTerminals = await page.evaluate(
      async ({ core, replay }) => {
        const { restoreReplay } = await import(core)
        const restored = restoreReplay(JSON.parse(replay))
        return restored.observations.flatMap((frame) => {
          if (
            frame.event.kind === "submissionTerminal" &&
            frame.outputs.some((command) => command.kind === "submissionRecorded")
          )
            return [frame.event.certain]
          if (
            frame.event.kind === "finishTerminal" &&
            frame.outputs.some((command) => command.kind === "finishRecorded") &&
            frame.event.outcome !== "failed"
          )
            return [frame.event.outcome === "acknowledged"]
          return []
        })
      },
      { core: publicModule, replay: recoveryReplayText }
    )
    assert.ok(recoveredTerminals.includes(false))
    assert.ok(recoveredTerminals.includes(true))
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    assert.equal(await panel.locator(".simulation-outcomes").innerText(), recoveryOutcomes)
    await panel.screenshot({ path: "/tmp/astra-ux-lifecycle-controls.png" })
    const suspension = await page.evaluate(async (view) => {
      const {
        initialSimulation,
        actSimulation,
        tickSimulation,
        simulationContinuation,
        runSimulationContinuation,
        continueSimulation
      } = await import(view)
      const tick = async (model) => {
        model = tickSimulation(model, 100)
        const generation = simulationContinuation()
        if (generation !== undefined) {
          await runSimulationContinuation(generation)
          model = continueSimulation(model, generation)
        }
        return model
      }
      let model = actSimulation({ ...initialSimulation, speed: "1000", appliedSpeed: 1000 }, "start")
      model = actSimulation(model, "play")
      model = await tick(model)
      model = actSimulation(model, "suspend")
      let drainTicks = 0
      while (!model.feedback.includes("waiting for edit generation") && drainTicks++ < 100) model = await tick(model)
      const waiting = {
        playing: model.playing,
        suspended: model.suspended,
        feedback: model.feedback,
        events: JSON.parse(actSimulation(model, "export").replay).endpoint.eventCount
      }
      model = actSimulation(model, "suspend")
      model = await tick(model)
      const resumed = {
        playing: model.playing,
        suspended: model.suspended,
        feedback: model.feedback,
        events: JSON.parse(actSimulation(model, "export").replay).endpoint.eventCount
      }
      model = actSimulation(model, "play")
      model = actSimulation(model, "suspend")
      model = actSimulation(model, "suspend")
      return { waiting, resumed, manuallyPaused: !model.playing }
    }, simulationModule)
    assert.equal(suspension.waiting.playing, true)
    assert.equal(suspension.waiting.suspended, true)
    assert.match(suspension.waiting.feedback, /waiting for edit generation/)
    assert.equal(suspension.resumed.playing, true)
    assert.equal(suspension.resumed.suspended, false)
    assert.ok(suspension.resumed.events > suspension.waiting.events)
    assert.match(suspension.resumed.feedback, /Playback advanced/)
    assert.equal(suspension.manuallyPaused, true)
    const generatedTreeReplay = await page.evaluate(async (core) => {
      const { createRun, DEFAULT_FILE_TREE_PROFILE } = await import(core)
      const run = createRun({
        seed: 7,
        fileTrees: {
          ...DEFAULT_FILE_TREE_PROFILE,
          minFiles: 7,
          maxFiles: 7,
          maxImports: 1,
          maxDepth: 6,
          deniedPercent: 0
        },
        inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }],
        outcome: "clear"
      })
      while (run.observations.at(-1)?.preparation?.after.phase !== "incomplete") run.step()
      return run.exportReplay()
    }, publicModule)
    await panel.getByLabel("Replay JSON", { exact: true }).fill(JSON.stringify(generatedTreeReplay))
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    await page.waitForFunction(
      () =>
        document.querySelector(".simulation-tree-active")?.textContent.includes("7–7 files") &&
        document.querySelector(".simulation-tree-active")?.textContent.includes("depth ≤ 6")
    )
    assert.equal(
      await page.locator(".ensemble-layer").count(),
      1,
      "scripted input replay has a partition layer without a generator"
    )
    assert.equal(
      await panel.getByRole("button", { name: "Apply edit pace", exact: true }).count(),
      0,
      "scripted replay must not offer nonexistent generator controls"
    )
    assert.match(await panel.locator(".preparation-mini-counts").textContent(), /5\/7 files read/)
    if (!(await panel.getByLabel("Diagram stage", { exact: true }).isVisible()))
      await panel.getByText("Inspect a diagram stage by keyboard", { exact: true }).click()
    await panel.getByLabel("Diagram stage", { exact: true }).selectOption("preparation")
    await panel.getByRole("button", { name: "Inspect selected stage", exact: true }).click()
    await page.waitForFunction(() =>
      document
        .querySelector("#monkey-business .preparation-generated-counts")
        ?.textContent.includes("7 generated files")
    )
    const treeDetails = panel.locator(".preparation-reference-details")
    assert.match(await treeDetails.locator("h4").innerText(), /Generated import tree/)
    assert.match(
      await treeDetails.locator(".preparation-generated-counts").innerText(),
      /7 generated files.*depth 6.*0 path exclusions observed/
    )
    assert.match(await treeDetails.locator(".preparation-reference-command").innerText(), /DepthLimit/)
    assert.match(await treeDetails.locator("svg").textContent(), /File entry.ts/)
    await panel.getByRole("button", { name: "Inspect selected stage", exact: true }).click()
    const queuedBurstReplay = await page.evaluate(async (core) => {
      const { createRun } = await import(core)
      const run = createRun({ outcome: "clear", session: { editIntervalMs: 1000000 } })
      run.applyControl({ kind: "burst", count: 50 })
      for (let index = 0; index < 1000; index++) {
        const frame = run.step(0)
        if (!frame) break
        if (frame.after.work.filter((work) => work.kind === "awaitingSourceRead").length === 50)
          return run.exportReplay()
      }
      throw new Error("Checked burst did not reach 50 queued sources")
    }, publicModule)
    await panel.getByLabel("Replay JSON", { exact: true }).fill(JSON.stringify(queuedBurstReplay))
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    const waitingSourceSquare = panel.locator(".topology-node").filter({ hasText: "Awaiting source read" })
    assert.match(await waitingSourceSquare.locator(".topology-facet").first().textContent(), /^50 pending source reads/)
    assert.equal(
      await panel
        .locator(".topology-node")
        .filter({ hasText: "Read & prepare source" })
        .locator(".topology-facet")
        .count(),
      2
    )
    assert.equal(
      await panel.locator(".topology-node").filter({ hasText: "Ready advice" }).locator(".topology-facet").count(),
      3
    )
    const hostOutputSquare = panel.locator(".topology-node").filter({ hasText: "Host output" })
    assert.equal(await hostOutputSquare.locator(".topology-facet").count(), 3)
    assert.match(await hostOutputSquare.textContent(), /Stop slot · select group in inspector/)
    const presentationModule = `/@fs${fileURLToPath(new URL("../src/production-flow-presentation.ts", import.meta.url))}`
    const metrics = await page.evaluate(
      async ({ core, presentation }) => {
        const { createRun } = await import(core)
        const { SQUARES, squareFacetLine, squareFacetFontSize } = await import(presentation)
        const initial = createRun().projection
        const facets = Object.values(SQUARES).flatMap((square) => square.facets(initial))
        let measured = 0
        let widest = 0
        const contexts = [...document.querySelectorAll(".production-topology svg")]
        for (const svg of contexts) {
          const scratch = document.createElementNS("http://www.w3.org/2000/svg", "g")
          scratch.setAttribute("opacity", "0")
          svg.appendChild(scratch)
          for (const facet of facets)
            for (const count of [0, 1, 100])
              for (const longId of [false, true]) {
                // These are presentation fixtures, independent of capacity/admission behavior.
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text")
                text.setAttribute("class", "topology-facet")
                text.setAttribute("font-weight", "600")
                const sample = {
                  ...facet,
                  count,
                  references: Array.from(
                    { length: count },
                    (_, index) => `Preparation #${longId ? Number.MAX_SAFE_INTEGER - index : index + 1}`
                  )
                }
                const line = squareFacetLine(sample)
                text.setAttribute("font-size", squareFacetFontSize(sample))
                if (!line.startsWith(`${count} `)) throw new Error("Facet count lost from visible row")
                text.textContent = line
                scratch.appendChild(text)
                widest = Math.max(widest, text.getBBox().width)
                measured++
                text.remove()
              }
          scratch.remove()
          for (const text of svg.querySelectorAll(".topology-facet")) widest = Math.max(widest, text.getBBox().width)
        }
        return { measured, widest, contexts: contexts.length }
      },
      { core: publicModule, presentation: presentationModule }
    )
    assert.equal(metrics.contexts, 2, "static and live diagrams use the shared magnitude presentation")
    assert.ok(metrics.measured >= 300)
    assert.ok(metrics.widest <= 198, `Facet text exceeds square inner width: ${metrics.widest}`)
    await panel.getByLabel("Seed", { exact: true }).fill("4294967313")
    const workloadFields = {
      "Edit interval variation (virtual ms)": "0",
      "Edits per task": "2",
      "Pause between tasks (virtual ms)": "70",
      "Repair response delay (virtual ms)": "23"
    }
    for (const [label, value] of Object.entries(workloadFields))
      await panel.getByLabel(label, { exact: true }).fill(value)
    await panel.getByLabel("Advice response", { exact: true }).selectOption("delayedRepair")
    await panel.getByRole("button", { name: "Start / reset", exact: true }).click()
    await status("Seeded session started")
    await panel.getByRole("button", { name: "Export replay", exact: true }).click()
    await status("Replay inputs exported")
    const workloadReplay = JSON.parse(await panel.getByLabel("Replay JSON", { exact: true }).inputValue())
    assert.equal(workloadReplay.config.seed, 4294967313)
    for (const session of workloadReplay.config.sessions) {
      assert.equal(session.variationMs, 0)
      assert.equal(session.editsPerTask, 2)
      assert.equal(session.taskPauseMs, 70)
      assert.equal(session.adviceResponse, "delayedRepair")
      assert.equal(session.repairDelayMs, 23)
    }
    await panel.getByLabel("Edits per task", { exact: true }).fill("9")
    await panel.getByLabel("Advice response", { exact: true }).selectOption("ignore")
    await panel.getByRole("button", { name: "Load replay", exact: true }).click()
    await status("Replay reconstructed")
    for (const [label, value] of Object.entries(workloadFields))
      assert.equal(await panel.getByLabel(label, { exact: true }).inputValue(), value)
    assert.equal(await panel.getByLabel("Advice response", { exact: true }).inputValue(), "delayedRepair")
    await panel.screenshot({ path: "/tmp/astra-ux-square-magnitudes.png" })
  }
  // Exercise the actual shared-resident controls through their maintained DOM.
  const waveClick = async (name) => {
    await panel.getByRole("button", { name, exact: true }).click()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  }
  const waveFill = async (label, value) => panel.getByLabel(label, { exact: true }).fill(String(value))
  const waveReplay = async () => {
    await waveClick("Export replay")
    return JSON.parse(await panel.getByLabel("Replay JSON", { exact: true }).inputValue())
  }
  const waveRun = async () => restoreReplay(await waveReplay())
  const waveUntil = async (predicate) => {
    for (let step = 0; step < 64; step++) {
      const current = await waveRun()
      if (predicate(current)) return current
      await waveClick("Single step")
    }
    throw new Error("shared control boundary exceeded 64 original transitions")
  }
  if (!(await panel.getByLabel("Generated files per artifact · minimum", { exact: true }).isVisible()))
    await panel.locator(".simulation-file-trees summary").click()
  await panel.getByLabel("Work freshness", { exact: true }).selectOption("current")
  await waveFill("Credential generation", 1)
  await panel.getByLabel("Credential availability", { exact: true }).selectOption("ready")
  await panel.getByLabel("Source readability", { exact: true }).selectOption("readable")
  await waveFill("Edit interval (virtual ms)", 1000000)
  await waveFill("Simulated Jev delay (virtual ms)", 1000)
  await waveFill("Simulated edit duration (virtual ms)", 0)
  await waveFill("Generated files per artifact · minimum", 2)
  await waveFill("Generated files per artifact · maximum", 2)
  await waveFill("Maximum imports per file", 1)
  await waveFill("Maximum import depth", 1)
  await waveFill("Denied import targets (%)", 0)
  await waveFill("Source bytes per file · minimum", 10)
  await waveFill("Source bytes per file · maximum", 10)
  await waveFill("Evidence-tree bytes per file · minimum", 4)
  await waveFill("Evidence-tree bytes per file · maximum", 4)
  for (const label of [
    "Missing import targets (%)",
    "Unsupported import targets (%)",
    "Unreadable import targets (%)",
    "Repeated import edges (%)",
    "Cyclic import edges (%)",
    "Deadline fact index",
    "Local analysis work per file"
  ])
    await waveFill(label, 0)
  const graphDrafts = {
    "Maximum source bytes per file": 20,
    "Maximum accepted evidence-tree bytes": 32,
    "Maximum files read": 2,
    "Maximum total source bytes read": 40,
    "Maximum outgoing edges per file": 1,
    "Maximum supporting-reference depth": 2,
    "Maximum graph work steps": 32
  }
  for (const [label, value] of Object.entries(graphDrafts)) await waveFill(label, value)
  await setOutcome("clear")
  await waveClick("Start / reset")
  await waveFill("Burst count (1–100)", 1)
  await waveClick("Inject edit burst")
  const captured = await waveUntil((current) => current.observations.some((frame) => frame.preparation))
  const firstGraph = captured.observations.find((frame) => frame.preparation).event
  assert.equal(firstGraph.graphLimits.files, 2)
  await waveFill("Maximum files read", 1)
  await waveClick("Apply graph limits")
  await waveFill("Missing import targets (%)", 100)
  await waveFill("Unsupported import targets (%)", 100)
  await waveFill("Repeated import edges (%)", 100)
  await waveFill("Cyclic import edges (%)", 100)
  await waveFill("Local analysis work per file", 1)
  await waveClick("Apply to future preparations")
  const issued = await waveUntil((current) => current.projection.dispatch.requests.some((request) => !request.started))
  const target = issued.projection.dispatch.requests.find((request) => !request.started)
  const faultPanel = panel.locator(".simulation-jev-interventions")
  if (!(await faultPanel.getByRole("button", { name: "Never sent", exact: true }).isVisible()))
    await faultPanel.locator("summary").click()
  await faultPanel.getByRole("button", { name: "Never sent", exact: true }).click()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  let controlled = await waveRun()
  assert.deepEqual(
    controlled.interventions.at(-1).control.target,
    Object.fromEntries(["partition", "lifetime", "round", "operation", "request"].map((key) => [key, target[key]]))
  )
  assert.equal(controlled.interventions.at(-1).result, "applied")
  assert.match(await faultPanel.getByLabel("Jev intervention results").innerText(), /neverSent.*Applied/)
  await waveClick("Inject edit burst")
  const second = await waveUntil((current) =>
    current.projection.dispatch.requests.some((request) => request.operation !== target.operation && request.started)
  )
  const active = second.projection.dispatch.requests.find(
    (request) => request.operation !== target.operation && request.started
  )
  const activeField = faultPanel
    .locator("fieldset")
    .filter({ hasText: `operation ${active.operation} · request ${active.request}` })
  await activeField.getByRole("button", { name: "Never sent", exact: true }).click()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  controlled = await waveRun()
  assert.equal(controlled.interventions.at(-1).result, "requestAlreadyStarted")
  assert.match(
    await faultPanel.getByLabel("Jev intervention results").innerText(),
    /Refused: an already started request/
  )
  for (const name of ["Make credentials unavailable", "Restore credentials", "Rotate credentials"])
    await waveClick(name)
  controlled = await waveRun()
  assert.deepEqual(
    controlled.interventions.slice(-3).map((report) => [report.control.action, report.result]),
    [
      ["unavailable", "applied"],
      ["restore", "applied"],
      ["rotate", "applied"]
    ]
  )
  const preparations = controlled.observations.filter((frame) => frame.preparation).map((frame) => frame.event)
  assert.ok(
    preparations
      .filter((event) => event.operation === firstGraph.operation)
      .every((event) => event.graphLimits.files === 2)
  )
  const future = preparations.find((event) => event.operation !== firstGraph.operation)
  assert.equal(future.graphLimits.files, 1)
  const retained = await waveReplay()
  assert.deepEqual(retained.controls.findLast((entry) => entry.control.kind === "graphLimits").control.limits, {
    version: 1,
    sourceBytes: 20,
    treeBytes: 32,
    files: 1,
    readBytes: 40,
    outgoingEdges: 1,
    depth: 2,
    work: 32
  })
  const profile = retained.controls.findLast((entry) => entry.control.kind === "fileTrees").control.profile
  assert.equal(profile.missingPercent, 100)
  assert.equal(profile.unsupportedPercent, 100)
  assert.equal(profile.repeatedEdgePercent, 100)
  assert.equal(profile.cyclicEdgePercent, 100)
  assert.equal(profile.localWork, 1)
  const beforeRestore = restoreReplay(retained).observe()
  await waveClick("Load replay")
  await status("Replay reconstructed")
  const afterRestore = await waveRun()
  assert.deepEqual(afterRestore.observe(), beforeRestore)
  assert.equal(afterRestore.interventions.length, controlled.interventions.length)
  console.log(
    "Shared DOM controls passed: exact Jev target Applied/Refused, credentials unavailable/restore/rotate, seven graph limits, future captured tree faults and ordinary replay."
  )
  assert.deepEqual(errors, [])
  console.log("Simulation browser controls, existing diagram and inspection passed")
} finally {
  await browser?.close()
  await server.close()
}
