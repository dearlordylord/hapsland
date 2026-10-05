import { execFileSync, fork, spawn } from "node:child_process"
import { availableParallelism } from "node:os"
import { fileURLToPath } from "node:url"

// Busy workers announce readiness before pressure starts. A timer bounds the
// fixture; readiness and child exit, never elapsed sleeps, order the run.
if (process.argv.includes("--worker")) {
  process.send({ phase: "ready" })
  process.on("message", (message) => {
    if (message === "start") {
      let value = 1
      while (true) value = Math.imul(value ^ 0x12345678, 1664525)
    }
  })
} else {
  if (process.platform !== "linux") throw new Error("CPU contention fixture requires Linux taskset")
  const affinity = execFileSync("taskset", ["-pc", String(process.pid)], { encoding: "utf8", timeout: 5000 })
    .trim()
    .split(":")
    .at(-1)
    .trim()
  const cpus = affinity
    .split(",")
    .flatMap((range) => {
      const [first, last = first] = range.split("-").map(Number)
      return Array.from({ length: last - first + 1 }, (_, index) => first + index)
    })
    .slice(0, 4)
  execFileSync("taskset", ["-pc", cpus.join(","), String(process.pid)], { timeout: 5000, stdio: "ignore" })
  const workerCount = Math.min(2, Math.max(1, cpus.length - 1))
  const limitMs = 30 * 60 * 1000
  const workers = []
  let suite
  let expired = false
  let stopping = false
  let pressureFailed = false
  const cleanup = () => {
    stopping = true
    for (const child of workers) child.kill("SIGKILL")
    if (suite?.pid) {
      try {
        process.kill(-suite.pid, "SIGKILL")
      } catch (error) {
        if (error.code !== "ESRCH") throw error
      }
    }
  }
  const timer = setTimeout(() => {
    expired = true
    console.error("Test harness phase=contention suite; deadline=1800000ms")
    cleanup()
  }, limitMs)
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, cleanup)
  try {
    await Promise.all(
      Array.from(
        { length: workerCount },
        () =>
          new Promise((resolve, reject) => {
            const child = fork(fileURLToPath(import.meta.url), ["--worker"], {
              stdio: ["ignore", "ignore", "inherit", "ipc"]
            })
            workers.push(child)
            child.once("error", reject)
            child.once("exit", (code) => reject(new Error(`Test harness phase=pressure startup; child exited ${code}`)))
            child.once("message", (message) => {
              if (message?.phase === "ready") resolve()
              else reject(new Error("Test harness phase=pressure startup; invalid readiness"))
            })
          })
      )
    )
    for (const child of workers) {
      child.on("exit", () => {
        if (!stopping) {
          pressureFailed = true
          console.error("Test harness phase=CPU pressure; worker exited during suite")
          cleanup()
        }
      })
      child.send("start")
    }
    console.log(
      JSON.stringify({
        fixture: "bounded CPU contention",
        cpus,
        workers: workerCount,
        availableParallelism: availableParallelism(),
        limitMs
      })
    )
    if (pressureFailed) throw new Error("Test harness phase=CPU pressure; worker unavailable")
    suite = spawn("npm", ["test"], { stdio: "inherit", detached: true })
    const result = await new Promise((resolve, reject) => {
      suite.once("error", reject)
      suite.once("exit", (code, signal) => resolve({ code, signal }))
    })
    process.exitCode = expired || pressureFailed ? 1 : (result.code ?? 1)
    console.log(JSON.stringify({ phase: "contention suite complete", ...result, expired, pressureFailed }))
  } finally {
    clearTimeout(timer)
    cleanup()
    let cleanupTimer
    try {
      await Promise.race([
        Promise.all(
          workers.map((child) =>
            child.exitCode !== null || child.signalCode !== null
              ? undefined
              : new Promise((resolve) => child.once("exit", resolve))
          )
        ),
        new Promise((_, reject) => {
          cleanupTimer = setTimeout(
            () => reject(new Error("Test harness phase=pressure cleanup; deadline=10000ms")),
            10_000
          )
        })
      ])
      console.log(JSON.stringify({ phase: "pressure cleanup", workersReaped: workers.length }))
    } finally {
      clearTimeout(cleanupTimer)
    }
  }
}
