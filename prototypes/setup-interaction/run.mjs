import { spawn } from "node:child_process"
import { resolveBunRuntime } from "../../scripts/pinned-bun.mjs"
const { executable } = resolveBunRuntime()
const child = spawn(executable, process.argv.slice(2), {
  cwd: import.meta.dirname,
  stdio: "inherit",
  // Explicit controlling-terminal probes must retain the caller's terminal session.
  detached: process.platform !== "win32" && !process.argv.includes("--controlling-terminal")
})
const signals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGWINCH"]
const forward = (signal) => {
  if (child.exitCode === null) child.kill(signal)
}
const handlers = signals.map((signal) => {
  const handler = () => forward(signal)
  process.on(signal, handler)
  return handler
})
let expired = false
let grace
const deadline = setTimeout(() => {
  expired = true
  child.kill("SIGTERM")
  grace = setTimeout(() => child.kill("SIGKILL"), 5000)
}, 120_000)
child.once("error", () => {
  process.stderr.write("Could not start pinned prototype runtime.\n")
  process.exitCode = 1
})
child.once("close", (code) => {
  clearTimeout(deadline)
  clearTimeout(grace)
  signals.forEach((signal, i) => process.off(signal, handlers[i]))
  process.exitCode = expired ? 1 : (code ?? 1)
})
