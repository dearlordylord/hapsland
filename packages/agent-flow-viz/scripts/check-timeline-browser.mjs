import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "vite"

const suppliedUrl = process.argv.find((argument) => argument.startsWith("--url="))?.slice(6)
const server = suppliedUrl
  ? undefined
  : await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
const responsiveness = []
try {
  await server?.listen()
  browser = await chromium.launch({ headless: true })
  for (const count of [1, 6]) {
    const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } })
    await page.goto(suppliedUrl ?? server.resolvedUrls.local[0])
    const click = (name) => page.getByRole("button", { name, exact: true }).click()
    const slider = page.getByLabel("Retained event timeline", { exact: true })
    await page.getByLabel("Advicee count", { exact: true }).fill(String(count))
    await click("Start resident")
    await page.getByLabel("Playback speed (virtual ms / wall ms)", { exact: true }).fill("100")
    await click("Apply playback speed")
    await page.evaluate(() => {
      window.timelineTiming = { longTasks: [], inspectionLatency: [] }
      const tasks = new PerformanceObserver((list) => {
        window.timelineTiming.longTasks.push(...list.getEntries().map((entry) => entry.duration))
      })
      tasks.observe({ type: "longtask" })
      let pending
      document.addEventListener(
        "input",
        (event) => {
          if (event.target.getAttribute("aria-label") === "Retained event timeline")
            pending = { sequence: event.target.value, at: performance.now() }
        },
        true
      )
      const updates = new MutationObserver(() => {
        if (
          pending &&
          document
            .querySelector(".simulation-inspection")
            .textContent.includes(`Inspecting event ${pending.sequence} at`)
        ) {
          window.timelineTiming.inspectionLatency.push(performance.now() - pending.at)
          pending = undefined
        }
      })
      updates.observe(document.querySelector(".simulation-inspection"), {
        subtree: true,
        childList: true,
        characterData: true
      })
      window.timelineTiming.stop = () => {
        tasks.disconnect()
        updates.disconnect()
      }
    })
    await click("Play resident")
    await page.waitForFunction(
      () => Number(document.querySelector('[aria-label="Retained event timeline"]').max) > 200,
      null,
      { timeout: 10000 }
    )
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await page.mouse.down()
    const samples = []
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height / 2)
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      samples.push(Number(await slider.inputValue()))
    }
    await page.mouse.up()
    const endpoint = Number(await slider.inputValue())
    assert.ok(samples.at(-1) > samples[0], `No drag progress (${count} advicees): ${samples}`)
    assert.ok(
      samples.every((value, index) => !index || value >= samples[index - 1]),
      `Thumb rollback (${count} advicees): ${samples}`
    )
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".simulation-inspection").textContent.includes(`Inspecting event ${expected} at`),
      endpoint,
      { timeout: 10000 }
    )
    assert.match(await page.locator(".simulation-status").textContent(), /^Paused/)
    assert.equal(Number(await slider.inputValue()), endpoint)
    await click("Previous event")
    await page.waitForFunction(
      (expected) => Number(document.querySelector('[aria-label="Retained event timeline"]').value) === expected - 1,
      endpoint,
      { timeout: 10000 }
    )
    await click("Next event")
    await page.waitForFunction(
      (expected) => Number(document.querySelector('[aria-label="Retained event timeline"]').value) === expected,
      endpoint,
      { timeout: 10000 }
    )
    await click("Return to latest")
    await page.waitForFunction(
      () => {
        const node = document.querySelector('[aria-label="Retained event timeline"]')
        return node.value === node.max
      },
      null,
      { timeout: 10000 }
    )
    await slider.focus()
    await page.keyboard.press("ArrowLeft")
    const keyboardEndpoint = Number(await slider.inputValue())
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".simulation-inspection").textContent.includes(`Inspecting event ${expected} at`),
      keyboardEndpoint,
      { timeout: 10000 }
    )
    await click("Play resident")
    await page.waitForFunction(
      (before) => {
        const node = document.querySelector('[aria-label="Retained event timeline"]')
        return Number(node.value) > before && node.value === node.max
      },
      keyboardEndpoint,
      { timeout: 10000 }
    )
    const timing = await page.evaluate(() => {
      window.timelineTiming.stop()
      return { longTasks: window.timelineTiming.longTasks, inspectionLatency: window.timelineTiming.inspectionLatency }
    })
    assert.ok(timing.inspectionLatency.length > 0, "native input-to-inspection timing was observed")
    responsiveness.push({
      advicees: count,
      maxObservedLongTaskMs: Math.max(0, ...timing.longTasks),
      maxObservedDomInputToInspectionLatencyMs: Math.max(...timing.inspectionLatency)
    })
    if (count === 1 && !suppliedUrl) {
      await click("Pause resident")
      const cooperative = await page.evaluate(async () => {
        const loaded = performance
          .getEntriesByType("resource")
          .findLast((entry) => new URL(entry.name).pathname === "/src/simulation/index.ts")
        const resident = await import(loaded.name)
        const driverUrl = performance
          .getEntriesByType("resource")
          .findLast((entry) => new URL(entry.name).pathname.endsWith("/packages/monkey-business/src/index.ts"))
        const { restoreReplay } = await import(driverUrl.name)
        const originalNow = performance.now.bind(performance)
        let clock = 0
        const restoreClock = () => Object.defineProperty(performance, "now", { configurable: true, value: originalNow })
        try {
          // Make every outer step consume a slice without depending on machine speed.
          Object.defineProperty(performance, "now", { configurable: true, value: () => (clock += 10) })
          let model = resident.actSimulation({ ...resident.initialSimulation, speed: "100" }, "start")
          model = resident.actSimulation(model, "play")
          const before = resident.simulationRun().eventCount
          model = resident.tickSimulation(model, 100)
          const published = resident.simulationReadRun()
          const pendingCount = resident.simulationRun().eventCount
          const firstGeneration = resident.simulationContinuation()
          let slices = 0
          while (true) {
            const generation = slices === 0 ? firstGeneration : resident.simulationContinuation()
            if (generation === undefined) break
            if (resident.simulationReadRun() !== published)
              throw new Error("Partial advance published a different snapshot")
            model = resident.continueSimulation(model, generation)
            if (++slices > 200) throw new Error("Logical advance did not finish")
          }
          const completedCount = resident.simulationRun().eventCount
          model = resident.tickSimulation(model, 100)
          const staleGeneration = resident.simulationContinuation()
          const exportBefore = resident.simulationRun().exportReplay()
          model = resident.actSimulation(model, "export")
          const exported = JSON.parse(model.replay)
          const flushed = resident.simulationRun().eventCount
          const { dashboard: _exportedDashboard, ...exportCore } = exported
          const restoredExport = restoreReplay(exported).exportReplay()
          model = resident.tickSimulation(model, 100)
          const pauseBefore = resident.simulationRun().exportReplay()
          model = resident.actSimulation(model, "play")
          const paused = !model.playing
          model = resident.actSimulation(model, "export")
          const pauseReplay = JSON.parse(model.replay)
          const { dashboard: _pausedDashboard, ...pauseCore } = pauseReplay
          const restoredPause = restoreReplay(pauseReplay).exportReplay()
          // Closing at the exact replay endpoint must preserve the Pause intent.
          model = resident.actSimulation(model, "replay-start")
          model = resident.actSimulation(model, "play")
          model = resident.tickSimulation(model, 100)
          let endpointSlices = 0
          while (resident.simulationRun().eventCount < pauseReplay.endpoint.eventCount) {
            const generation = resident.simulationContinuation()
            if (generation === undefined) model = resident.tickSimulation(model, 100)
            else model = resident.continueSimulation(model, generation)
            if (++endpointSlices > 300) throw new Error("Replay did not approach its exact endpoint")
          }
          model = resident.actSimulation(model, "play")
          const pausedAtReplayEndpoint = !model.playing
          model = resident.actSimulation(model, "start")
          const resetCount = resident.simulationRun().eventCount
          const resetModel = model
          model = resident.continueSimulation(model, staleGeneration)
          return {
            before,
            pendingCount,
            publishedCount: published.eventCount,
            completedCount,
            slices,
            endpoint: exported.endpoint.eventCount,
            exportBefore: exportBefore.endpoint.eventCount,
            exportNormalizations: exported.normalizations.length - exportBefore.normalizations.length,
            restoredExport,
            exportCore,
            paused,
            pausedAtReplayEndpoint,
            pauseBefore: pauseBefore.endpoint.eventCount,
            pauseAfter: pauseReplay.endpoint.eventCount,
            pauseNormalizations: pauseReplay.normalizations.length - pauseBefore.normalizations.length,
            restoredPause,
            pauseCore,
            flushed,
            resetCount,
            afterStale: resident.simulationRun().eventCount,
            unchanged: model === resetModel
          }
        } finally {
          restoreClock()
        }
      })
      assert.equal(cooperative.publishedCount, cooperative.before, "partial batch keeps the published boundary")
      assert.ok(cooperative.pendingCount > cooperative.before, "one private step executes before yielding")
      assert.equal(
        cooperative.completedCount - cooperative.before,
        100,
        "one logical advance retains the original event cap"
      )
      assert.ok(cooperative.slices > 1, "logical advance actually yielded")
      assert.equal(cooperative.endpoint, cooperative.flushed, "export finishes the pending normalized boundary")
      assert.equal(cooperative.endpoint, cooperative.exportBefore, "export closes without executing more events")
      assert.equal(cooperative.exportNormalizations, 1, "export normalizes the interrupted logical advance once")
      assert.deepEqual(
        cooperative.restoredExport,
        cooperative.exportCore,
        "export restores the exact replay including normalization records"
      )
      assert.ok(cooperative.paused, "pause stops playback during a pending advance")
      assert.ok(cooperative.pausedAtReplayEndpoint, "closing at replay completion preserves Pause intent")
      assert.equal(cooperative.pauseAfter, cooperative.pauseBefore, "pause closes without executing more events")
      assert.equal(cooperative.pauseNormalizations, 1, "pause and subsequent export add only one normalization")
      assert.deepEqual(
        cooperative.restoredPause,
        cooperative.pauseCore,
        "pause replay restores exactly including normalization records"
      )
      assert.equal(cooperative.afterStale, cooperative.resetCount, "reset invalidates an old continuation")
      assert.ok(cooperative.unchanged, "old continuation leaves reset model intact")
      const asyncOwnership = await page.evaluate(async () => {
        const loaded = performance
          .getEntriesByType("resource")
          .findLast((entry) => new URL(entry.name).pathname === "/src/simulation/index.ts")
        const resident = await import(loaded.name)
        const originalNow = performance.now.bind(performance)
        let clock = 0
        try {
          Object.defineProperty(performance, "now", { configurable: true, value: () => (clock += 10) })
          const started = () =>
            resident.actSimulation(
              resident.actSimulation({ ...resident.initialSimulation, speed: "100" }, "start"),
              "play"
            )
          let model = started()
          const before = resident.simulationRun().eventCount
          model = resident.tickSimulation(model, 100)
          const published = resident.simulationReadRun()
          const generation = resident.simulationContinuation()
          const first = resident.runSimulationContinuation(generation)
          const duplicate = resident.runSimulationContinuation(generation)
          model = resident.changeSimulation(model, "seed", "73")
          await Promise.all([first, duplicate])
          const terminalCount = resident.simulationRun().eventCount
          const terminalPublishedStable = resident.simulationReadRun() === published
          model = resident.continueSimulation(model, generation)
          const latestDraft = model.seed
          const committedCount = resident.simulationReadRun().eventCount
          const nativeReplay = resident.simulationRun().exportReplay()

          model = started()
          model = resident.tickSimulation(model, 100)
          const cancelledGeneration = resident.simulationContinuation()
          const controller = new AbortController()
          const baselineNormalizations = resident.simulationRun().exportReplay().normalizations.length
          const waiting = resident.runSimulationContinuation(cancelledGeneration, controller.signal)
          const countAtAbort = resident.simulationRun().eventCount
          controller.abort()
          await Promise.allSettled([waiting])
          const afterAbort = resident.simulationRun().eventCount
          model = resident.actSimulation(model, "export")
          const abortedReplay = JSON.parse(model.replay)
          const abortNormalizations = abortedReplay.normalizations.length - baselineNormalizations
          model = resident.actSimulation(model, "start")
          const reset = model
          const resetCount = resident.simulationRun().eventCount
          model = resident.continueSimulation(model, cancelledGeneration)
          const staleNoop = model === reset && resident.simulationRun().eventCount === resetCount

          model = started()
          model = resident.tickSimulation(model, 100)
          const actionGeneration = resident.simulationContinuation()
          const beforeActionNormalizations = resident.simulationRun().exportReplay().normalizations.length
          const actionWaiting = resident.runSimulationContinuation(actionGeneration)
          const countAtAction = resident.simulationRun().eventCount
          model = resident.actSimulation(model, "export")
          const actionReplay = JSON.parse(model.replay)
          await actionWaiting
          const actionAfterWait = resident.simulationRun().eventCount
          model = started()
          model = resident.tickSimulation(model, 100)
          const terminalGeneration = resident.simulationContinuation()
          const beforeTerminalNormalizations = resident.simulationRun().exportReplay().normalizations.length
          await resident.runSimulationContinuation(terminalGeneration)
          const beforeCancelTerminal = resident.simulationRun().eventCount
          model = resident.actSimulation(model, "export")
          const cancelledTerminalReplay = JSON.parse(model.replay)
          const beforeStaleCommit = model
          model = resident.continueSimulation(model, terminalGeneration)
          const terminalStaleCommitNoop = model === beforeStaleCommit
          const schedulerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "scheduler")
          let fallbackReplay
          try {
            Object.defineProperty(globalThis, "scheduler", { configurable: true, value: undefined })
            model = started()
            model = resident.tickSimulation(model, 100)
            const fallbackGeneration = resident.simulationContinuation()
            await resident.runSimulationContinuation(fallbackGeneration)
            model = resident.continueSimulation(model, fallbackGeneration)
            fallbackReplay = resident.simulationRun().exportReplay()
          } finally {
            if (schedulerDescriptor) Object.defineProperty(globalThis, "scheduler", schedulerDescriptor)
            else delete globalThis.scheduler
          }
          return {
            completedEvents: terminalCount - before,
            terminalPublishedStable,
            latestDraft,
            committedCount,
            terminalCount,
            countAtAbort,
            afterAbort,
            abortNormalizations,
            staleNoop,
            countAtAction,
            actionAfterWait,
            actionNormalizations: actionReplay.normalizations.length - beforeActionNormalizations,
            terminalCancelCount: cancelledTerminalReplay.endpoint.eventCount,
            beforeCancelTerminal,
            terminalCancelNormalizations: cancelledTerminalReplay.normalizations.length - beforeTerminalNormalizations,
            terminalStaleCommitNoop,
            nativeReplay,
            fallbackReplay
          }
        } finally {
          Object.defineProperty(performance, "now", { configurable: true, value: originalNow })
        }
      })
      assert.equal(asyncOwnership.completedEvents, 100, "duplicate async runners advance one logical batch")
      assert.deepEqual(
        asyncOwnership.fallbackReplay,
        asyncOwnership.nativeReplay,
        "MessageChannel fallback preserves the 100-event batch and normalization replay"
      )
      assert.ok(asyncOwnership.terminalPublishedStable, "terminal execution remains private until model commit")
      assert.equal(asyncOwnership.latestDraft, "73", "terminal commit preserves a draft edited during execution")
      assert.equal(
        asyncOwnership.committedCount,
        asyncOwnership.terminalCount,
        "commit publishes the terminal boundary"
      )
      assert.equal(
        asyncOwnership.afterAbort,
        asyncOwnership.countAtAbort,
        "aborted browser turn does not execute another step"
      )
      assert.equal(asyncOwnership.abortNormalizations, 1, "abort and action cancellation normalize only once")
      assert.ok(asyncOwnership.staleNoop, "reset rejects an aborted generation's later commit")
      assert.equal(
        asyncOwnership.actionAfterWait,
        asyncOwnership.countAtAction,
        "action cancellation stops an awaiting runner"
      )
      assert.equal(asyncOwnership.actionNormalizations, 1, "awaiting action cancellation normalizes once")
      assert.equal(
        asyncOwnership.terminalCancelCount,
        asyncOwnership.beforeCancelTerminal,
        "action after terminal execution adds no events"
      )
      assert.equal(asyncOwnership.terminalCancelNormalizations, 1, "terminal action does not normalize twice")
      assert.ok(asyncOwnership.terminalStaleCommitNoop, "cancelled terminal generation cannot commit later")
    }
    await page.close()
  }
  console.log(
    "Observed responsiveness (DOM input-to-inspection excludes pre-dispatch queue delay; long tasks cover only tasks of at least 50 ms):",
    JSON.stringify(responsiveness)
  )
  console.log(
    "Timeline browser passed: monotonic playback drag, exact paused endpoint, previous/next/latest, keyboard seek and playback resynchronization with one and six advicees."
  )
} finally {
  await browser?.close()
  await server?.close()
}
