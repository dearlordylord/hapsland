import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "vite"
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(server.resolvedUrls.local[0])
  const inspector = page.locator("#agent-simulation")
  await inspector.getByRole("button", { name: "Start / reset", exact: true }).click()
  const controls = inspector
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: /^Completion delivery$/ }) })
  await controls.locator("summary").click()
  for (let i = 0; i < 30 && (await controls.locator("fieldset").count()) === 0; i++) {
    await inspector.getByRole("button", { name: "Single step", exact: true }).click()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  assert.ok((await controls.locator("fieldset").count()) > 0, "genuine issued completion must exist")
  const original = controls.locator("fieldset").first()
  const identity = await original.locator("legend").textContent()
  await original.getByRole("button", { name: "Hold", exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Completion delivery results"]')?.textContent.includes("Hold · Applied")
  )
  assert.equal(await original.locator("legend").textContent(), identity)
  await original.getByRole("button", { name: "Release", exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('[aria-label="Completion delivery results"]')?.textContent.includes("Release · Applied")
  )
  assert.equal(await original.locator("legend").textContent(), identity)
  await page.screenshot({ path: "/workspace/hapsland-review/callback-controls.png" })
  console.log(
    "Callback controls browser passed: actual issued completion, Hold/Release applicability and unchanged original identity."
  )
} finally {
  await browser?.close()
  await server.close()
}
