import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readPackageGraph } from "./package-graph.mjs"
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  chmodSync,
  openSync,
  closeSync,
  lstatSync,
  readdirSync,
  readSync
} from "node:fs"
import { dirname, resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { runBuildProcess } from "./build-process.mjs"
import { stopBuildGroups } from "./build-groups.mjs"
import { withBuildLock } from "./build-lock.mjs"
import { withOwnedLock } from "./owned-lock.mjs"
import { buildAcceptanceCases, pendingAcceptanceCases } from "./build-workflow-acceptance-cases.mjs"

export function watchScenarioBudget(remainingMs) {
  assert(Number.isFinite(remainingMs) && remainingMs > 0, "Watch campaign deadline expired")
  return Math.min(600000, remainingMs)
}

export async function probeAcceptanceTool(root, name, args, remainingMs, env = process.env) {
  assert(Number.isFinite(remainingMs) && remainingMs > 0, "Tool probe campaign deadline expired")
  const executable = confinedPath(root, name)
  return runBuildProcess(executable, args, { cwd: root, env, timeout: Math.min(10000, remainingMs), stdio: "pipe" })
}

export const isGeneratedMutationPath = (name) =>
  /^(?:dist(?:\/|$)|packages\/[^/]+\/(?:dist|artifacts)(?:\/|$)|\.test-runs\/turbo-cache\/)/.test(name)

export function canSkipRepair({
  success,
  mutatedAuthored,
  authoredIdentity,
  candidateIdentity,
  published,
  candidatePublished,
  environmentOverrides = {}
}) {
  return (
    success &&
    !mutatedAuthored &&
    Object.keys(environmentOverrides).length === 0 &&
    isDeepStrictEqual(authoredIdentity, candidateIdentity) &&
    isDeepStrictEqual(published(), candidatePublished)
  )
}

export function confinedPath(root, name) {
  const path = resolve(root, name),
    local = relative(root, path)
  if (!local || local.startsWith("..") || resolve(name) === name) throw new Error("Acceptance path escapes candidate")
  let cursor = root
  for (const part of local.split("/")) {
    cursor = resolve(cursor, part)
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("Acceptance path crosses a symlink")
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  return path
}

export class CandidateMutations {
  constructor(root, backupDirectory) {
    this.root = root
    this.backupDirectory = backupDirectory
    this.files = new Map()
  }
  retain(name, bytes, evidence) {
    if (!this.backupDirectory) return
    const backup = confinedPath(this.backupDirectory, name)
    mkdirSync(dirname(backup), { recursive: true })
    writeFileSync(backup, bytes)
    writeFileSync(backup + ".identity.json", JSON.stringify(evidence))
  }
  mutate(name, transform, binary = false) {
    const path = confinedPath(this.root, name)
    if (this.files.has(path)) throw new Error("Acceptance mutation already owned")
    const original = readFileSync(path),
      evidence = fileEvidence(this.root, path)
    const changed = Buffer.from(transform(binary ? original : original.toString("utf8")))
    assert.notDeepEqual(changed, original, "Mutation must change bytes")
    this.retain(name, original, evidence)
    this.files.set(path, { original, evidence, changed })
    writeFileSync(path, changed)
  }
  update(name, transform) {
    const path = confinedPath(this.root, name),
      item = this.files.get(path)
    if (!item || item.changed === null || !existsSync(path) || !readFileSync(path).equals(item.changed))
      throw new Error("Acceptance update lost mutation ownership")
    const changed = Buffer.from(transform(item.changed.toString("utf8")))
    assert.notDeepEqual(changed, item.changed, "Update must change bytes")
    item.changed = changed
    writeFileSync(path, changed)
  }
  remove(name) {
    const path = confinedPath(this.root, name)
    if (this.files.has(path)) throw new Error("Acceptance mutation already owned")
    const original = readFileSync(path),
      evidence = fileEvidence(this.root, path)
    this.retain(name, original, evidence)
    this.files.set(path, { original, evidence, changed: null })
    rmSync(path)
  }
  create(name, contents) {
    const destination = confinedPath(this.root, name)
    if (existsSync(destination) || this.files.has(destination)) throw new Error("Created source is already present")
    const bytes = Buffer.from(contents)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, bytes, { flag: "wx" })
    this.files.set(destination, { original: null, evidence: null, changed: bytes })
    if (this.backupDirectory) {
      const identity = confinedPath(this.backupDirectory, name + ".identity.json")
      mkdirSync(dirname(identity), { recursive: true })
      writeFileSync(identity, JSON.stringify({ path: name, original: null }))
    }
  }
  rename(from, to) {
    const source = confinedPath(this.root, from)
    if (this.files.has(source)) throw new Error("Acceptance mutation already owned")
    this.create(to, readFileSync(source))
    this.remove(from)
  }
  identities() {
    return [...this.files].map(([path, item]) => ({
      path: relative(this.root, path),
      original: item.evidence,
      mutated: existsSync(path) ? fileEvidence(this.root, path) : null
    }))
  }
  restore() {
    for (const [path, item] of this.files) {
      // Generated outputs may be recreated by the build; authored source may not be overwritten by another editor.
      const local = relative(this.root, path)
      const generated = isGeneratedMutationPath(local)
      const unchangedMutation =
        item.changed === null ? !existsSync(path) : existsSync(path) && readFileSync(path).equals(item.changed)
      if (!generated && !unchangedMutation)
        throw new Error(`Concurrent source edit; preserved backup required: ${relative(this.root, path)}`)
      if (item.original === null) rmSync(path)
      else {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, item.original)
        chmodSync(path, item.evidence.mode)
      }
      this.files.delete(path)
    }
  }
}

