import { mkdirSync, writeFileSync, renameSync } from "node:fs"
import { resolve } from "node:path"
import { createBuildWatchObserver } from "./build-watch-observation.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { runBuildWatch } from "./build-watch-coordinator.mjs"
import { withOwnedLock } from "./owned-lock.mjs"
const root = resolve(import.meta.dirname, "..")
const args = process.argv.slice(2)
if (args.some((arg) => !/^--timeout-ms=\d+$/.test(arg)))
  throw new Error("Build watch accepts only --timeout-ms=<positive integer>")
if (args.length > 1) throw new Error("Duplicate build watch timeout")
const duration = args.length ? Number(args[0].split("=")[1]) : 3600000
if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 43200000)
  throw new Error("Invalid build watch deadline")
const deadline = Date.now() + duration,
  controller = new AbortController()
const stop = () => controller.abort()
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
const observe = createBuildWatchObserver(root)
const statusPath = resolve(root, ".test-runs/watch-build.json")
mkdirSync(resolve(root, ".test-runs"), { recursive: true })
try {
  await withOwnedLock(
    resolve(root, ".test-runs/watch-build"),
    () =>
      runBuildWatch({
        observe,
        signal: controller.signal,
        deadline,
        intervalMs: 2000,
        build: () =>
          runBuildProcess(process.execPath, [resolve(root, "scripts/build-product.mjs")], {
            cwd: root,
            env: process.env,
            stdio: "inherit",
            timeout: Math.min(300000, Math.max(1, deadline - Date.now()))
          }),
        status: async (state) => {
          const record = { ...state, observedAt: new Date().toISOString(), pid: process.pid, deadline }
          writeFileSync(statusPath + ".tmp", JSON.stringify(record))
          renameSync(statusPath + ".tmp", statusPath)
          console.log(`Build watch ${state.state}${state.error ? `: ${state.error}` : ""}`)
        }
      }),
    Math.min(duration, 5000)
  )
} finally {
  process.removeListener("SIGINT", stop)
  process.removeListener("SIGTERM", stop)
}
