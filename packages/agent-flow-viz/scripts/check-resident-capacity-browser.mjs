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
  const owners = ["agent-1", "agent-2", "agent-3"]
  const sessions = owners.map((agent) => ({ agent, editIntervalMs: 1000000 }))
  const colors = ["#427bc4", "#a16acc", "#169e8c"]
  const assertLedger = async (projection) => {
    const insets = ensemble.locator(".resident-capacity-inset")
    assert.equal(await insets.count(), await ensemble.locator(".ensemble-layer").count())
    const mirrors = await insets.evaluateAll((elements) => elements.map((element) => element.outerHTML))
    for (const mirror of mirrors) assert.equal(mirror, mirrors[0])
    for (const kind of ["items", "bytes"]) {
      const maximum = projection.limits[kind === "items" ? "globalItems" : "globalBytes"]
      assert.equal(
        await insets.first().locator(`.resident-capacity-${kind} .resident-capacity-total`).textContent(),
        `${projection.global[kind]} / ${maximum}`
      )
      const segments = await insets
        .first()
        .locator(`.resident-capacity-${kind} .resident-capacity-owner`)
        .evaluateAll((elements) =>
          elements.map((element) => ({
            label: element.getAttribute("aria-label"),
            fill: element.querySelector("rect").getAttribute("fill"),
            width: Number(element.querySelector("rect").getAttribute("width"))
          }))
        )
      assert.deepEqual(
        segments.map((segment) => segment.label),
        projection.partitions.map((partition) => `${owners[partition.partition - 1]}: ${partition[kind]} ${kind}`)
      )
      for (let index = 0; index < segments.length; index++) {
        assert.equal(segments[index].fill, colors[projection.partitions[index].partition - 1])
        assert.ok(Math.abs(segments[index].width - (projection.partitions[index][kind] / maximum) * 218) < 1e-8)
      }
    }
    assert.equal(await ensemble.locator(".shared-ledger").count(), 0)
    assert.equal(await ensemble.locator(".shared-secondary-resources").count(), 0)
    assert.doesNotMatch(await ensemble.locator(".shared-resident").innerText(), /Edit permits|Background collectors/)
    assert.equal(await ensemble.locator(".resident-execution-pools").count(), await insets.count())
    for (const layer of await ensemble.locator(".ensemble-layer").all()) {
      const classes = await layer.getAttribute("class")
      const partition = Number(classes.match(/agent-index-(\d+)/)[1]) + 1
      const usage = projection.partitions.find((owner) => owner.partition === partition)
      const admission = await layer
        .getByRole("button", { name: "Inspect Admission & capacity", exact: true })
        .textContent()
      assert.ok(admission.includes(`Items ${usage?.items ?? 0}/${projection.limits.partitionItems}`))
      assert.ok(admission.includes(`Bytes ${usage?.bytes ?? 0}/${projection.limits.partitionBytes}`))
    }
  }
  const empty = createRun({ sessions, inputs: [] })
  await load(empty)
  await assertLedger(empty.projection)
  await ensemble.screenshot({ path: "/workspace/hapsland-review/global-capacity/empty-3d.png" })
  const mixed = createRun({
    sessions,
    inputs: owners.map((agent, index) => ({
      agent,
      generation: 0,
      recurring: false,
      revision: index + 1,
      at: 0,
      kind: "edit",
      bytes: 70 + index * 20,
      unitBytes: [35 + index * 10],
      outcome: "clear"
    })),
    preparationDelay: 10,
    jevDelay: 1000
  })
  mixed.advance({ untilTime: 16, maxEvents: 1000 })
  await load(mixed)
  await assertLedger(mixed.projection)
  await ensemble.screenshot({ path: "/workspace/hapsland-review/global-capacity/mixed-3d.png" })
  await click("Select advicee 2")
  await assertLedger(mixed.projection)
  await click("Focus selected agent")
  await assertLedger(mixed.projection)
  await ensemble.screenshot({ path: "/workspace/hapsland-review/global-capacity/mixed-flat.png" })
  await ensemble
    .locator(".resident-capacity-inset")
    .screenshot({ path: "/workspace/hapsland-review/global-capacity/mixed-detail.png" })
  await ensemble.getByRole("button", { name: /Inspect shared resident capacity/ }).focus()
  await page.keyboard.press("Enter")
  await settle()
  assert.match(await inspector.locator(".simulation-stage-inspector").innerText(), /Admission/)
  await click("Previous event")
  const prior = JSON.parse(await inspector.locator(".simulation-details pre").textContent())
  await assertLedger(prior.after)
  await click("Return to latest")
  await assertLedger(mixed.projection)
  await click("Export replay")
  await click("Load replay")
  await settle()
  await assertLedger(mixed.projection)
  await page.setViewportSize({ width: 390, height: 844 })
  await settle()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  const viewport = ensemble.locator(".ensemble-viewport")
  await viewport.evaluate((element) => {
    const box = element.querySelector(".resident-capacity-inset").getBoundingClientRect()
    const view = element.getBoundingClientRect()
    element.scrollLeft += box.left - view.left - (element.clientWidth - box.width) / 2
  })
  await settle()
  const insetBox = await ensemble.locator(".resident-capacity-inset").boundingBox()
  const viewportBox = await viewport.boundingBox()
  assert.ok(insetBox.x >= viewportBox.x && insetBox.x + insetBox.width <= viewportBox.x + viewportBox.width)
  await viewport.screenshot({ path: "/workspace/hapsland-review/global-capacity/mixed-narrow-scrolled.png" })
  mixed.advance({ untilTime: 1100, maxEvents: 1000 })
  await load(mixed)
  await assertLedger(mixed.projection)
  assert.equal(mixed.projection.global.items, 0)
  assert.equal(mixed.projection.global.bytes, 0)
  await page.setViewportSize({ width: 1512, height: 1300 })
  const full = createRun({
    sessions,
    inputs: owners.map((agent, index) => ({
      agent,
      generation: 0,
      recurring: false,
      revision: index + 1,
      at: 0,
      kind: "edit",
      bytes: 70 + index * 20,
      unitBytes: [35 + index * 10],
      outcome: "clear"
    })),
    preparationDelay: 1000,
    limits: { globalItems: 3, globalBytes: 270, partitionItems: 3, partitionBytes: 270 }
  })
  full.advance({ untilTime: 10, maxEvents: 1000 })
  assert.equal(full.projection.global.items, 3)
  assert.equal(full.projection.global.bytes, 270)
  await load(full)
  await assertLedger(full.projection)
  await ensemble.screenshot({ path: "/workspace/hapsland-review/global-capacity/full-flat.png" })
  await ensemble
    .locator(".resident-capacity-inset")
    .screenshot({ path: "/workspace/hapsland-review/global-capacity/full-detail.png" })
  const retained = createRun({
    sessions,
    inputs: [
      {
        agent: "agent-1",
        generation: 0,
        recurring: false,
        revision: 1,
        at: 0,
        kind: "edit",
        bytes: 70,
        unitBytes: [35],
        outcome: "finding"
      }
    ],
    preparationDelay: 10,
    jevDelay: 20
  })
  retained.advance({ untilTime: 100, maxEvents: 1000 })
  assert.equal(retained.projection.global.items, 1)
  assert.equal(retained.projection.global.bytes, 35)
  assert.ok(retained.projection.charges.some((charge) => charge.purpose === "storedResult"))
  assert.equal(retained.projection.dispatch.requests.length, 0)
  assert.equal(retained.projection.dispatch.running.filter((job) => job.preparation).length, 0)
  await load(retained)
  await assertLedger(retained.projection)
  for (const pool of await ensemble.locator(".stage-preparation-pool, .stage-jev-pool").all())
    assert.equal(await pool.locator(".occupied").count(), 0)
  for (const layer of await ensemble.locator(".ensemble-layer").all()) {
    const capacity = layer.locator(".resident-capacity-inset")
    const execution = layer.locator(".resident-execution-pools")
    assert.match(await capacity.textContent(), /ONE RESIDENTWork reservations · shared by all agents/)
    assert.match(await execution.textContent(), /ONE RESIDENTExecution limits · shared by all agents/)
    for (const panel of [capacity, execution])
      assert.equal(await panel.locator(":scope > rect").getAttribute("stroke"), "#168f83")
  }
  await ensemble.screenshot({ path: "/workspace/hapsland-review/global-capacity/retained-idle-flat.png" })
  await ensemble
    .locator(".resident-capacity-inset")
    .screenshot({ path: "/workspace/hapsland-review/global-capacity/retained-capacity-detail.png" })
  await ensemble
    .locator(".resident-execution-pools")
    .screenshot({ path: "/workspace/hapsland-review/global-capacity/retained-execution-detail.png" })
  assert.deepEqual(errors, [])
  console.log(
    "Resident capacity browser passed: empty/mixed/released/full at custom maxima, stored result reserves items/bytes while both execution pools are idle, exact totals/maxima/ownership, shared family with distinct roles, mirrors, selection, flat/3D/narrow, history/reload, keyboard Admission inspection."
  )
} finally {
  await browser?.close()
  await server.close()
}
