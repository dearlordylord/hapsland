import { spawn, execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import {
  closeSync,
  existsSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeSync
} from "node:fs"
import { connect } from "node:net"
import { tmpdir, availableParallelism, cpus, loadavg, release } from "node:os"
import { join, resolve } from "node:path"
import { summarizeStartup } from "./measure-hook-startup-summary.mjs"
import { installedCommands } from "./measure-hook-startup-commands.mjs"
import { archiveInventory } from "./archive-inventory.mjs"

const declarationPath = process.argv[2]
if (!declarationPath) throw new Error("usage: node scripts/measure-hook-startup.mjs DECLARATION.json")
const declaration = JSON.parse(readFileSync(declarationPath, "utf8"))
if (
  !Number.isSafeInteger(declaration.samples) ||
  declaration.samples < 15 ||
  declaration.samples > 100 ||
  !Number.isSafeInteger(declaration.coldSamples) ||
  declaration.coldSamples < 3 ||
  declaration.coldSamples > 30 ||
  !Array.isArray(declaration.variants) ||
  declaration.variants.length < 1 ||
  declaration.variants.length > 3 ||
  !declaration.variants.some((variant) => variant.name === declaration.healthyResidentVariant)
)
  throw new Error("declare one to three variants, 15–100 healthy samples, 3–30 fresh samples and a resident variant")
if (new Set(declaration.variants.map((variant) => variant.name)).size !== declaration.variants.length)
  throw new Error("benchmark variant names must be unique")
if (
  declaration.variants.length > 1 &&
  (!declaration.comparison ||
    !declaration.variants.some(
      (variant) => variant.name === declaration.comparison.baseline && variant.hookRole === "cli"
    ) ||
    !declaration.variants.some(
      (variant) => variant.name === declaration.comparison.candidate && variant.hookRole === "hook"
    ) ||
    !Number.isFinite(declaration.comparison.relativeThreshold) ||
    declaration.comparison.relativeThreshold < 0 ||
    !Number.isFinite(declaration.comparison.absoluteThresholdMs) ||
    declaration.comparison.absoluteThresholdMs < 0)
)
  throw new Error("declare baseline CLI, candidate dedicated hook and finite comparison thresholds")
if (declaration.warmups !== undefined && declaration.warmups !== 0)
  throw new Error("this runner requires zero excluded warm-up samples")
const runDurationMs = declaration.deadlineMs ?? 180_000
if (!Number.isSafeInteger(runDurationMs) || runDurationMs < 1 || runDurationMs > 600_000)
  throw new Error("declare a finite deadline up to ten minutes")
const runDeadline = performance.now() + runDurationMs
const remainingMs = () => {
  const remaining = runDeadline - performance.now()
  if (remaining <= 0) throw new Error("benchmark deadline exceeded")
  return Math.max(1, Math.floor(remaining))
}
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex")
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  declaration,
  declarationSha256: hash(declarationPath),
  runnerSha256: hash(import.meta.filename),
  platform: process.platform,
  architecture: process.arch,
  availableParallelism: availableParallelism(),
  hardware: { model: cpus()[0]?.model, logicalCpus: cpus().length },
  operatingSystemRelease: release(),
  initialLoad: loadavg(),
  coverage: false,
  fileCache: "uncontrolled OS cache; new client process for every sample",
  measurement: "parent monotonic clock; full installed before-command wall time; outcomes retained on failure",
  samples: [],
  retirements: []
}
const persist = () => {
  const encoded = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
  let written = 0
  while (written < encoded.length)
    written += writeSync(outputDescriptor, encoded, written, encoded.length - written, written)
  ftruncateSync(outputDescriptor, encoded.length)
}
const pause = () => new Promise((done) => setTimeout(done, 20))

