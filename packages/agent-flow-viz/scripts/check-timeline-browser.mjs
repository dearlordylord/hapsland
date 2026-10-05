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
