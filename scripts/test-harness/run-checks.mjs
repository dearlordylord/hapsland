import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdir, readFile, writeFile, rename, open, unlink, readdir, stat } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { resolve, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { precheckStages } from "./check-stages.mjs"

const defaultRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const contextVariable = "HAPSLAND_CHECK_CONTEXT"
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, path)
}

export async function stageResults(runDirectory) {
  const files = await readdir(join(runDirectory, "stages")).catch(() => [])
  const records = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => readJson(join(runDirectory, "stages", file)))
  )
  return records.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
export async function failures(runDirectory) {
  const content = await readFile(join(runDirectory, "failures.jsonl"), "utf8").catch((error) => {
    if (error.code === "ENOENT") return ""
    throw error
  })
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return { message: "Incomplete failure event", raw: line }
      }
    })
}
export async function showStatus(root, id, json = false) {
  const runsRoot = join(root, ".test-runs")
  const runId = id ?? (await readJson(join(runsRoot, "latest.json"))).id
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error("Invalid run id")
  const runDirectory = join(runsRoot, runId)
  const status = await readJson(join(runDirectory, "status.json"))
  const stages = await stageResults(runDirectory)
  const testFailures = await failures(runDirectory)
  if (json) console.log(JSON.stringify({ ...status, runDirectory, stages, failures: testFailures }, null, 2))
  else {
    const elapsed = status.state === "running" ? Date.now() - Date.parse(status.startedAt) : status.elapsedMs
    console.log(`RUN ${runId} ${status.state}; ${(elapsed / 1000).toFixed(1)}s; records ${runDirectory}`)
    for (const stage of stages) {
      const milliseconds = stage.state === "running" ? Date.now() - Date.parse(stage.startedAt) : stage.elapsedMs
      console.log(
        `${stage.state.toUpperCase()} ${stage.name} ${(milliseconds / 1000).toFixed(2)}s; exit ${stage.exitCode ?? "none"}; ${stage.logPath ?? stage.error ?? "no process launched"}`
      )
    }
    for (const failure of testFailures) {
      console.log(
        `FAIL ${failure.file ?? "test"} > ${failure.test ?? failure.name ?? ""}: ${failure.message ?? "see record"}`
      )
      if (failure.stack) console.log(failure.stack)
      if (failure.actual !== undefined) console.log(`Actual: ${failure.actual}`)
      if (failure.expected !== undefined) console.log(`Expected: ${failure.expected}`)
    }
    console.log(`${testFailures.length} retained test failures; ${join(runDirectory, "results.json")}`)
  }
  return status
}

export async function runQualityStages(run, root) {
  const lint = await run.runStage({
    name: "lint-code",
    command: process.execPath,
    args: [join(root, "scripts/run-quality-lint.mjs")]
  })
  if (lint.state === "passed")
    await run.runStage({ name: "quality", command: join(root, "node_modules", ".bin", "crap4ts") })
}