export const authoredInventory = (root, directory) =>
  readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (
        ["dist", "artifacts", "node_modules", ".test-runs", ".turbo", "prebuilt"].includes(entry.name) ||
        (directory === resolve(root, "packages/agent-flow-bend") && /\.generated\.(?:js|d\.ts)$/.test(entry.name))
      )
        return []
      if (entry.isSymbolicLink()) throw new Error("Authored acceptance inventory crosses a symlink")
      const path = resolve(directory, entry.name)
      return entry.isDirectory() ? authoredInventory(root, path) : [fileEvidence(root, path)]
    })

export const authoredCandidateIdentity = (root) => ({
  configuration: [
    "package.json",
    "bun.lock",
    "tsconfig.json",
    "tsconfig.package.json",
    "tsconfig.packages.json",
    "turbo.json"
  ].map((name) => fileEvidence(root, resolve(root, name))),
  owners: [...readPackageGraph(root).packages.values()].map((owner) => ({
    name: owner.manifest.name,
    manifest: fileEvidence(root, resolve(owner.path, "package.json")),
    compiler: owner.compiler,
    configuration:
      owner.compiler !== "typescript"
        ? owner.manifest.hapsland
        : fileEvidence(root, resolve(owner.path, "tsconfig.json")),
    source:
      owner.compiler !== "typescript"
        ? authoredInventory(root, owner.path)
        : authoredInventory(root, resolve(owner.path, "src"))
  })),
  auxiliaryWorkspaces: [...readPackageGraph(root).auxiliaryWorkspaces.values()].map((owner) => ({
    name: owner.manifest.name,
    role: owner.role,
    authored: authoredInventory(root, owner.path)
  })),
  tooling: authoredInventory(root, resolve(root, "scripts")),
  canonical: authoredInventory(root, resolve(root, "packages/agent-flow-bend")),
  nativeSource: authoredInventory(root, resolve(root, "native"))
})

export function retainReceiptEvidence(root, name, budget) {
  const source = confinedPath(root, name)
  const bytes = readFileSync(source)
  if (bytes.length > 10000000) throw new Error("Acceptance receipt exceeds evidence size bound")
  const receipt = JSON.parse(bytes.toString("utf8"))
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("Invalid acceptance receipt")
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  if (budget && !budget.seen.has(sha256)) {
    if (budget.bytes + bytes.length > budget.maxBytes)
      throw new Error("Acceptance campaign receipt evidence exceeds size bound")
    budget.bytes += bytes.length
    budget.seen.add(sha256)
  }
  const destination = resolve(root, ".test-runs/build-243/build-acceptance-receipts", sha256 + ".json")
  mkdirSync(dirname(destination), { recursive: true })
  try {
    writeFileSync(destination, bytes, { flag: "wx", mode: 0o644 })
  } catch (error) {
    if (error.code !== "EEXIST") throw error
    assert.equal(fileEvidence(root, destination).sha256, sha256, "Retained acceptance receipt was modified")
  }
  return { ...fileEvidence(root, destination), source: name }
}