const fixtures = []
const makeFixture = (variant) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-startup-"))
  execFileSync("git", ["init", "--quiet", root], { timeout: 30_000 })
  const prefix = resolve(variant.prefix)
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== "NODE_V8_COVERAGE" && key !== "NODE_OPTIONS" && !/^(?:REVIEW_|HAPSLAND_)/u.test(key)
    )
  )
  const commands = installedCommands(prefix, variant.hookRole)
  const fixture = {
    variant: variant.name,
    prefix,
    root,
    commands,
    initializationObservation: declaration.initializationObservation,
    directory: join(root, "runtime"),
    hook: commands.launcher,
    resident: join(prefix, "node_modules/.bin/hapsland-resident"),
    env: {
      ...inherited,
      REVIEW_RESIDENT_DIR: join(root, "runtime"),
      REVIEW_STATE_PATH: join(root, "state"),
      REVIEW_ACTIVITY_PATH: join(root, "activity"),
      REVIEW_USER_CONFIG_PATH: join(root, "user.json")
    }
  }
  fixtures.push(fixture)
  return fixture
}
const stats = (fixture) =>
  new Promise((done, reject) => {
    const owner = JSON.parse(readFileSync(join(fixture.directory, "owner.json"), "utf8"))
    const socket = connect(join(fixture.directory, "resident.sock"))
    let output = ""
    socket.setTimeout(1_000, () => socket.destroy(new Error("stats timeout")))
    socket.on("error", reject)
    socket.on("end", () => reject(new Error("stats ended without a complete response")))
    socket.on("close", () => reject(new Error("stats closed without a complete response")))
    socket.on("connect", () =>
      socket.write(`${JSON.stringify({ version: 1, operation: "stats", lifetime: owner.lifetime })}\n`)
    )
    socket.on("data", (data) => {
      output += data
      if (output.length > 262_144) {
        socket.destroy(new Error("stats exceeded bound"))
        return
      }
      if (!output.includes("\n")) return
      socket.end()
      try {
        const response = JSON.parse(output.slice(0, output.indexOf("\n")))
        if (response.status !== "stats") reject(new Error("resident not ready"))
        else if (response.lifetime !== undefined && response.lifetime !== owner.lifetime)
          reject(new Error("resident lifetime mismatch"))
        else done()
      } catch {
        reject(new Error("invalid stats response"))
      }
    })
  })
const ready = async (fixture) => {
  const deadline = performance.now() + Math.min(20_000, remainingMs())
  while (performance.now() < deadline) {
    try {
      await stats(fixture)
      return
    } catch {
      await pause()
    }
  }
  throw new Error("resident readiness failed")
}
const call = (fixture, operation, id) =>
  new Promise((done) => {
    const timeoutMs = Math.min(7_000, remainingMs())
    const start = performance.now()
    const child = spawn(fixture.hook, ["--pi-hook"], { env: fixture.env, stdio: ["pipe", "pipe", "ignore"] })
    let output = ""
    let timedOut = false
    let handlerReadyMs
    let readinessFailure
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)
    child.stdout.on("data", (data) => {
      output += data
      if (output.length > 262_144) child.kill("SIGKILL")
    })
    child.stdin.on("error", () => {})
    child.once("error", () => {
      clearTimeout(timer)
      done({ status: "spawn-error", elapsedMs: performance.now() - start })
    })
    child.once("close", (code) => {
      clearTimeout(timer)
      let status = "invalid-response"
      try {
        const parsed = JSON.parse(output).status
        if (["registered", "incomplete", "unavailable", "retired"].includes(parsed)) status = parsed
      } catch {}
      done({
        status: readinessFailure
          ? "readiness-observation-failed"
          : timedOut
            ? "timeout"
            : code === 0
              ? status
              : "process-failed",
        responseStatus: status,
        elapsedMs: performance.now() - start,
        exitCode: code,
        ...(handlerReadyMs === undefined ? {} : { handlerReadyMs }),
        ...(readinessFailure ? { readinessFailure } : {})
      })
    })
    const sendInput = () =>
      child.stdin.end(
        JSON.stringify({
          operation,
          cwd: fixture.root,
          session_id: "startup-comparison",
          tool_use_id: id,
          host_version: "1.0.0",
          tool_name: "edit"
        })
      )
    if (fixture.initializationObservation !== "linux-stdin-read") sendInput()
    else {
      const observe = async () => {
        if (process.arch !== "arm64")
          throw new Error("stdin-read readiness profile requires Linux arm64 syscall numbering")
        const deadline = start + timeoutMs
        while (performance.now() < deadline && child.exitCode === null && child.signalCode === null) {
          try {
            const executable = realpathSync(`/proc/${child.pid}/exe`)
            const syscall = readFileSync(`/proc/${child.pid}/syscall`, "utf8").trim().split(/\s+/u)
            // arm64 read(0, ...): observed only after the installed launcher has
            // exec'd the declared binary. Input is withheld until this boundary.
            if (executable === fixture.commands.hook.executable && syscall[0] === "63" && syscall[1] === "0x0") {
              handlerReadyMs = performance.now() - start
              sendInput()
              return
            }
          } catch (error) {
            if (!["ENOENT", "ESRCH"].includes(error.code)) throw new Error("unable to observe hook stdin readiness")
          }
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
        throw new Error("hook did not reach the observed stdin-read boundary")
      }
      observe().catch((error) => {
        readinessFailure = error.message
        child.kill("SIGKILL")
      })
    }
  })