export async function createRun({ root = defaultRoot, mode, timeoutMs, inherited, output = console.log }) {
  const runsRoot = join(root, ".test-runs")
  await mkdir(runsRoot, { recursive: true })
  let context
  let ownsLock = false
  const lockPath = join(runsRoot, "full.lock")
  if (inherited) {
    const supplied = JSON.parse(inherited)
    if (mode !== "test" || supplied.root !== root || !/^[a-zA-Z0-9_-]+$/.test(supplied.id))
      throw new Error("Invalid nested gate context")
    const recorded = await readJson(join(runsRoot, supplied.id, "manifest.json"))
    const lock = await readJson(lockPath)
    if (
      recorded.mode !== "quality" ||
      recorded.token !== supplied.token ||
      lock.token !== supplied.token ||
      recorded.pid !== supplied.pid ||
      recorded.deadline !== supplied.deadline ||
      !alive(supplied.pid)
    )
      throw new Error("Nested gate parent is not active")
    context = supplied
  } else {
    const id = `${new Date().toISOString().replace(/[^0-9]/g, "")}-${process.pid}-${randomBytes(3).toString("hex")}`
    context = { id, root, pid: process.pid, token: randomBytes(24).toString("hex"), deadline: Date.now() + timeoutMs }
    if (mode !== "focused") {
      let handle
      try {
        handle = await open(lockPath, "wx")
      } catch (error) {
        if (error.code !== "EEXIST") throw error
        const lock = await readFile(lockPath, "utf8").catch(() => "unreadable lock")
        throw new Error(
          `A full gate already owns this worktree: ${lock.trim()}. Use test:status; after an interrupted owner has exited, remove ${lockPath}.`
        )
      }
      await handle.writeFile(JSON.stringify(context))
      await handle.close()
      ownsLock = true
    }
  }
  const runDirectory = join(runsRoot, context.id)
  await mkdir(join(runDirectory, "stages"), { recursive: true })
  const startedAt = new Date().toISOString()
  if (!inherited) {
    await atomicJson(join(runDirectory, "manifest.json"), {
      ...context,
      mode,
      startedAt,
      plannedStages:
        mode === "test"
          ? [...precheckStages.map((stage) => stage[0]), "package-build", "package-pack", "vitest"]
          : [mode]
    })
    await atomicJson(join(runsRoot, "latest.json"), { id: context.id })
    await atomicJson(join(runDirectory, "status.json"), {
      id: context.id,
      mode,
      state: "running",
      startedAt,
      deadline: context.deadline,
      pid: process.pid
    })
  }
  let activeChild
  let aborted = false
  let abortReason
  function terminate(reason) {
    aborted = true
    abortReason = reason
    if (!activeChild) return
    const child = activeChild
    try {
      process.kill(-child.pid, "SIGTERM")
    } catch {
      child.kill("SIGTERM")
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {
        child.kill("SIGKILL")
      }
    }, 1000)
    timer.unref()
  }
  const onInt = () => terminate("SIGINT")
  const onTerm = () => terminate("SIGTERM")
  process.on("SIGINT", onInt)
  process.on("SIGTERM", onTerm)
  output(`RUN ${context.id} ${mode}; deadline ${new Date(context.deadline).toISOString()}; records ${runDirectory}`)
  let sequence = 0
  let reportedFailureLines = 0
  let reporting = false
  const reportFailures = async () => {
    if (reporting) return
    reporting = true
    try {
      const content = await readFile(join(runDirectory, "failures.jsonl"), "utf8").catch(() => "")
      const lines = content.split("\n").slice(0, -1).filter(Boolean)
      for (const line of lines.slice(reportedFailureLines)) {
        try {
          const failure = JSON.parse(line)
          output(
            `FAIL ${failure.file ?? failure.module ?? "test"} > ${failure.test ?? failure.name ?? failure.fullName ?? ""}: ${failure.message ?? failure.errors?.[0]?.message ?? "see failure record"}; failures ${join(runDirectory, "failures.jsonl")}`
          )
        } catch {
          output(`FAIL malformed failure event; see ${join(runDirectory, "failures.jsonl")}`)
        }
      }
      reportedFailureLines = lines.length
    } finally {
      reporting = false
    }
  }
  const failureTimer = inherited ? undefined : setInterval(reportFailures, 100)
  failureTimer?.unref()
  async function runStage({ name, command, args = [], cwd = root, env = {} }) {
    if (aborted || Date.now() >= context.deadline) {
      aborted = true
      abortReason ??= "deadline"
      return {
        name,
        state: "not-started",
        exitCode: null,
        signal: null,
        timedOut: abortReason === "deadline",
        elapsedMs: 0
      }
    }
    const basename = `${process.pid}-${String(++sequence).padStart(3, "0")}-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`
    const logPath = join(runDirectory, `${basename}.log`)
    const recordPath = join(runDirectory, "stages", `${basename}.json`)
    const begin = Date.now()
    const record = {
      name,
      ownerPid: process.pid,
      command,
      args,
      startedAt: new Date(begin).toISOString(),
      state: "running",
      exitCode: null,
      signal: null,
      timedOut: false,
      elapsedMs: 0,
      logPath
    }
    await atomicJson(recordPath, record)
    output(`START ${name}; log ${logPath}`)
    const stream = createWriteStream(logPath)
    let spawnError
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...env,
        [contextVariable]: JSON.stringify(context),
        HAPSLAND_TEST_FAILURES_FILE: join(runDirectory, "failures.jsonl")
      }
    })
    activeChild = child
    child.stdout.pipe(stream, { end: false })
    child.stderr.pipe(stream, { end: false })
    const timer = setTimeout(() => terminate("deadline"), Math.max(1, context.deadline - Date.now()))
    const outcomePromise = new Promise((done) => {
      child.once("error", (error) => {
        spawnError = error.message
      })
      child.once("close", (exitCode, signal) => done({ exitCode, signal }))
    })
    record.pid = child.pid
    await atomicJson(recordPath, record)
    const outcome = await outcomePromise
    clearTimeout(timer)
    // The process leader exiting does not prove its descendants stopped.
    const groupAlive = () => {
      try {
        process.kill(-child.pid, 0)
        return true
      } catch {
        return false
      }
    }
    if (child.pid && groupAlive()) {
      try {
        process.kill(-child.pid, "SIGTERM")
      } catch {}
      await new Promise((done) => setTimeout(done, 100))
      if (groupAlive()) {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch {}
      }
      for (let attempt = 0; groupAlive() && attempt < 20; attempt++) await new Promise((done) => setTimeout(done, 50))
      record.groupUnresolved = groupAlive()
      spawnError ??= "Child process group outlived its leader and was terminated"
    }
    activeChild = undefined
    await new Promise((done) => stream.end(done))
    Object.assign(record, outcome, {
      elapsedMs: Date.now() - begin,
      timedOut: abortReason === "deadline",
      error: spawnError,
      state: outcome.exitCode === 0 && !spawnError && !aborted ? "passed" : "failed"
    })
    await atomicJson(recordPath, record)
    if (record.state === "failed") {
      const excerpt = (await readFile(logPath, "utf8")).split("\n").slice(-20).join("\n").slice(-4000)
      if (excerpt.trim()) output(excerpt)
    }
    output(
      `${record.state.toUpperCase()} ${name} ${(record.elapsedMs / 1000).toFixed(2)}s; exit ${record.exitCode ?? "none"}${record.signal ? ` signal ${record.signal}` : ""}; log ${logPath}`
    )
    return record
  }
  async function finish() {
    clearInterval(failureTimer)
    await reportFailures()
    process.off("SIGINT", onInt)
    process.off("SIGTERM", onTerm)
    let unresolvedGroups = (await stageResults(runDirectory)).some((stage) => stage.groupUnresolved)
    if (!inherited) {
      for (const stage of await stageResults(runDirectory)) {
        if (stage.state !== "running" || !stage.pid) continue
        try {
          process.kill(-stage.pid, "SIGTERM")
        } catch {}
        await new Promise((done) => setTimeout(done, 100))
        try {
          process.kill(-stage.pid, "SIGKILL")
        } catch {}
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            process.kill(-stage.pid, 0)
          } catch {
            break
          }
          await new Promise((done) => setTimeout(done, 50))
          if (attempt === 19) unresolvedGroups = true
        }
      }
    }
    if (unresolvedGroups) {
      aborted = true
      abortReason = "process group still present; lock retained"
    }
    const stages = await stageResults(runDirectory)
    const errors = await failures(runDirectory)
    const evaluatedStages = inherited ? stages.filter((stage) => stage.ownerPid === process.pid) : stages
    const failedStages = evaluatedStages.filter((stage) => stage.state !== "passed")
    const success = !aborted && evaluatedStages.length > 0 && failedStages.length === 0 && errors.length === 0
    const thresholdBreach =
      mode === "quality" &&
      !aborted &&
      errors.length === 0 &&
      failedStages.length === 1 &&
      failedStages[0].name === "quality" &&
      failedStages[0].exitCode === 2
    const exitCode = success ? 0 : thresholdBreach ? 2 : 1
    if (!inherited) {
      const status = {
        id: context.id,
        mode,
        state: success ? "passed" : aborted ? "aborted" : "failed",
        exitCode,
        startedAt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - Date.parse(startedAt),
        reason: abortReason,
        failedStages: failedStages.map((stage) => stage.name),
        failures: errors.length
      }
      await atomicJson(join(runDirectory, "results.json"), { ...status, stages, testFailures: errors })
      await atomicJson(join(runDirectory, "status.json"), status)
      if (ownsLock && !unresolvedGroups) await unlink(lockPath)
      output(
        `END ${status.state}; ${status.elapsedMs / 1000}s; ${failedStages.length} failed stages, ${errors.length} test failures; results ${join(runDirectory, "results.json")}`
      )
    }
    return exitCode
  }
  return {
    root,
    runDirectory,
    context,
    runStage,
    finish,
    get aborted() {
      return aborted
    }
  }
}

