import assert from "node:assert/strict"
import { chromium } from "playwright"
import { createServer } from "vite"

const server = process.env.HAPSLAND_DASHBOARD_URL
  ? undefined
  : await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port: 0, hmr: false } })
let browser
try {
  await server?.listen()
  const url = process.env.HAPSLAND_DASHBOARD_URL ?? server.resolvedUrls.local[0]
  browser = await chromium.launch({ headless: true })
  for (const count of [1, 6]) {
    const page = await browser.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(url)
    await page.getByLabel("Advicee count", { exact: true }).fill(String(count))
    await page.getByRole("button", { name: "Start resident", exact: true }).click()
    await page.getByLabel("Playback speed (virtual ms / wall ms)", { exact: true }).fill("100")
    await page.getByRole("button", { name: "Apply playback speed", exact: true }).click()
    const waitUntil = (time) =>
      page.waitForFunction(
        (target) => {
          const status = document.querySelector(".simulation-status")?.textContent ?? ""
          if (status.includes("Run error:")) throw new Error(status)
          return Number(/virtual time (\d+) ms/.exec(status)?.[1] ?? 0) >= target
        },
        time,
        { timeout: 10000 }
      )
    await page.getByRole("button", { name: "Play resident", exact: true }).click()
    await waitUntil(2000)
    await page.getByRole("button", { name: "Pause resident", exact: true }).click()
    await page.getByRole("button", { name: "Export replay", exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[aria-label="Replay JSON"]').value.startsWith("{"))
    const first = JSON.parse(await page.getByLabel("Replay JSON", { exact: true }).inputValue())
    assert.ok(first.endpoint.now >= 2000)
    assert.ok(first.endpoint.eventCount > 29)
    await page.getByRole("button", { name: "Play resident", exact: true }).click()
    await waitUntil(first.endpoint.now + 1000)
    await page.getByRole("button", { name: "Pause resident", exact: true }).click()
    assert.deepEqual(errors, [])
    console.log(`Resident playback progresses beyond Jev/cache settlement and resumes: ${count} advicee(s)`)
    await page.close()
  }
} finally {
  await browser?.close()
  await server?.close()
}
