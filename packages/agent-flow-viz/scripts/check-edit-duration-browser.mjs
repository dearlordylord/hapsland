import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"
import { createServer } from "vite"
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } })
  await page.goto(server.resolvedUrls.local[0])
  const click = async (name) => {
    await page.getByRole("button", { name, exact: true }).click()
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
  await page.getByLabel("Agent count", { exact: true }).fill("3")
  await page.getByLabel("Simulated edit duration (virtual ms)", { exact: true }).fill("300")
  await click("Start resident")
  for (let i = 0; i < 3; i++) await click("Single step")
  const frame = JSON.parse(await page.locator("#agent-simulation .simulation-details pre").textContent())
  const occupied = frame.after.admissions.flatMap((a) => a.permits).length
  assert.ok(occupied > 1)
  await page.getByLabel("Simulated edit duration (virtual ms)", { exact: true }).fill("20")
  await click("Apply edit duration")
  await click("Export replay")
  const replay = JSON.parse(await page.getByLabel("Replay JSON", { exact: true }).inputValue())
  assert.equal(replay.controls.at(-1).control.kind, "editDuration")
  assert.equal(replay.controls.at(-1).control.agent, "agent-1")
  assert.equal(replay.controls.at(-1).control.durationMs, 20)
  assert.deepEqual(
    replay.config.sessions.map((s) => s.editDurationMs),
    [300, 300, 300]
  )
  await click("Select agent 2")
  assert.equal(await page.getByLabel("Simulated edit duration (virtual ms)", { exact: true }).inputValue(), "300")
  await click("Select agent 1")
  assert.equal(await page.getByLabel("Simulated edit duration (virtual ms)", { exact: true }).inputValue(), "20")
  await mkdir("/workspace/hapsland-review/edit-duration", { recursive: true })
  await page
    .locator("#agent-ensemble")
    .screenshot({ path: "/workspace/hapsland-review/edit-duration/shared-permits.png" })
  await page.locator("#agent-simulation").screenshot({ path: "/workspace/hapsland-review/edit-duration/settings.png" })
  await click("Load replay")
  assert.equal(await page.getByLabel("Simulated edit duration (virtual ms)", { exact: true }).inputValue(), "20")
  const restored = JSON.parse(await page.locator("#agent-simulation .simulation-details pre").textContent())
  assert.equal(restored.after.admissions.flatMap((a) => a.permits).length, occupied)
  const field = page.getByLabel("Simulated edit duration (virtual ms)", { exact: true })
  assert.equal(await field.getAttribute("min"), "0")
  assert.equal(await field.getAttribute("max"), "1000000000")
  await field.fill("-1")
  assert.equal(await field.evaluate((n) => n.checkValidity()), false)
  console.log(
    `Edit duration browser passed: ${occupied} shared permits; initial all-agent duration, selected-agent future Apply, selection/load values, bounded input.`
  )
} finally {
  await browser?.close()
  await server.close()
}
