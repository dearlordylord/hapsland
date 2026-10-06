import { spawn, spawnSync, execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { strict as assert } from "node:assert"

const sourceOnly = process.argv.includes("--source-only")
const declarationPath = process.argv.slice(2).find((argument) => !argument.startsWith("--"))
if (!declarationPath && !sourceOnly)
  throw new Error(
    "usage: HAPSLAND_BUILD_BUN=PINNED_BUN node scripts/check-runtime-clock.mjs DECLARATION.json | --source-only"
  )
const declaration = sourceOnly ? undefined : JSON.parse(readFileSync(declarationPath, "utf8"))
const bun = process.env.HAPSLAND_BUILD_BUN ?? "bun"
const version = spawnSync(bun, ["--version"], { encoding: "utf8", timeout: 10_000 })
assert.equal(version.status, 0, "pinned Bun must be available")
assert.equal(version.stdout.trim(), "1.3.14", "clock witness requires Bun 1.3.14")
const source = pathToFileURL(
  resolve(dirname(import.meta.filename), "../packages/resident-transport/src/resident/hook-clock.ts")
).href
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^(?:REVIEW_|HAPSLAND_)/u.test(key) && !["NODE_OPTIONS", "NODE_V8_COVERAGE"].includes(key)
  )
)
const machineNow = () => Number(process.hrtime.bigint()) / 1_000_000
const probe = (runtime, delayMs) => {
  const lower = machineNow()
  const code = `await new Promise(done => setTimeout(done, ${delayMs})); const clock = await import(${JSON.stringify(source)}); console.log(JSON.stringify({now:clock.monotonicNow(),startedAt:clock.hookProcessStartedAt}));`
  const result = spawnSync(runtime, ["--input-type=module", "-e", code], { encoding: "utf8", env, timeout: 15_000 })
  const upper = machineNow()
  assert.equal(result.status, 0, "clock subprocess must finish successfully")
  const clock = JSON.parse(result.stdout)
  assert(clock.now >= lower && clock.now <= upper, "child clock must fall in the parent OS-monotonic interval")
  assert(
    clock.startedAt >= lower - 100 && clock.startedAt <= upper,
    "process start must share the parent OS-monotonic coordinate"
  )
  assert(clock.now - clock.startedAt >= delayMs, "pre-import delay must count against the original admission window")
  return clock
}
const normal = [probe(process.execPath, 0), probe(bun, 0)]
const delayed = [probe(process.execPath, 2_600), probe(bun, 2_600)]
if (sourceOnly) {
  console.log(
    JSON.stringify({
      mode: "source-only",
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      bunVersion: version.stdout.trim(),
      separateProcessCoordinates: normal.length,
      preImportDelayedProcesses: delayed.length
    })
  )
  process.exit(0)
}
assert.equal(process.platform, "linux", "installed clock witness requires Linux process-ownership evidence")
const root = mkdtempSync(join(tmpdir(), "hapsland-clock-conformance-"))
const directory = join(root, "runtime")
const bunVariant = declaration.variants.find((variant) => variant.name === declaration.healthyResidentVariant)
assert(bunVariant, "declare the installed shared Bun resident")
const residentExecutable = realpathSync(
  join(
    resolve(bunVariant.prefix),
    "node_modules/@hapsland/hapsland/dist/bin",
    `${process.platform}-${process.arch}`,
    "hapsland-resident"
  )
)
const child = spawn(residentExecutable, [directory], {
  env: { ...env, REVIEW_RESIDENT_DIR: directory },
  stdio: "ignore"
})
let spawnFailed = false
child.once("error", () => {
  spawnFailed = true
})
const closed = new Promise((done) => child.once("close", done))
const pause = () => new Promise((done) => setTimeout(done, 20))
const ipc = (request) =>
  new Promise((done, reject) => {
    const socket = connect(join(directory, "resident.sock"))
    let output = ""
    socket.setTimeout(1_000, () => socket.destroy(new Error("clock witness IPC timeout")))
    socket.on("error", reject)
    socket.on("close", () => reject(new Error("clock witness IPC closed")))
    socket.on("connect", () => socket.write(`${JSON.stringify({ version: 1, ...request })}\n`))
    socket.on("data", (data) => {
      output += data
      if (output.length > 262_144) {
        socket.destroy(new Error("clock witness IPC exceeded bound"))
        return
      }
      if (!output.includes("\n")) return
      socket.end()
      try {
        done(JSON.parse(output.slice(0, output.indexOf("\n"))))
      } catch {
        reject(new Error("invalid clock witness IPC"))
      }
    })
  })