export async function focusedSelection(root, args) {
  const files = args.filter((arg) => !arg.startsWith("-") && /\.test\.(?:m?[jt]sx?|cjs)$/.test(arg))
  if (!files.length)
    throw new Error("Focused checks require explicit existing test files; options alone cannot select the full suite.")
  for (const file of files) {
    const path = resolve(root, file)
    if (relative(root, path).startsWith(`..${sep}`) || !(await stat(path)).isFile())
      throw new Error(`Invalid focused test file: ${file}`)
  }
  // Arguments must not introduce wildcard/directory filters that silently broaden selection.
  const other = args.filter((arg) => !files.includes(arg))
  if (other.some((arg) => !arg.startsWith("-") && !/^[0-9]+$/.test(arg)))
    throw new Error("Use explicit test files and --option=value syntax for focused options.")
  return {
    nodeFiles: files.filter((file) => file.endsWith(".mjs") || file.endsWith(".cjs")),
    vitestFiles: files.filter((file) => !file.endsWith(".mjs") && !file.endsWith(".cjs")),
    options: other
  }
}

export async function main(argv = process.argv.slice(2), root = defaultRoot) {
  const entryTime = Date.now()
  const [mode, ...raw] = argv
  if (!["test", "focused", "quality", "status"].includes(mode))
    throw new Error("Usage: run-checks.mjs test|focused|quality|status [args]")
  if (mode === "status") {
    const ids = raw.filter((arg) => arg !== "--json" && arg !== "--")
    if (ids.length > 1) throw new Error("status accepts one run id and --json")
    await showStatus(root, ids[0], raw.includes("--json"))
    return 0
  }
  const timeoutArg = raw.find((arg) => arg.startsWith("--timeout-ms="))
  const timeoutMs = timeoutArg ? Number(timeoutArg.split("=")[1]) : mode === "focused" ? 300_000 : 1_500_000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 86_400_000)
    throw new Error("Timeout must be positive and at most one day")
  const args = raw.filter((arg) => arg !== "--" && arg !== timeoutArg)
  if (mode === "test" && args.some((arg) => arg !== "--coverage"))
    throw new Error("Full test accepts --coverage only; use focused for file selection.")
  if (mode === "quality" && args.length) throw new Error("Quality does not accept test-selection arguments")
  const selection = mode === "focused" ? await focusedSelection(root, args) : undefined
  const { sourceIdentity } = await import("./prepare-archive.mjs")
  const sourceDigest = mode === "focused" ? undefined : await sourceIdentity(root)
  const remainingMs = timeoutMs - (Date.now() - entryTime)
  if (remainingMs <= 0) throw new Error("Deadline expired while identifying inputs; no command started")
  const run = await createRun({ root, mode, timeoutMs: remainingMs, inherited: process.env[contextVariable] })
  await atomicJson(join(run.runDirectory, `inputs-${process.pid}.json`), { sourceDigest })
  try {
    if (mode === "quality") await runQualityStages(run, root)
    else if (mode === "focused") {
      if (selection.nodeFiles.length)
        await run.runStage({
          name: "node-focused",
          command: process.execPath,
          args: ["--test", ...selection.nodeFiles]
        })
      if (selection.vitestFiles.length)
        await run.runStage({
          name: "vitest-focused",
          command: join(root, "node_modules", ".bin", "vitest"),
          args: ["run", "--maxWorkers=1", ...selection.vitestFiles, ...selection.options]
        })
    } else {
      for (const [name, ...stageArgs] of precheckStages) {
        if (run.aborted) break
        await run.runStage({ name, command: process.execPath, args: stageArgs })
      }
      if (!run.aborted) {
        const { prepareArchive } = await import("./prepare-archive.mjs")
        let archive
        try {
          archive = await prepareArchive({ root, runDirectory: run.runDirectory, runStage: run.runStage })
        } catch (error) {
          await atomicJson(join(run.runDirectory, "stages", `${process.pid}-archive-error.json`), {
            name: "package-archive",
            startedAt: new Date().toISOString(),
            state: "failed",
            exitCode: null,
            error: error.message,
            elapsedMs: 0
          })
          console.error(`FAIL package-archive: ${error.message}`)
        }
        if (!run.aborted && archive)
          await run.runStage({
            name: "vitest",
            command: join(root, "node_modules", ".bin", "vitest"),
            args: ["run", "--maxWorkers=1", ...args],
            env: { HAPSLAND_TEST_PACKAGE_ARCHIVE: archive.archivePath }
          })
      }
    }
  } catch (error) {
    await atomicJson(join(run.runDirectory, "stages", `${process.pid}-runner-error.json`), {
      name: "runner",
      startedAt: new Date().toISOString(),
      state: "failed",
      exitCode: null,
      error: error.message,
      elapsedMs: 0
    })
    console.error(error.message)
  }
  try {
    if (sourceDigest !== undefined && (await sourceIdentity(root)) !== sourceDigest) {
      await atomicJson(join(run.runDirectory, "stages", `${process.pid}-changed-inputs.json`), {
        name: "source-identity",
        startedAt: new Date().toISOString(),
        state: "failed",
        exitCode: null,
        error: "Source inputs changed during the run; this run does not validate current sources",
        elapsedMs: 0
      })
    }
  } catch (error) {
    await atomicJson(join(run.runDirectory, "stages", `${process.pid}-identity-error.json`), {
      name: "source-identity",
      startedAt: new Date().toISOString(),
      state: "failed",
      exitCode: null,
      error: error.message,
      elapsedMs: 0
    })
  }
  return run.finish()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