// Pin both executable and exact entrypoint/directory arguments. A prefix argument
// alone is not evidence that an arbitrary live PID belongs to this fixture.
const observeProcess = (pid, fixture) => {
  try {
    const executable = realpathSync(`/proc/${pid}/exe`)
    const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean)
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]
    const expected = fixture.commands.resident
    const argv = [...expected.args, fixture.directory]
    let argvExecutable
    try {
      argvExecutable = realpathSync(args[0])
    } catch {}
    const owned =
      executable === expected.executable &&
      args.length === argv.length + 1 &&
      argvExecutable === expected.executable &&
      argv.every((arg, index) => args[index + 1] === arg)
    return { pid, start, owned }
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ESRCH") return undefined
    throw new Error(`unable to establish resident ownership for PID ${pid}`)
  }
}
const fixtureProcesses = (fixture) => {
  const pids = new Set()
  if (fixture.child?.pid && fixture.child.exitCode === null && fixture.child.signalCode === null)
    pids.add(fixture.child.pid)
  // A cold resident publishes the lock before its socket-ready owner record.
  for (const path of [join(fixture.directory, "owner.json"), join(fixture.directory, "owner.lock/owner.json")]) {
    try {
      const owner = JSON.parse(readFileSync(path, "utf8"))
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error("invalid owner PID")
      pids.add(owner.pid)
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("unable to read benchmark resident owner")
    }
  }
  // Also catch a detached cold launcher before either ownership file exists.
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/u.test(entry)) continue
    try {
      const args = readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0")
      if (args.includes(fixture.directory)) pids.add(Number(entry))
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ESRCH")
        throw new Error("unable to inspect pending benchmark processes")
    }
  }
  return [...pids].map((pid) => observeProcess(pid, fixture)).filter(Boolean)
}
const waitForDeath = async (processIdentity, fixture, durationMs) => {
  const deadline = performance.now() + durationMs
  while (performance.now() < deadline) {
    const current = observeProcess(processIdentity.pid, fixture)
    if (!current || current.start !== processIdentity.start) return true
    if (!current.owned) throw new Error("resident ownership changed during cleanup")
    await pause()
  }
  return false
}
const stopOwned = async (identity, fixture) => {
  const signal = (name) => {
    const current = observeProcess(identity.pid, fixture)
    if (!current || current.start !== identity.start) return
    if (!current.owned) throw new Error("resident ownership changed before signal")
    try {
      process.kill(identity.pid, name)
    } catch (error) {
      if (error.code !== "ESRCH") throw error
    }
  }
  signal("SIGTERM")
  if (!(await waitForDeath(identity, fixture, 3_000))) {
    signal("SIGKILL")
    if (!(await waitForDeath(identity, fixture, 3_000))) throw new Error("resident did not terminate after kill")
  }
}
const terminate = async (fixture) => {
  // Wait for a directly spawned shell to exec the declared resident. Never
  // signal an unproven process or delete the directory while startup is pending.
  const deadline = performance.now() + 20_000
  for (;;) {
    const processes = fixtureProcesses(fixture)
    if (processes.some((process) => !process.owned)) {
      if (performance.now() >= deadline) throw new Error(`cleanup retained uncertain runtime ${fixture.root}`)
      await pause()
      continue
    }
    for (const process of processes) await stopOwned(process, fixture)
    if (fixtureProcesses(fixture).length === 0) break
    if (performance.now() >= deadline) throw new Error(`cleanup retained live runtime ${fixture.root}`)
  }
  if (fixture.child && fixture.child.exitCode === null && fixture.child.signalCode === null) {
    await Promise.race([
      fixture.childClosed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("resident child did not close")), 3_000))
    ])
  }
  // Recheck after child-close: a startup descendant must not outlive its state.
  if (fixtureProcesses(fixture).length) throw new Error(`cleanup retained active runtime ${fixture.root}`)
  rmSync(fixture.root, { recursive: true, force: true })
}