const owner = async () => {
  const deadline = performance.now() + 20_000
  while (performance.now() < deadline) {
    if (spawnFailed || child.exitCode !== null || child.signalCode !== null)
      throw new Error("clock witness resident exited before readiness")
    try {
      const record = JSON.parse(readFileSync(join(directory, "owner.json"), "utf8"))
      const response = await ipc({ operation: "stats", lifetime: record.lifetime })
      if (response.status === "stats") return record
    } catch {}
    await pause()
  }
  throw new Error("clock witness resident did not become ready")
}
const stillOwned = () => {
  if (child.exitCode !== null || child.signalCode !== null) return false
  assert.equal(realpathSync(`/proc/${child.pid}/exe`), residentExecutable, "resident PID executable must remain owned")
  const args = readFileSync(`/proc/${child.pid}/cmdline`, "utf8").split("\0").filter(Boolean)
  assert.deepEqual(args.slice(1), [directory], "resident PID arguments must remain owned")
  return true
}
const waitClosed = async () => {
  let timer
  try {
    return await Promise.race([
      closed,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("resident did not close")), 3_000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
try {
  execFileSync("git", ["init", "--quiet", root], { timeout: 30_000 })
  const record = await owner()
  const registrations = []
  const clientDiagnostics = []
  for (const variant of declaration.variants) {
    const clientStarted = performance.now()
    const result = spawnSync(join(resolve(variant.prefix), "node_modules/.bin/hapsland"), ["--pi-hook"], {
      env: {
        ...env,
        REVIEW_RESIDENT_DIR: directory,
        REVIEW_STATE_PATH: join(root, "state"),
        REVIEW_ACTIVITY_PATH: join(root, "activity")
      },
      input: JSON.stringify({
        operation: "before",
        cwd: root,
        session_id: "clock-compatibility",
        tool_use_id: variant.name,
        host_version: "1.0.0",
        tool_name: "edit"
      }),
      encoding: "utf8",
      timeout: 7_000
    })
    const elapsedMs = performance.now() - clientStarted
    let responseStatus = "invalid-response"
    try {
      const status = JSON.parse(result.stdout).status
      if (["registered", "incomplete", "unavailable"].includes(status)) responseStatus = status
    } catch {}
    const stderr = result.stderr ?? ""
    const engineImportLabels = [
      ...stderr.matchAll(
        /^Hapsland hook-client review-engine import: (pipeline|native-parser|jev-decision|bend-extractor|cloudflare)$/gmu
      )
    ].map((match) => match[1])
    const direct = await ipc({
      operation: "register-edit",
      lifetime: record.lifetime,
      root,
      advicee: {
        host: "pi",
        hostVersion: "1.0.0",
        sessionId: "clock-diagnostic",
        turnId: null,
        toolUseId: variant.name,
        subagentId: null
      },
      startedAt: machineNow()
    })
    clientDiagnostics.push({
      variant: variant.name,
      exitCode: result.status,
      elapsedMs,
      responseStatus,
      engineImportLabels,
      stderrBytes: Buffer.byteLength(stderr),
      directStatus: ["advanced", "rejected-stale", "unsupported"].includes(direct.status)
        ? direct.status
        : "unexpected",
      ...(typeof direct.reason === "string" && /^[A-Za-z]{1,64}$/u.test(direct.reason)
        ? { directReason: direct.reason }
        : {})
    })
    if (result.status === 0 && responseStatus === "registered") registrations.push(variant.name)
  }
  console.log(JSON.stringify({ mode: "installed-client-diagnostics", clients: clientDiagnostics }))
  assert.equal(
    registrations.length,
    declaration.variants.length,
    "every installed runtime must register against the same resident (see variant diagnostics)"
  )
  const late = []
  for (const [index, clock] of delayed.entries()) {
    const response = await ipc({
      operation: "register-edit",
      lifetime: record.lifetime,
      root,
      advicee: {
        host: "pi",
        hostVersion: "1.0.0",
        sessionId: "late-clock-compatibility",
        turnId: null,
        toolUseId: `late-${index}`,
        subagentId: null
      },
      startedAt: clock.startedAt
    })
    assert.equal(response.status, "rejected-stale")
    assert.equal(response.reason, "StaleInvocation")
    late.push(response.reason)
  }
  console.log(
    JSON.stringify({
      separateProcessCoordinates: normal.length,
      preImportDelayedProcesses: delayed.length,
      installedRegistrations: registrations,
      lateInvocationReasons: late
    })
  )
} finally {
  if (stillOwned()) {
    child.kill("SIGTERM")
    try {
      await waitClosed()
    } catch {
      if (stillOwned()) child.kill("SIGKILL")
      await waitClosed()
    }
  }
  if (child.exitCode === null && child.signalCode === null)
    // oxlint-disable-next-line no-unsafe-finally -- Uncertain cleanup must fail the witness and retain its fixture evidence.
    throw new Error(`retained live clock witness fixture ${root}`)
  rmSync(root, { recursive: true, force: true })
}
