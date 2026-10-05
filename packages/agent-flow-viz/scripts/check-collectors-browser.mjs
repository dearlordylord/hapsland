import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "vite"
import { createRun } from "../../monkey-business/src/index.ts"
const directory = "/workspace/hapsland-review/collectors"
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1512, height: 1300 } })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(server.resolvedUrls.local[0])
  const ensemble = page.locator("#agent-ensemble"),
    inspector = page.locator("#agent-simulation")
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
  const node = () => ensemble.getByRole("button", { name: "Inspect Advice collection", exact: true })
  const check = async (projection, metadata) => {
    const rows = ensemble.locator(".collection-shared-collectors")
    assert.equal(await rows.count(), await ensemble.locator(".ensemble-layer").count())
    const mirrors = await rows.evaluateAll((elements) => elements.map((element) => element.outerHTML))
    for (const mirror of mirrors) assert.equal(mirror, mirrors[0])
    const maximum = metadata?.collectors?.capacity,
      used = projection.collection.claims.length
    for (const row of await rows.all()) {
      assert.equal(
        await row.getAttribute("aria-label"),
        `Shared background collectors: ${maximum === undefined ? `${used} used; limit not recorded` : `${used} of ${maximum}`}`
      )
      assert.equal(await row.locator(".collection-collector-fill").count(), maximum === undefined ? 0 : 1)
      if (maximum !== undefined)
        assert.ok(
          Math.abs(
            Number(await row.locator(".collection-collector-fill").getAttribute("width")) - (used / maximum) * 57
          ) < 1e-8
        )
      const title = await row.locator("title").textContent()
      for (const claim of projection.collection.claims)
        assert.ok(title.includes(`Group ${claim.group} · collector token ${claim.owner}`))
    }
    assert.equal(await ensemble.locator(".shared-secondary-resources").count(), 0)
    assert.doesNotMatch(await ensemble.locator(".shared-resident").innerText(), /Background collectors/)
    assert.match(await ensemble.locator(".shared-resident").innerText(), /ONE RESIDENT/)
  }
  const sessions = ["agent-1", "agent-2", "agent-3"].map((agent) => ({ agent, editIntervalMs: 1000000 }))
  const event = (at, event) => ({ at, kind: "canonical", event })
  const run = createRun({
    sessions,
    inputs: [
      event(0, { kind: "reserveCapacity", partition: 1, bytes: 5, purpose: "observationDispatch" }),
      event(1, { kind: "collectionClaimBackground", group: 1, token: 101, active: true, capacity: 3 }),
      event(2, { kind: "collectionClaimBackground", group: 2, token: 202, active: true, capacity: 3 }),
      event(3, { kind: "collectionReleaseBackground", group: 1, token: 999 }),
      event(4, { kind: "collectionReleaseBackground", group: 1, token: 101 }),
      event(5, { kind: "collectionExpireBackground", group: 2, token: 202, elapsed: 5, lifetime: 5 })
    ]
  })
  run.advance({ untilTime: 2, maxEvents: 100 })
  assert.equal(run.projection.collection.claims.length, 2)
  assert.equal(run.projection.collection.leases.length, 0)
  assert.equal(run.projection.delivery.slots.length, 0)
  await load(run)
  await check(run.projection, run.capacityMetadata)
  await ensemble.screenshot({ path: `${directory}/after-occupied-3d.png` })
  await click("Focus selected advicee")
  await check(run.projection, run.capacityMetadata)
  await ensemble.screenshot({ path: `${directory}/after-occupied-focus.png` })
  await node().screenshot({ path: `${directory}/after-occupied-detail.png` })
  await node().click()
  await settle()
  assert.match(
    await inspector.locator(".stage-resource-details").innerText(),
    /Resident background collectors\s+2 \/ 3/
  )
  assert.match(await inspector.locator(".stage-resource-details").innerText(), /Group 1 · collector token 101/)
  assert.match(await inspector.locator(".stage-resource-details").innerText(), /Group 2 · collector token 202/)
  await click("Select advicee 2")
  await check(run.projection, run.capacityMetadata)
  await page.setViewportSize({ width: 390, height: 844 })
  await settle()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  const viewport = ensemble.locator(".ensemble-viewport")
  await viewport.evaluate((element) => {
    const box = element.querySelector('.topology-node[aria-label="Inspect Advice collection"]').getBoundingClientRect(),
      view = element.getBoundingClientRect()
    element.scrollLeft += box.left - view.left - (element.clientWidth - box.width) / 2
  })
  await settle()
  await viewport.screenshot({ path: `${directory}/after-occupied-narrow.png` })
  await page.setViewportSize({ width: 1512, height: 1300 })
  run.advance({ untilTime: 3, maxEvents: 100 })
  assert.equal(run.projection.collection.claims.length, 2)
  await load(run)
  await check(run.projection, run.capacityMetadata)
  run.advance({ untilTime: 4, maxEvents: 100 })
  assert.equal(run.projection.collection.claims.length, 1)
  await load(run)
  await check(run.projection, run.capacityMetadata)
  await node().screenshot({ path: `${directory}/after-released-detail.png` })
  run.advance({ untilTime: 5, maxEvents: 100 })
  assert.equal(run.projection.collection.claims.length, 0)
  await load(run)
  await check(run.projection, run.capacityMetadata)
  await node().screenshot({ path: `${directory}/after-expired-detail.png` })
  await click("Export replay")
  await click("Load replay")
  await check(run.projection, run.capacityMetadata)
  for (let index = 0; index < 5; index++) await click("Previous event")
  const prior = JSON.parse(await inspector.locator(".simulation-details pre").textContent())
  assert.equal(prior.capacityMetadata.collectors, undefined)
  await check(prior.after, prior.capacityMetadata)
  await node().screenshot({ path: `${directory}/after-historical-unknown-detail.png` })
  await click("Return to latest")
  await check(run.projection, run.capacityMetadata)
  const full = createRun({
    sessions,
    inputs: [event(0, { kind: "collectionClaimBackground", group: 1, token: 1, active: true, capacity: 1 })]
  })
  full.advance({ untilTime: 0, maxEvents: 100 })
  await load(full)
  await check(full.projection, full.capacityMetadata)
  await node().screenshot({ path: `${directory}/after-full-custom-limit-detail.png` })
  assert.deepEqual(errors, [])
  console.log(
    "Collector browser passed: checked occupied/wrong-token/release/expiry/custom-full/history-unknown, resident mirrors across agent selection, exact recorded limits/no unknown fill, group tokens in inspector/title, claims distinct from leases/output, top duplicate removed, 3D/focus/narrow/reload."
  )
} finally {
  await browser?.close()
  await server.close()
}