if (process.platform !== "linux") throw new Error("this timing/cleanup profile currently requires Linux")
report.variants = []
for (const variant of declaration.variants) {
  remainingMs()
  const archiveSha256 = hash(variant.archive)
  if (archiveSha256 !== variant.archiveSha256) throw new Error("variant archive checksum mismatch")
  const commands = installedCommands(resolve(variant.prefix), variant.hookRole)
  const installedRoot = realpathSync(join(resolve(variant.prefix), "node_modules/@hapsland/hapsland"))
  const inventory = await archiveInventory(variant.archive, { timeoutMs: Math.min(30_000, remainingMs()) })
  for (const [path, record] of inventory) {
    if (!record.directory && hash(join(installedRoot, path.slice("package/".length))) !== record.sha256)
      throw new Error("installed artifact differs from its declared archive")
  }
  report.variants.push({
    name: variant.name,
    hookRole: variant.hookRole,
    installedLauncher: commands.launcher,
    archiveSha256,
    launcherSha256: hash(commands.launcher),
    runtimeDeclaration: commands.runtimeDeclaration,
    installedArchiveInventoryVerified: true,
    archiveFileCount: [...inventory.values()].filter((record) => !record.directory).length,
    commands: Object.fromEntries(
      ["hook", "resident"].map((role) => [
        role,
        {
          executableSha256: hash(commands[role].executable),
          ...(commands[role].args.length ? { entrypointSha256: hash(commands[role].args[0]) } : {})
        }
      ])
    )
  })
}
// Reserve a new artifact exclusively; rerunning a declaration cannot overwrite evidence.
if (new Set(report.variants.map((variant) => JSON.stringify(variant.runtimeDeclaration.runtime))).size !== 1)
  throw new Error("startup comparison requires identical installed runtime declarations")