export function artifactReceiptPaths(root, directory) {
  const path = confinedPath(root, directory)
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      if (entry.isSymbolicLink()) throw new Error("Artifact receipt traversal crosses a symlink")
      const name = directory + "/" + entry.name
      return entry.isDirectory() ? artifactReceiptPaths(root, name) : /receipt\.json$/.test(entry.name) ? [name] : []
    })
}

export function actualTaskCacheEvents(log) {
  return [
    ...log
      .replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), "")
      .matchAll(/^([^\n]+): cache (hit|miss|bypass)([^\n]*)$/gm)
  ].map((match) => ({ task: match[1].trim(), state: match[2], detail: match[3].trim() }))
}

export function requireTaskHits(result, tasks) {
  const events = actualTaskCacheEvents(result.log)
  for (const task of tasks) {
    const selected = events.filter((event) => event.task === task)
    assert(selected.length > 0, `${task} lacked actual Turbo cache evidence`)
    assert(
      selected.every((event) => event.state === "hit"),
      `${task} executed instead of restoring`
    )
  }
}

export function requireNoCompilation(result, profile, producerTasks) {
  const events = actualTaskCacheEvents(result.log)
  const expected =
    producerTasks ??
    events.filter((event) => /:(?:build|native:[^:]+|assemble:[^:]+)$/.test(event.task)).map((event) => event.task)
  assert(expected.length > 0, "No producer task cache evidence")
  requireTaskHits(result, expected)
  requireTaskHits(result, [
    ...["cli", "hook", "resident", "parser", "doctor"].map((role) => `@hapsland/${role}-entry:assemble:${profile}`),
    "@hapsland/pi-extension:assemble:host"
  ])
}

export function selectAcceptanceCases(ids) {
  if (!ids) return buildAcceptanceCases
  assert.equal(new Set(ids).size, ids.length, "Repeated acceptance case")
  return ids.map((id) => {
    const cell = buildAcceptanceCases.find((candidate) => candidate.id === id)
    assert(cell, "Unknown acceptance case")
    return cell
  })
}

