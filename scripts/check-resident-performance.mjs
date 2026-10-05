import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const deadline = Date.now() + 60000
const env = { ...process.env, LD_LIBRARY_PATH: "/tmp/hapsland-browser-libs/prefix/usr/lib/aarch64-linux-gnu" }
const run = (args, cwd = root) => {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error("Resident correctness checks exceeded60seconds")
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: "inherit", timeout: remaining })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Resident check failed: ${args.join(" ")}`)
}
run([
  "scripts/test-harness/run-checks.mjs",
  "focused",
  "packages/monkey-business/src/cache-quiet-liveness.test.ts",
  "packages/monkey-business/src/cache-composition.test.ts",
  "src/canonical/simulation-adapter.test.ts",
  "src/canonical/boundary.test.ts",
  "--timeout-ms=55000"
])
run(["scripts/check-resident-liveness-browser.mjs"], resolve(root, "packages/agent-flow-viz"))
run(["scripts/check-timeline-browser.mjs"], resolve(root, "packages/agent-flow-viz"))
