import { chromium } from "playwright"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

// Measure the served production bundle. Each process has a ten-second deadline;
// setup/build time is excluded, and each case stops after actual event progress.
const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.split("=")
    return [key, value.join("=")]
  })
)
const url = options["--url"] ?? "http://127.0.0.1:4180/index.html"
const targetEvents = Number(options["--events"] ?? 1200)
const advicees = options["--advicees"] ? [Number(options["--advicees"])] : [1, 6]
if (!Number.isSafeInteger(targetEvents) || targetEvents < 1 || advicees.some((count) => ![1, 6].includes(count)))
  throw new Error("Expected a positive event target and one or six advicees")
let stage = "launch"
const deadline = setTimeout(() => {
  console.error(`CPU evaluator exceeded ten seconds during ${stage}`)
  process.exit(124)
}, 10000)
let browser
try {
  browser = await chromium.launch({ headless: true })
  const cases = []
  for (const count of advicees) {
    stage = `setup (${count} advicees)`
    const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } })
    page.setDefaultTimeout(5000)
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(url)
    const bundle = await page.evaluate(
      () =>
        performance.getEntriesByType("resource").find((entry) => /\/assets\/dashboard-[^/]+\.js$/.test(entry.name))
          ?.name
    )
    if (!bundle) throw new Error("CPU evaluation requires a production dashboard bundle")
    await page.getByLabel("Advicee count", { exact: true }).fill(String(count))
    await page.getByLabel("Seed", { exact: true }).fill("7")
    await page.getByRole("button", { name: "Start resident", exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector(".simulation-status")?.textContent.includes("Seeded session started")
    )
    const eventEndpoint = () =>
      page.getByLabel("Retained event timeline", { exact: true }).getAttribute("max").then(Number)
    // A freshly started Run has no events and renders a zero slider endpoint.
    // After progress, Observation.sequence is eventCount - 1; structural frames
    // do not enter this history. Do not mistake the initial zero for one event.
    const before = 0
    if ((await eventEndpoint()) !== 0 || (await page.locator(".simulation-history button").count()) !== 0)
      throw new Error("Expected a fresh Run without processed events")
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Performance.enable", { timeDomain: "threadTicks" })
    await page.evaluate(() => {
      const durations = []
      const observer = new PerformanceObserver((list) => {
        durations.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration })))
      })
      observer.observe({ type: "longtask" })
      window.playbackLongTasks = { durations, observer }
    })
    if (options["--profile"]) {
      await cdp.send("Profiler.enable")
      await cdp.send("Profiler.setSamplingInterval", { interval: 1000 })
      await cdp.send("Profiler.start")
    }
    const prior = await cdp.send("Performance.getMetrics")
    stage = `playback (${count} advicees)`
    const started = performance.now()
    await page.getByRole("button", { name: "Play resident", exact: true }).evaluate((button) => button.click())
    await page
      .waitForFunction(
        (target) => {
          if (!document.querySelector(".simulation-history button")) return false
          if (Number(document.querySelector('[aria-label="Retained event timeline"]')?.max) < target) return false
          const pause = [...document.querySelectorAll("button")].find(
            (button) => button.textContent === "Pause resident"
          )
          if (!pause) throw new Error("Pause control missing")
          pause.click()
          return true
        },
        targetEvents - 1,
        { polling: "raf", timeout: 7000 }
      )
      .catch((cause) => {
        if (errors.length) throw new Error(`Production playback failed: ${errors.join("; ")}`, { cause })
        throw cause
      })
    await page.waitForFunction(() => document.querySelector(".simulation-status")?.textContent.startsWith("Paused"))
    const elapsedMs = performance.now() - started
    const after = await cdp.send("Performance.getMetrics")
    const longTasks = await page.evaluate(() => {
      const { durations, observer } = window.playbackLongTasks
      durations.push(
        ...observer.takeRecords().map((entry) => ({ startTime: entry.startTime, duration: entry.duration }))
      )
      observer.disconnect()
      return durations
    })
    if (options["--profile"]) {
      const { profile } = await cdp.send("Profiler.stop")
      const path = `${options["--profile"]}.${count}.cpuprofile`
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(profile))
    }
    const events = (await eventEndpoint()) + 1
    const virtualTimeMs = Number(
      (await page.locator(".simulation-status").textContent())?.match(/virtual time (\d+) ms/)?.[1]
    )
    const delta = (name) => {
      const value = (result) => result.metrics.find((entry) => entry.name === name)?.value
      return (value(after) - value(prior)) * 1000
    }
    // Chromium ThreadTime uses the main thread CPU clock even when the host
    // schedules other jobs. Wall elapsed time is reported separately.
    const cpuMs = delta("ThreadTime")
    if (errors.length || events < targetEvents || !Number.isFinite(cpuMs) || cpuMs <= 0)
      throw new Error(`Invalid CPU sample: ${JSON.stringify({ count, events, cpuMs, errors })}`)
    cases.push({
      advicees: count,
      seed: 7,
      before,
      events,
      virtualTimeMs,
      cpuMs,
      cpuMsPerEvent: cpuMs / events,
      elapsedMs,
      taskCpuMs: delta("TaskDuration"),
      scriptCpuMs: delta("ScriptDuration"),
      layoutCpuMs: delta("LayoutDuration"),
      styleCpuMs: delta("RecalcStyleDuration"),
      observedLongTaskCount: longTasks.length,
      maxObservedLongTaskMs: Math.max(0, ...longTasks.map((entry) => entry.duration)),
      observedLongTasks: longTasks,
      bundle
    })
    await page.close()
  }
  const value = cases.reduce((sum, entry) => sum + entry.cpuMsPerEvent, 0) / cases.length
  console.log(
    JSON.stringify({
      metric: "main_thread_cpu_ms_per_processed_event",
      timeDomain: "threadTicks",
      evaluatorVersion: 2,
      cases,
      value
    })
  )
  console.log(`METRIC main_thread_cpu_ms_per_processed_event=${value}`)
} finally {
  await browser?.close()
  clearTimeout(deadline)
}
