import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const WATCHDOG_TIMEOUT_MS = 285000
const TERMINATION_GRACE_MS = 2000
let child
let interrupted
let watchdogFired = false
let forceKill
let forceKillDone

const signalChildGroup = (signal) => {
  if (!child?.pid) return
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      /* Fall back to the direct child if its process group is gone. */
    }
  }
  child.kill(signal)
}

const scheduleForceKill = () => {
  if (forceKillDone) return
  forceKillDone = new Promise((resolve) => {
    forceKill = setTimeout(() => {
      try {
        signalChildGroup("SIGKILL")
      } finally {
        resolve()
      }
    }, TERMINATION_GRACE_MS)
  })
}

const forward = (signal) => {
  interrupted = signal
  signalChildGroup(signal)
  scheduleForceKill()
}
const onInterrupt = () => forward("SIGINT")
const onTerminate = () => forward("SIGTERM")
process.on("SIGINT", onInterrupt)
process.on("SIGTERM", onTerminate)
let watchdog
try {
  const env = { ...process.env }
  delete env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST
  delete env.HAPSLAND_NATIVE_PREFLIGHT_SESSION
  delete env.HAPSLAND_NATIVE_PREFLIGHT_MANIFEST_SHA256
  child = spawn(
    process.execPath,
    [
      join(dirname(require.resolve("vitest/package.json")), "vitest.mjs"),
      "run",
      "packages/monkey-business/src/native-run-conformance.test.ts",
      "--maxWorkers=1",
      ...process.argv.slice(2)
    ],
    { stdio: "inherit", detached: process.platform !== "win32", env }
  )
  if (interrupted) signalChildGroup(interrupted)
  watchdog = setTimeout(() => {
    watchdogFired = true
    signalChildGroup("SIGTERM")
    scheduleForceKill()
  }, WATCHDOG_TIMEOUT_MS)
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal }))
  })
  process.exitCode = result.code ?? (result.signal === "SIGINT" ? 130 : 143)
  if (watchdogFired) process.exitCode = 124
} finally {
  clearTimeout(watchdog)
  if ((watchdogFired || interrupted) && forceKillDone) await forceKillDone
  else clearTimeout(forceKill)
  process.off("SIGINT", onInterrupt)
  process.off("SIGTERM", onTerminate)
}
