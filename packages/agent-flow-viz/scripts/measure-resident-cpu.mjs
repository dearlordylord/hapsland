import { chromium } from "playwright"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

const deadline = setTimeout(() => {
  console.error("CPU evaluator exceeded10seconds")
  process.exit(124)
}, 10000)
const root = resolve(import.meta.dirname, "../../..")
const libraries = "/tmp/hapsland-browser-libs/prefix/usr/lib/aarch64-linux-gnu"
let browser
try {
  execFileSync(process.execPath, ["packages/monkey-business-bend/build.mjs", "--reuse-compiled-policy"], {
    cwd: root,
    timeout: 5000,
    stdio: "pipe"
  })
  browser = await chromium.launch({ headless: true, env: { ...process.env, LD_LIBRARY_PATH: libraries } })
  const cases = []
  for (const advicees of [1, 6]) {
    const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } })
    page.setDefaultTimeout(5000)
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("http://127.0.0.1:4181/")
    await page.getByLabel("Advicee count", { exact: true }).fill(String(advicees))
    await page.getByRole("button", { name: "Start resident", exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector(".simulation-status")?.textContent.includes("Seeded session started")
    )
    const eventsBefore = await page.evaluate(async () => {
      const loaded = performance.getEntriesByType("resource").findLast((entry) =>
        new URL(entry.name).pathname === "/src/simulation.ts"
      )
      if (!loaded) throw new Error("Active simulation module was not loaded")
      const { simulationRun } = await import(loaded.name)
      window.metricRun = simulationRun()
      if (!window.metricRun) throw new Error("Active resident was not created")
      return window.metricRun.eventCount
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Performance.enable")
    const metricsBefore = await cdp.send("Performance.getMetrics")
    await page.getByRole("button", { name: "Play resident", exact: true }).click()
    await page.waitForTimeout(1500)
    await page.getByRole("button", { name: "Pause resident", exact: true }).click()
    const metricsAfter = await cdp.send("Performance.getMetrics")
    const eventsAfter = await page.evaluate(() => window.metricRun.eventCount)
    const metric = (result, name) => result.metrics.find((entry) => entry.name === name).value
    const events = eventsAfter - eventsBefore
    const cpuMs = (metric(metricsAfter, "TaskDuration") - metric(metricsBefore, "TaskDuration")) * 1000
    if (errors.length || events <= 0 || !Number.isFinite(cpuMs) || cpuMs <= 0)
      throw new Error(`Invalid CPU sample: ${JSON.stringify({ advicees, events, cpuMs, errors })}`)
    cases.push({ advicees, events, cpuMs, cpuMsPerEvent: cpuMs / events })
    await page.close()
  }
  const value = cases.reduce((sum, entry) => sum + entry.cpuMsPerEvent, 0) / cases.length
  console.log(JSON.stringify({ cases, metric: "main_thread_cpu_ms_per_processed_event", value }))
  console.log(`METRIC main_thread_cpu_ms_per_processed_event=${value}`)
} finally {
  await browser?.close()
  clearTimeout(deadline)
}
