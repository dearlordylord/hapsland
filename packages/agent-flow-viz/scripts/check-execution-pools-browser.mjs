import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "vite"
import { createRun } from "../../monkey-business/src/index.ts"
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1512, height: 1300 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(server.resolvedUrls.local[0])
  const ensemble = page.locator("#agent-ensemble")
  const inspector = page.locator("#agent-simulation")
  const settle = () =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const click = async (name) => {
    await page.getByRole("button", { name, exact: true }).click()
    await settle()
  }
  const load = async (run) => {
    await inspector.getByLabel("Replay JSON", { exact: true }).fill(JSON.stringify(run.exportReplay()))
    await click("Load replay")
    await page.waitForFunction(() =>
      document.querySelector(".ensemble-feedback").textContent.startsWith("Replay reconstructed")
    )
    await settle()
  }
  const scopes = ["agent-1", "agent-2", "agent-3"]
  const sessions = scopes.map((agent) => ({ agent, editIntervalMs: 1000000 }))
  const edit = (index, outcome = "clear") => ({
    agent: scopes[index % 3],
    generation: 0,
    recurring: false,
    revision: index + 1,
    at: 0,
    kind: "edit",
    bytes: 10,
    unitBytes: [5],
    outcome
  })
  const poolState = () =>
    ensemble
      .locator(".stage-jev-pool")
      .evaluateAll((pools) =>
        pools.map((pool) =>
          Array.from(pool.querySelectorAll(".stage-jev-slot"), (slot) => ({
            label: slot.getAttribute("aria-label"),
            fill: slot.querySelector("rect").getAttribute("fill"),
            occupied: slot.classList.contains("occupied")
          }))
        )
      )
  const assertMirrors = async (count) => {
    const pools = await poolState()
    assert.equal(pools.length, await ensemble.locator(".ensemble-layer").count())
    for (const slots of pools) {
      assert.equal(slots.length, 8)
      assert.equal(slots.filter((slot) => slot.occupied).length, count)
      assert.deepEqual(slots, pools[0])
    }
    assert.equal(await ensemble.locator(".shared-jev").count(), 0)
    assert.equal(
      await ensemble
        .locator(".shared-resident")
        .getByText("Preparation workers · shared by all agents", { exact: true })
        .count(),
      0
    )
    const preparations = await ensemble
      .locator(".stage-preparation-pool")
      .evaluateAll((pools) =>
        pools.map((pool) =>
          Array.from(pool.querySelectorAll(".stage-preparation-slot"), (slot) => ({
            label: slot.getAttribute("aria-label"),
            fill: slot.querySelector("rect").getAttribute("fill"),
            occupied: slot.classList.contains("occupied")
          }))
        )
      )
    for (const row of preparations) {
      assert.equal(row.length, 8)
      assert.deepEqual(row, preparations[0])
    }
    return pools[0]
  }
  const empty = createRun({ sessions, inputs: [] })
  await load(empty)
  await assertMirrors(0)
  await ensemble.screenshot({ path: "/tmp/hapsland-execution-pools-empty-1512.png" })
  const partial = createRun({
    sessions,
    inputs: [edit(0), edit(1, "neverSent"), edit(2), { ...edit(3), at: 15 }, { ...edit(4), at: 15 }],
    preparationDelay: 10,
    jevDelay: 1000
  })
  partial.advance({ untilTime: 16, maxEvents: 1000 })
  assert.equal(partial.projection.dispatch.requests.length, 3)
  await load(partial)
  const partialSlots = await assertMirrors(3)
  assert.equal(partial.projection.dispatch.running.filter((job) => job.preparation).length, 2)
  assert.equal(await ensemble.locator(".stage-preparation-pool").first().locator(".occupied").count(), 2)
  assert.ok(partialSlots.some((slot) => slot.label.includes("authorized, not started")))
  assert.equal(new Set(partialSlots.filter((slot) => slot.occupied).map((slot) => slot.fill)).size, 3)
  const ownerColors = { "agent-1": "#427bc4", "agent-2": "#a16acc", "agent-3": "#169e8c" }
  for (const slot of partialSlots.filter((slot) => slot.occupied))
    assert.equal(slot.fill, ownerColors[slot.label.split(" · ")[0]])
  await ensemble.screenshot({ path: "/tmp/hapsland-execution-pools-mixed-3d-1512.png" })
  await click("Select advicee 2")
  assert.deepEqual(await assertMirrors(3), partialSlots)
  await click("Focus selected agent")
  assert.deepEqual(await assertMirrors(3), partialSlots)
  await ensemble.screenshot({ path: "/tmp/hapsland-execution-pools-mixed-flat-1512.png" })
  await ensemble.locator(".resident-execution-pools").screenshot({ path: "/tmp/hapsland-execution-pools-detail.png" })
  const attempt = ensemble.getByRole("button", { name: /Inspect shared Jev request permits/ })
  await attempt.focus()
  await page.keyboard.press("Enter")
  await settle()
  assert.match(await inspector.locator(".jev-owner-details").innerText(), /agent-1 · request #\d+ · started/)
  assert.match(
    await inspector.locator(".jev-owner-details").innerText(),
    /agent-2 · request #\d+ · authorized, not started/
  )
  await inspector
    .locator(".simulation-stage-inspector")
    .screenshot({ path: "/tmp/hapsland-execution-pools-inspector-1512.png" })
  await click("Previous event")
  const prior = JSON.parse(await inspector.locator(".simulation-details pre").textContent())
  await assertMirrors(prior.after.dispatch.requests.length)
  await click("Return to latest")
  assert.deepEqual(await assertMirrors(3), partialSlots)
  await click("Export replay")
  const exported = await inspector.getByLabel("Replay JSON", { exact: true }).inputValue()
  await inspector.getByLabel("Replay JSON", { exact: true }).fill(exported)
  await click("Load replay")
  assert.deepEqual(await assertMirrors(3), partialSlots)
  await page.setViewportSize({ width: 390, height: 844 })
  await settle()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await ensemble.screenshot({ path: "/tmp/hapsland-execution-pools-mixed-390.png" })
  const viewport = ensemble.locator(".ensemble-viewport")
  await viewport.evaluate((element) => {
    const square = element.querySelector(".resident-execution-pools")
    const box = square.getBoundingClientRect()
    const view = element.getBoundingClientRect()
    element.scrollLeft += box.left - view.left - (element.clientWidth - box.width) / 2
  })
  await settle()
  const visibleSquare = await ensemble.locator(".resident-execution-pools").boundingBox()
  const viewportBox = await viewport.boundingBox()
  assert.ok(
    visibleSquare.x >= viewportBox.x && visibleSquare.x + visibleSquare.width <= viewportBox.x + viewportBox.width
  )
  await viewport.screenshot({ path: "/tmp/hapsland-execution-pools-mixed-scrolled-390.png" })
  await attempt.focus()
  await page.keyboard.press("Enter")
  await settle()
  // Enter toggles an already focused lifecycle off; Enter again restores keyboard inspection.
  if (!(await inspector.locator(".jev-owner-details").count())) {
    await attempt.focus()
    await page.keyboard.press("Enter")
    await settle()
  }
  assert.match(
    await inspector.locator(".jev-owner-details").innerText(),
    /agent-2 · request #\d+ · authorized, not started/
  )
  await inspector
    .locator(".simulation-stage-inspector")
    .screenshot({ path: "/tmp/hapsland-execution-pools-inspector-390.png" })
  await ensemble.getByRole("button", { name: /Inspect shared Preparation workers/ }).focus()
  await page.keyboard.press("Enter")
  await settle()
  assert.match(await inspector.locator(".preparation-owner-details").innerText(), /agent-1 · preparation operation/)
  await inspector
    .locator(".simulation-stage-inspector")
    .screenshot({ path: "/tmp/hapsland-execution-pools-preparation-inspector-390.png" })
  partial.advance({ untilTime: 1030, maxEvents: 1000 })
  assert.equal(partial.projection.dispatch.requests.length, 0)
  await load(partial)
  await assertMirrors(0)
  await ensemble.screenshot({ path: "/tmp/hapsland-execution-pools-released-390.png" })
  await page.setViewportSize({ width: 1512, height: 1300 })
  const full = createRun({
    sessions,
    inputs: Array.from({ length: 8 }, (_, index) => edit(index)),
    jevDelay: 1000,
    limits: { globalItems: 64, globalBytes: 8000, partitionItems: 16, partitionBytes: 4000 }
  })
  full.advance({ untilTime: 10, maxEvents: 1000 })
  assert.equal(full.projection.dispatch.requests.length, 8)
  await load(full)
  await assertMirrors(8)
  await ensemble.screenshot({ path: "/tmp/hapsland-execution-pools-full-1512.png" })
  const fullPreparation = createRun({
    sessions,
    inputs: Array.from({ length: 8 }, (_, index) => edit(index)),
    preparationDelay: 1000,
    limits: { globalItems: 64, globalBytes: 8000, partitionItems: 16, partitionBytes: 4000 }
  })
  fullPreparation.advance({ untilTime: 10, maxEvents: 1000 })
  await load(fullPreparation)
  await assertMirrors(0)
  assert.equal(fullPreparation.projection.dispatch.running.filter((job) => job.preparation).length, 8)
  for (const pool of await ensemble.locator(".stage-preparation-pool").all())
    assert.equal(await pool.locator(".occupied").count(), 8)
  await ensemble.screenshot({ path: "/tmp/hapsland-execution-pools-preparation-full-1512.png" })
  assert.deepEqual(errors, [])
  console.log(
    "Execution pools browser passed: empty, mixed owners/ready-started, eight held, release, same resident mirrors/colors, selection, history/reload, keyboard inspector, 3D/flat/narrow."
  )
} finally {
  await browser?.close()
  await server.close()
}
