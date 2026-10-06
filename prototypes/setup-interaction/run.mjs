import { spawnSync } from "node:child_process"
import { resolveBunRuntime } from "../../scripts/pinned-bun.mjs"
const { executable } = resolveBunRuntime()
const result = spawnSync(executable, process.argv.slice(2), {
  cwd: import.meta.dirname,
  stdio: "inherit",
  timeout: 120_000
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