const outputDescriptor = openSync(resolve(declaration.output), "wx", 0o600)
let failure
try {
  persist()
  const healthy = []
  for (const variant of declaration.variants) {
    const fixture = makeFixture(variant)
    fixture.child = spawn(fixture.resident, [fixture.directory], { env: fixture.env, stdio: "ignore" })
    fixture.childClosed = new Promise((done) => fixture.child.once("close", done))
    fixture.child.once("error", () => {
      fixture.spawnFailed = true
    })
    await ready(fixture)
    healthy.push(fixture)
  }
  const residentIdentity = (fixture) => {
    const owner = JSON.parse(readFileSync(join(fixture.directory, "owner.json"), "utf8"))
    const identity = observeProcess(owner.pid, fixture)
    if (!identity?.owned) throw new Error("resident executable identity is not the declared installed variant")
    return { ...identity, lifetime: owner.lifetime, executableSha256: hash(fixture.commands.resident.executable) }
  }
  for (let index = 0; index < declaration.samples; index++) {
    for (const fixture of index % 2 === 0 ? healthy : [...healthy].reverse()) {
      const id = randomUUID()
      await stats(fixture)
      const residentBefore = residentIdentity(fixture)
      const result = await call(fixture, "before", id)
      await stats(fixture)
      const residentAfter = residentIdentity(fixture)
      const reusedReadyResident = JSON.stringify(residentBefore) === JSON.stringify(residentAfter)
      report.samples.push({
        variant: fixture.variant,
        mode: "healthy-resident",
        index,
        residentBefore,
        residentAfter,
        reusedReadyResident,
        ...result
      })
      persist()
      if (result.status !== "registered") throw new Error("healthy hook invocation failed")
      if (!reusedReadyResident) throw new Error("healthy sample did not reuse its declared ready resident")
      const retired = await call(fixture, "retire", id)
      report.retirements.push({ variant: fixture.variant, index, ...retired })
      persist()
      if (retired.status !== "retired") throw new Error("permit retirement failed")
    }
  }
  for (const fixture of healthy) await terminate(fixture)
  fixtures.length = 0
  for (let index = 0; index < declaration.coldSamples; index++) {
    for (const variant of index % 2 === 0 ? declaration.variants : [...declaration.variants].reverse()) {
      const fixture = makeFixture(variant)
      if (existsSync(fixture.directory) || fixtureProcesses(fixture).length)
        throw new Error("fresh fixture already owns a resident")
      const freshStartedAtTicks = Math.floor(performance.now())
      const sample = {
        variant: fixture.variant,
        mode: "cold-resident",
        index,
        ...(await call(fixture, "before", randomUUID()))
      }
      report.samples.push(sample)
      persist()
      if (sample.status !== "registered") throw new Error("fresh hook invocation failed")
      await ready(fixture)
      sample.residentAfter = residentIdentity(fixture)
      sample.startedFreshResident = true
      sample.freshFixtureObservedBeforeCall = true
      sample.parentFreshObservationMs = freshStartedAtTicks
      persist()
      await terminate(fixture)
      fixtures.pop()
    }
  }
  if (declaration.comparison) report.comparison = summarizeStartup(report.samples, declaration.comparison)
  for (const variant of declaration.variants) {
    const current = installedCommands(resolve(variant.prefix), variant.hookRole)
    const original = report.variants.find((record) => record.name === variant.name)
    if (
      hash(current.launcher) !== original.launcherSha256 ||
      hash(variant.archive) !== original.archiveSha256 ||
      ["hook", "resident"].some((role) => hash(current[role].executable) !== original.commands[role].executableSha256)
    )
      throw new Error("installed measured artifact changed during benchmark")
  }
  report.artifactIdentitiesUnchanged = true
  report.completed = true
} catch (error) {
  failure = error
  report.failure = { message: error.message, elapsedDeadline: performance.now() >= runDeadline }
} finally {
  const cleanupErrors = []
  for (const fixture of fixtures) {
    try {
      await terminate(fixture)
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  report.cleanup = { status: cleanupErrors.length ? "incomplete" : "complete", retainedFixtures: cleanupErrors.length }
  try {
    persist()
  } finally {
    closeSync(outputDescriptor)
  }
  if (failure || cleanupErrors.length)
    // oxlint-disable-next-line no-unsafe-finally -- Uncertain cleanup must fail the witness and retain its fixture evidence.
    throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], "benchmark or cleanup failed")
}