export async function runAcceptance(root, options) {
  const cases = selectAcceptanceCases(options.cases)
  const deadline = Date.now() + options.timeoutMs
  const { assemblyArtifactPaths } = await import("./assemble-entry.mjs")
  const { nativeTaskPlans, nativeTaskDirectory } = await import("./native-task-inputs.mjs")
  const profile = options.profile
  const graph = readPackageGraph(root)
  const nativeArtifact = (source) => {
    for (const plan of nativeTaskPlans(root, graph, profile)) {
      const asset = plan.assets.find((item) => item.asset.producer.profiles[profile]?.source === source)
      if (asset)
        return {
          task: `${plan.node.manifest.name}:native:${profile}`,
          output: relative(root, asset.output),
          receipt: relative(root, resolve(nativeTaskDirectory(plan.node, profile), ".native-task-receipt.json"))
        }
    }
    throw new Error(`Missing native source owner: ${source}`)
  }
  const assemblyPaths = (role, selectedProfile = profile) => {
    const owner = [...graph.packages.values()].find((item) => item.manifest.hapsland?.role === role)
    assert(owner, `Missing assembly owner: ${role}`)
    return assemblyArtifactPaths(root, owner, selectedProfile)
  }
  assert.equal(profile, `${process.platform}-${process.arch}`, "Acceptance executes only native host profile")
  const campaignBudget = () => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error("Acceptance campaign deadline exceeded")
    return remaining
  }
  const evidenceDir = resolve(root, ".test-runs/build-243")
  mkdirSync(evidenceDir, { recursive: true })
  const runId = `${Date.now()}-${process.pid}`
  const report = {
    declaration: {
      startedAt: new Date().toISOString(),
      stopAt: new Date(deadline).toISOString(),
      expectedDuration: `${cases.length} selected cases; ${cases.length > 10 ? "25–45 minutes" : "3–5 minutes per case"}, including baseline and required repairs`,
      profile,
      command: ["npm", "run", "build"],
      perRunDeadlineMs: 300000
    },
    candidateSource: authoredCandidateIdentity(root),
    selectedCases: cases.map((cell) => cell.id),
    unexecutedCases: buildAcceptanceCases.map((cell) => cell.id),
    declarations: [],
    cells: [],
    pending: pendingAcceptanceCases
  }
  const reportPath = resolve(evidenceDir, `build-acceptance-${runId}.json`)
  const persist = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n")
  persist()
  console.log(JSON.stringify(report.declaration))
  const outputs = () => ({
    release: fileInventory(root, resolve(root, "dist")),
    executables: Object.fromEntries(
      ["cli", "hook", "resident", "parser", "doctor"].map((role) => [
        role,
        fileEvidence(root, resolve(root, `dist/bin/${profile}/${role === "cli" ? "hapsland" : "hapsland-" + role}`))
      ])
    )
  })
  const drainOwnedBuildTasks = async () => {
    const directory = resolve(root, ".test-runs/product-build")
    const lease = JSON.parse(readFileSync(resolve(directory, "lease.json"), "utf8"))
    await stopBuildGroups(directory, lease)
  }
  let buildEnvironment = process.env
  let baselineProducerTasks
  let latestBuildResult
  const receiptBudget = { bytes: 0, maxBytes: 64000000, seen: new Set() }
  const retainCurrentReceipts = () => {
    const retainedReceipts = []
    for (const owner of report.candidateSource.owners) {
      const ownerDirectory = dirname(owner.manifest.path)
      const source = resolve(
        root,
        ownerDirectory,
        owner.compiler === "bend" ? "dist/.bend-receipt.json" : "dist/.compile-receipt.json"
      )
      if (existsSync(source)) retainedReceipts.push(retainReceiptEvidence(root, relative(root, source), receiptBudget))
      for (const receipt of artifactReceiptPaths(root, ownerDirectory + "/artifacts"))
        retainedReceipts.push(retainReceiptEvidence(root, receipt, receiptBudget))
    }
    return retainedReceipts
  }
  const build = async (label, expectedSuccess = true, overrides = {}) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error("Acceptance campaign deadline exceeded")
    const step = `${report.declarations.length + 1}-${label}`
    const logPath = resolve(root, `.test-runs/build-acceptance-${runId}-${step}.log`)
    mkdirSync(dirname(logPath), { recursive: true })
    const fd = openSync(logPath, "w"),
      started = Date.now()
    const runDeclaration = {
      step,
      label,
      startedAt: new Date(started).toISOString(),
      stopAt: new Date(started + Math.min(300000, remaining)).toISOString(),
      expectedDuration: "30–120 seconds; cold compiler and assembly inputs may approach five-minute stop",
      environmentOverrides: overrides
    }
    report.declarations.push(runDeclaration)
    persist()
    console.log(JSON.stringify(runDeclaration))
    let failure
    try {
      await runBuildProcess("npm", ["run", "build"], {
        cwd: root,
        env: { ...buildEnvironment, HAPSLAND_BUILD_PROFILE: profile, ...overrides },
        timeout: Math.min(300000, remaining),
        stdio: ["ignore", fd, fd]
      })
    } catch (error) {
      failure = error
    } finally {
      closeSync(fd)
    }
    let cleanupFailure
    try {
      await drainOwnedBuildTasks()
    } catch (error) {
      cleanupFailure = error
      error.groupUnresolved = error.groupUnresolved !== false
      if (failure) failure.groupUnresolved ||= error.groupUnresolved
      else failure = error
    }
    const retainedReceipts = retainCurrentReceipts()
    const result = {
      retainedReceipts,
      step,
      label,
      environmentOverrides: overrides,
      success: !failure,
      elapsedMs: Date.now() - started,
      logEvidence: fileEvidence(root, logPath),
      error: failure?.message,
      cleanupFailure: cleanupFailure?.message,
      log: readFileSync(logPath, "utf8")
    }
    latestBuildResult = result
    report.cells.push({ ...result, log: undefined })
    persist()
    if (failure?.groupUnresolved) throw failure
    if (expectedSuccess !== null)
      assert.equal(result.success, expectedSuccess, `${label}: unexpected build outcome; inspect ${logPath}`)
    return result
  }
  const probe = async (role, args) => {
    const result = await runBuildProcess(
      resolve(root, `dist/bin/${profile}/${role === "cli" ? "hapsland" : "hapsland-" + role}`),
      args,
      { cwd: root, env: process.env, timeout: Math.min(10000, deadline - Date.now()), stdio: "pipe" }
    )
    report.cells.push({
      probe: {
        role,
        args,
        executable: fileEvidence(
          root,
          resolve(root, `dist/bin/${profile}/${role === "cli" ? "hapsland" : "hapsland-" + role}`)
        ),
        stdoutSha256: createHash("sha256").update(result.stdout).digest("hex"),
        stderrBytes: Buffer.byteLength(result.stderr),
        code: result.code
      }
    })
    persist()
    return result
  }
  const watch = async (scenario) => {
    const duration = watchScenarioBudget(campaignBudget()),
      started = Date.now()
    const watchDeadline = started + duration
    const label = `watch-${report.declarations.length + 1}`
    const logPath = resolve(root, `.test-runs/build-acceptance-${runId}-${label}.log`)
    const fd = openSync(logPath, "w")
    report.declarations.push({
      label,
      command: ["npm", "run", "build:watch", "--", `--timeout-ms=${duration}`],
      startedAt: new Date(started).toISOString(),
      stopAt: new Date(watchDeadline).toISOString(),
      expectedDuration:
        "5–8 minutes for multiple ordinary builds, drift and recovery; each build remains capped at five minutes"
    })
    persist()
    console.log(JSON.stringify(report.declarations.at(-1)))
    let spawned, terminalOutcome, handle, watchPid, scenarioFailure
    const observed = new Promise((done) => {
      spawned = done
    })
    const terminal = runBuildProcess("npm", ["run", "build:watch", "--", `--timeout-ms=${duration}`], {
      cwd: root,
      env: { ...buildEnvironment, HAPSLAND_BUILD_PROFILE: profile },
      timeout: duration,
      stdio: ["ignore", fd, fd],
      onSpawn: (identity) => {
        report.cells.push({ watchProcess: identity })
        persist()
        spawned(identity)
      }
    }).then(
      (result) => {
        terminalOutcome = { result }
        return terminalOutcome
      },
      (error) => {
        terminalOutcome = { error }
        return terminalOutcome
      }
    )
    const statusPath = resolve(root, ".test-runs/watch-build.json")
    const states = []
    const currentStatus = () => {
      let record
      try {
        record = JSON.parse(readFileSync(statusPath, "utf8"))
      } catch (error) {
        if (error.code === "ENOENT" || error instanceof SyntaxError) return undefined
        throw error
      }
      if (
        !Number.isSafeInteger(record.pid) ||
        record.pid <= 1 ||
        !Number.isFinite(Date.parse(record.observedAt)) ||
        Date.parse(record.observedAt) < started
      )
        return undefined
      if (watchPid !== undefined && record.pid !== watchPid) throw new Error("Watch status changed process ownership")
      try {
        const group = Number(
          execFileSync("ps", ["-p", String(record.pid), "-o", "pgid="], {
            encoding: "utf8",
            timeout: Math.min(5000, campaignBudget())
          }).trim()
        )
        if (group !== handle.group) throw new Error("Watch status is not in the observed owned process group")
      } catch (error) {
        if (terminalOutcome || (error.status === 1 && !error.stdout?.toString().trim())) return undefined
        throw error
      }
      watchPid ??= record.pid
      const previous = states.at(-1)
      if (!previous || previous.observedAt !== record.observedAt) {
        states.push(record)
        report.cells.push({ watch: record })
        persist()
        console.log(`Acceptance watch ${record.state}: owned PID ${record.pid}`)
      }
      return record
    }
    const waitFor = async (state, after = started) => {
      while (Date.now() < watchDeadline) {
        if (terminalOutcome) throw terminalOutcome.error ?? new Error(`Watch stopped before ${state}`)
        const record = currentStatus()
        if (record?.state === state && Date.parse(record.observedAt) >= after) {
          if (["ready", "failed"].includes(state)) {
            report.cells.push({
              watchReceiptObservation: record,
              retainedReceipts: retainCurrentReceipts(),
              acceptedOutputs: state === "ready"
            })
            persist()
          }
          return record
        }
        await new Promise((done) => setTimeout(done, 100))
      }
      throw new Error(`Watch acceptance deadline exceeded waiting for ${state}`)
    }
    const finishWatch = async () => {
      let stopFailure
      try {
        if (!terminalOutcome && watchPid !== undefined) {
          const record = currentStatus()
          if (record) process.kill(watchPid, "SIGTERM")
        }
      } catch (error) {
        stopFailure = error
      }
      // Missing or conflicting observation is never permission to restore
      // source while the owned process handle can still run. Always observe
      // the bounded producer terminal and drain registered descendants first.
      const outcome = await terminal
      try {
        await drainOwnedBuildTasks()
      } catch (error) {
        error.groupUnresolved = error.groupUnresolved !== false
        throw error
      }
      if (outcome.error) throw outcome.error
      if (stopFailure) throw stopFailure
      const finalStatus = JSON.parse(readFileSync(statusPath, "utf8"))
      assert.equal(finalStatus.pid, watchPid)
      assert.equal(finalStatus.state, "stopped")
      assert.equal(existsSync(resolve(root, ".test-runs/watch-build/lock")), false, "Watch lock survived terminal stop")
      report.cells.push({
        watchFinished: finalStatus,
        logEvidence: fileEvidence(root, logPath),
        code: outcome.result.code
      })
      persist()
    }
    try {
      handle = await Promise.race([
        observed,
        terminal.then((outcome) => {
          throw outcome.error ?? new Error("Watch exited before spawn observation")
        })
      ])
      await scenario({ waitFor, states })
    } catch (error) {
      scenarioFailure = error
    } finally {
      try {
        await finishWatch()
      } catch (error) {
        if (error.groupUnresolved) scenarioFailure = error
        else scenarioFailure ??= error
      } finally {
        closeSync(fd)
        report.cells.push({
          step: label,
          logEvidence: fileEvidence(root, logPath),
          watchTerminal: { success: !scenarioFailure, error: scenarioFailure?.message }
        })
        persist()
      }
    }
    if (scenarioFailure) throw scenarioFailure
  }
  try {
    await withOwnedLock(
      resolve(root, ".test-runs/build-acceptance"),
      async () =>
        withBuildLock(
          root,
          async (leaseEnvironment) => {
            buildEnvironment = leaseEnvironment
            const preflightStarted = Date.now()
            const preflightTimeout = Math.min(60000, campaignBudget())
            const preflightLog = resolve(root, `.test-runs/build-acceptance-${runId}-preflight.log`)
            const preflightDeclaration = {
              step: "preflight",
              label: "focused-acceptance-preflight",
              startedAt: new Date(preflightStarted).toISOString(),
              stopAt: new Date(preflightStarted + preflightTimeout).toISOString(),
              expectedDuration: "Under one minute; fixture and context API checks before baseline or mutation"
            }
            report.declarations.push(preflightDeclaration)
            persist()
            console.log(JSON.stringify(preflightDeclaration))
            const preflightFd = openSync(preflightLog, "w")
            let preflightFailure
            try {
              await runBuildProcess(
                process.execPath,
                [
                  "--test",
                  "scripts/build-workflow-acceptance.test.mjs",
                  "scripts/build-resolution-acceptance-cases.test.mjs"
                ],
                {
                  cwd: root,
                  env: leaseEnvironment,
                  timeout: preflightTimeout,
                  stdio: ["ignore", preflightFd, preflightFd]
                }
              )
            } catch (error) {
              preflightFailure = error
            } finally {
              closeSync(preflightFd)
            }
            try {
              await drainOwnedBuildTasks()
            } catch (error) {
              preflightFailure = error
            }
            report.cells.push({
              step: "preflight",
              success: !preflightFailure,
              elapsedMs: Date.now() - preflightStarted,
              logEvidence: fileEvidence(root, preflightLog)
            })
            persist()
            if (preflightFailure) throw preflightFailure
            const baseline = await build("baseline")
            baselineProducerTasks = [
              ...new Set(
                actualTaskCacheEvents(baseline.log)
                  .filter((event) => /:(?:build|native:[^:]+|assemble:[^:]+)$/.test(event.task))
                  .map((event) => event.task)
              )
            ]
            report.producerTasks = baselineProducerTasks
            report.candidate = outputs()
            const toolchain = JSON.parse(readFileSync(resolve(root, ".test-runs/build-toolchain.json"), "utf8"))
            report.toolchain = Object.fromEntries(
              ["node", "bun", "dependencies", "platform", "architecture"].map((key) => [key, toolchain[key]])
            )
            assert.deepEqual(
              authoredCandidateIdentity(root),
              report.candidateSource,
              "Candidate changed during baseline build"
            )
            persist()
            const baselineHelp = new Map()
            for (const role of ["hook", "resident", "parser", "doctor"]) {
              const result = await probe(role, ["--help"])
              assert.equal(result.stderr, "", `${role} baseline help wrote diagnostics`)
              baselineHelp.set(role, result.stdout)
            }
            for (const cell of cases) {
              const mutations = new CandidateMutations(
                root,
                resolve(root, `.test-runs/build-acceptance-backups/${runId}/${cell.id}`)
              )
              let preserveCandidate = false,
                caseFailure,
                mutatedAuthored = false
              const mutateOwned = (operation, action) => {
                const before = mutations.identities()
                const result = action()
                mutatedAuthored ||= [...before, ...mutations.identities()].some(
                  (item) => !isGeneratedMutationPath(item.path)
                )
                report.cells.push({
                  mutationStep: {
                    id: cell.id,
                    operation,
                    before,
                    after: mutations.identities(),
                    at: new Date().toISOString()
                  }
                })
                persist()
                return result
              }
              try {
                await cell.run({
                  root,
                  profile,
                  build,
                  outputs,
                  owners: report.candidateSource.owners,
                  nativeArtifact,
                  latestBuild: () => latestBuildResult,
                  assemblyReceipt: (role, selectedProfile) =>
                    JSON.parse(readFileSync(assemblyPaths(role, selectedProfile).receipt, "utf8")),
                  assemblyReceiptPath: (role, selectedProfile) =>
                    relative(root, assemblyPaths(role, selectedProfile).receipt),
                  assemblyOutputPath: (role, selectedProfile) =>
                    relative(root, assemblyPaths(role, selectedProfile).output),
                  inventory: (name) => fileInventory(root, confinedPath(root, name)),
                  file: (name) => fileEvidence(root, confinedPath(root, name)),
                  read: (name) => readFileSync(confinedPath(root, name), "utf8"),
                  signature: (name) => {
                    const fd = openSync(confinedPath(root, name), "r"),
                      bytes = Buffer.alloc(4)
                    try {
                      assert.equal(readSync(fd, bytes, 0, 4, 0), 4)
                      return bytes.toString("hex")
                    } finally {
                      closeSync(fd)
                    }
                  },
                  probe,
                  watch,
                  restore: () => mutateOwned("restore", () => mutations.restore()),
                  update: (...args) => mutateOwned("update", () => mutations.update(...args)),
                  mutate: (...args) => mutateOwned("mutate", () => mutations.mutate(...args)),
                  create: (...args) => mutateOwned("create", () => mutations.create(...args)),
                  mutateBytes: (name, transform) =>
                    mutateOwned("mutateBytes", () => mutations.mutate(name, transform, true)),
                  remove: (...args) => mutateOwned("remove", () => mutations.remove(...args)),
                  rename: (...args) => mutateOwned("rename", () => mutations.rename(...args)),
                  hasExecutable: (role) =>
                    existsSync(
                      resolve(root, `dist/bin/${profile}/${role === "cli" ? "hapsland" : "hapsland-" + role}`)
                    ),
                  requireTaskHits,
                  taskCacheEvents: actualTaskCacheEvents,
                  requireNoCompilation: (result) => requireNoCompilation(result, profile, baselineProducerTasks),
                  probeTool: async (name, args) => {
                    const result = await probeAcceptanceTool(root, name, args, campaignBudget(), buildEnvironment)
                    report.cells.push({
                      toolProbe: {
                        executable: fileEvidence(root, confinedPath(root, name)),
                        args,
                        stdoutSha256: createHash("sha256").update(result.stdout).digest("hex"),
                        stderrBytes: Buffer.byteLength(result.stderr),
                        code: result.code
                      }
                    })
                    persist()
                    return result
                  },
                  probeHook: async () => {
                    const result = await probe("hook", [])
                    assert.equal(result.stdout, "", "Unrelated hook invocation must remain quiet")
                    assert.equal(result.stderr, "", "Hook wrote diagnostics into host response channel")
                  }
                })
                report.cells.push({ id: cell.id, accepted: true, mutations: mutations.identities() })
                persist()
              } catch (error) {
                report.cells.push({
                  id: cell.id,
                  accepted: false,
                  error: error.message,
                  mutations: mutations.identities()
                })
                persist()
                preserveCandidate = error.groupUnresolved === true
                caseFailure = error
              } finally {
                if (!preserveCandidate) mutations.restore()
              }
              if (preserveCandidate) throw caseFailure
              assert.deepEqual(
                authoredCandidateIdentity(root),
                report.candidateSource,
                "Candidate drifted during mutation or rollback"
              )
              const skipRepair = canSkipRepair({
                success: !caseFailure && latestBuildResult?.success === true,
                mutatedAuthored,
                authoredIdentity: authoredCandidateIdentity(root),
                candidateIdentity: report.candidateSource,
                published: outputs,
                candidatePublished: report.candidate,
                environmentOverrides: latestBuildResult?.environmentOverrides
              })
              if (!skipRepair) await build(`${cell.id}-repair`)
              assert.deepEqual(
                authoredCandidateIdentity(root),
                report.candidateSource,
                "Candidate changed during repair"
              )
              for (const [role, expectedHelp] of skipRepair ? [] : baselineHelp) {
                const result = await probe(role, ["--help"])
                assert.equal(result.stdout, expectedHelp, `${role} repaired behavior differs from original candidate`)
                assert.equal(result.stderr, "", `${role} repaired help wrote diagnostics`)
              }
              if (caseFailure) throw caseFailure
              if (cell.verifyRepair)
                await cell.verifyRepair({ inventory: (name) => fileInventory(root, confinedPath(root, name)) })
              report.unexecutedCases = report.unexecutedCases.filter((id) => id !== cell.id)
              report.cells.push({
                id: cell.id,
                completed: true,
                rollbackAndRepair: !skipRepair,
                repairSkipped: skipRepair
                  ? "Successful unchanged publication with frozen authored inputs and no authored mutation"
                  : undefined
              })
              persist()
              console.log(
                JSON.stringify({
                  event: "case-terminal",
                  id: cell.id,
                  status: "passed",
                  completed: true,
                  at: new Date().toISOString()
                })
              )
            }
          },
          campaignBudget()
        ),
      campaignBudget()
    )
  } catch (error) {
    report.failure = {
      at: new Date().toISOString(),
      message: error.message,
      groupUnresolved: error.groupUnresolved === true
    }
    persist()
    throw error
  }
  report.finishedAt = new Date().toISOString()
  persist()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some((arg) => !/^--(?:timeout-ms=\d+|case=[a-z-]+)$/.test(arg)))
    throw new Error("Unknown acceptance argument")
  const timeoutMs = Number(args.find((arg) => arg.startsWith("--timeout-ms="))?.split("=")[1] ?? 1200000)
  assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 3600000)
  const cases = args.filter((arg) => arg.startsWith("--case=")).map((arg) => arg.slice(7))
  assert(
    cases.every((id) => buildAcceptanceCases.some((cell) => cell.id === id)),
    "Unknown acceptance case"
  )
  await runAcceptance(resolve(import.meta.dirname, ".."), {
    timeoutMs,
    profile: `${process.platform}-${process.arch}`,
    cases: cases.length ? cases : undefined
  })
}
