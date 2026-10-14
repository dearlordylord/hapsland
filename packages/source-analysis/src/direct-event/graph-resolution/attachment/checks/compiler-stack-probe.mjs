// Diagnostic only: pause the unchanged compiler briefly inside its hard10 run.
// Captured stacks/counters never qualify a proof or a performance measurement.
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../../../../../../..")
const control = process.argv.includes("--control")
const source = control
  ? resolve(root, "packages/agent-flow-bend/selection-ui-policy/PROOF.bend")
  : resolve(import.meta.dirname, "../ATTACHMENT_TRANSACTION_LAWS.bend")
const output = resolve(
  root,
  ".test-runs/bend-migration/compiler-stack-probe",
  new Date().toISOString().replaceAll(":", "-") + "-" + process.pid
)
await mkdir(output, { recursive: true })
const started = performance.now()
const wallStarted = Date.now()
const samples = []
const scripts = []
const thresholds = control ? [0] : [6500, 8000, 9000]
const pending = new Map()
const messages = new Map()
let breakpoint,
  stopped = false,
  connectionFailure
let socket,
  sequence = 0,
  stderr = "",
  stdout = "",
  endpointSeen = false
const child = spawn("timeout", ["--signal=KILL", "10s", "taskset", "-c", "10", "bend", source, "--verdict"], {
  cwd: root,
  env: { ...process.env, BUN_OPTIONS: "--inspect-brk=127.0.0.1:0" },
  stdio: ["ignore", "pipe", "pipe"]
})
const terminal = new Promise((done, fail) => {
  child.once("error", fail)
  child.once("exit", (code, signal) => done({ code, signal }))
})
const request = (method, params = {}) =>
  new Promise((done, fail) => {
    if (stopped) return fail(new Error("Compiler terminated"))
    const id = ++sequence
    const timer = setTimeout(() => {
      pending.delete(id)
      fail(new Error(`Inspector response deadline: ${method}`))
    }, 1000)
    pending.set(id, { done, fail, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
const arm = async () => {
  const at = thresholds.shift()
  if (at === undefined) return
  // Pinned 2.0.36 item_try entry; the executable's embedded source retains lines.
  const result = await request("Debugger.setBreakpointByUrl", {
    urlRegex: "bend$",
    lineNumber: control ? 0 : 8859,
    options: { condition: `Date.now() >= ${Math.max(wallStarted + at, Date.now() + (samples.length ? 150 : 0))}` }
  })
  breakpoint = result.breakpointId
}
const counters = `({
  definition: typeof k === "string" && k.length < 300 ? k : null,
  emitted: typeof e === "object" && e !== null && Array.isArray(e.out) ? e.out.length : null,
  queued: typeof e === "object" && e !== null && Array.isArray(e.todo) ? e.todo.length : null,
  groups: typeof e === "object" && e !== null && e.groups instanceof Map ? e.groups.size : null
})`
const paused = async (params) => {
  const frames = params.callFrames.slice(0, 8)
  const sample = {
    milliseconds: performance.now() - started,
    reason: params.reason,
    frames: frames.map(({ functionName, location }) => ({ functionName, line: location.lineNumber + 1 }))
  }
  try {
    const frame = frames.find(({ functionName }) => /^(safe_|root_cols|item_)/u.test(functionName))
    if (frame) {
      const value = await request("Debugger.evaluateOnCallFrame", {
        callFrameId: frame.callFrameId,
        expression: counters,
        returnByValue: true,
        generatePreview: false,
        doNotPauseOnExceptionsAndMuteConsole: true
      })
      sample.counters = value.result?.value
      sample.evaluationFailed = !!value.wasThrown
    }
  } catch (error) {
    sample.error = String(error)
  } finally {
    samples.push(sample)
    if (frames[0]?.functionName !== "module code") {
      if (breakpoint) await request("Debugger.removeBreakpoint", { breakpointId: breakpoint }).catch(() => {})
      await arm().catch((error) => samples.push({ error: String(error) }))
    }
    await request("Debugger.resume").catch(() => {})
  }
}
let connection
child.stdout.on("data", (data) => {
  stdout += data
})
child.stderr.on("data", (data) => {
  stderr += data
  if (endpointSeen) return
  const match = stderr.match(/ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/[^\s]+/u)
  if (!match) return
  endpointSeen = true
  connection = new Promise((done, fail) => {
    socket = new WebSocket(match[0])
    socket.addEventListener("error", () => fail(new Error("Inspector connection failed")), { once: true })
    socket.addEventListener(
      "open",
      () => {
        request("Debugger.enable")
          .then(() => request("Debugger.setBreakpointsActive", { active: true }))
          .then(arm)
          .then(() => request("Inspector.initialized"))
          .then(done, fail)
      },
      { once: true }
    )
    socket.addEventListener("message", ({ data: message }) => {
      const value = JSON.parse(String(message))
      const kind = value.method ?? "response"
      messages.set(kind, (messages.get(kind) ?? 0) + 1)
      if (value.id !== undefined) {
        const call = pending.get(value.id)
        if (!call) return
        clearTimeout(call.timer)
        pending.delete(value.id)
        if (value.error) call.fail(new Error(value.error.message))
        else call.done(value.result)
      } else if (value.method === "Debugger.paused") {
        void paused(value.params)
      } else if (value.method === "Debugger.scriptParsed") {
        if (value.params.url.includes("$bunfs")) scripts.push({ url: value.params.url, endLine: value.params.endLine })
      }
    })
  })
  // Store rejection immediately; the target may exit before the first sample.
  connection.catch((error) => {
    connectionFailure = String(error)
  })
})
let result
try {
  result = await terminal
} finally {
  stopped = true
  for (const call of pending.values()) {
    clearTimeout(call.timer)
    call.fail(new Error("Compiler terminated"))
  }
  pending.clear()
  socket?.close()
}
await writeFile(resolve(output, "compiler.log"), stdout + stderr)
const report = {
  diagnosticOnly: true,
  control,
  proofQualified: false,
  output,
  ...result,
  milliseconds: performance.now() - started,
  endpointSeen,
  connectionFailure,
  messages: Object.fromEntries(messages),
  scripts,
  samples
}
await writeFile(resolve(output, "stacks.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report))
process.exitCode = result.code ?? 1
