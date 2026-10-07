import { runClient } from "@hapsland/build-tooling/test-support/client-runtime"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  ensureResidentEffect as ensureResident,
  residentRequestEffect as residentRequest
} from "@hapsland/resident-transport/resident/client"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { classifyHookOutput, classifyLiveOutcome } from "@hapsland/build-tooling/test-support/live-evidence-outcome"
import {
  PaidExecutionNotAuthorized,
  assertPaidExecutionAuthorized,
  providerCallCountForEvidence
} from "@hapsland/build-tooling/test-support/live-runner-policy"

const root = resolve(new URL("../", import.meta.url).pathname)
const primaryEnv = "/workspace/typescript/jev/.env"
const outputPath = join(root, "evidence/direct-event-v1/live-jev-milestone.json")
const declaration = Object.freeze({
  fixtureIds: ["direct-event-add-single-unit-v1"],
  intendedProviderCallCeiling: 1,
  providerBoundaryCounter: false,
  providerCallCountPolicy: "unknown-not-inferred-from-admission",
  sourceLimitBytesPerFile: 32_768,
  fixtureSourceBytesMaximum: 256,
  deadlineMilliseconds: 15_000,
  automaticRetries: 0,
  retainedFields: [
    "fixture IDs",
    "bands",
    "contract outcomes",
    "timings",
    "source-free outcome categories",
    "provider count policy"
  ]
})

const run = (command, args, options = {}) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs ?? 30_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.once("error", reject)
    child.once("close", (code, signal) => {
      clearTimeout(timer)
      resolveRun({ code, signal, stdout, stderr })
    })
    if (options.input !== undefined) child.stdin.end(options.input)
  })

const readCredential = async () => {
  if (typeof process.env.TYPESAFE_API_KEY === "string" && process.env.TYPESAFE_API_KEY.length > 0) {
    return { value: process.env.TYPESAFE_API_KEY, location: "process-environment" }
  }
  const encoded = await readFile(primaryEnv, "utf8").catch(() => undefined)
  if (encoded === undefined) return undefined
  for (const line of encoded.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/.exec(line)
    if (match === null) continue
    let value = match[1] ?? ""
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value.length > 0) return { value, location: "primary-worktree-env-file" }
  }
  return undefined
}
const band = (milliseconds) =>
  milliseconds < 1_000
    ? "under-1s"
    : milliseconds < 5_000
      ? "1s-to-under-5s"
      : milliseconds < 15_000
        ? "5s-to-under-15s"
        : "15s-or-more"

// This declaration is printed before any credential lookup, consent mutation, or
// provider-capable command. It is also retained verbatim in the sanitized record.
process.stderr.write(`declared paid milestone: ${JSON.stringify(declaration)}\n`)
try {
  assertPaidExecutionAuthorized(process.argv)
} catch (cause) {
  if (!(cause instanceof PaidExecutionNotAuthorized)) throw cause
  process.stderr.write("paid milestone not executed: pass --execute-paid after explicit authorization\n")
  process.exit(2)
}

const credential = await readCredential()
const gaps = []
if (credential === undefined) gaps.push(`TYPESAFE_API_KEY unavailable in process environment and ${primaryEnv}`)
const temporary = await mkdtemp(join(tmpdir(), "direct-event-live-milestone-"))
let result
try {
  const repository = join(temporary, "repository")
  const state = join(temporary, "consent")
  const runtime = join(temporary, "runtime")
  await mkdir(repository)
  await run("git", ["init", "--quiet", "--initial-branch=master"], { cwd: repository })
  const env = {
    ...process.env,
    REVIEW_STATE_PATH: state,
    REVIEW_RESIDENT_DIR: runtime,
    ...(credential === undefined ? {} : { TYPESAFE_API_KEY: credential.value })
  }
  let contractOutcome = "not-run"
  let hostOutputKind = "none"
  let successfulEvaluation = false
  let elapsedMilliseconds = 0
  if (gaps.length === 0 && credential !== undefined) {
    const source = "export interface Delivery { id: string; destination: string }\n"
    if (Buffer.byteLength(source) > declaration.fixtureSourceBytesMaximum)
      throw new Error("fixture exceeds declared source bound")
    await writeFile(join(repository, "profile.ts"), source, { mode: 0o600 })
    const base = {
      session_id: "live-milestone-session",
      transcript_path: null,
      cwd: repository,
      hook_event_name: "PostToolUse",
      model: "sanitized-live-milestone",
      permission_mode: "default",
      tool_response: "Success"
    }
    const add = {
      ...base,
      turn_id: "add-turn",
      tool_use_id: "add-tool",
      tool_name: "apply_patch",
      tool_input: { command: `*** Begin Patch\n*** Add File: profile.ts\n+${source.trimEnd()}\n*** End Patch` }
    }
    const started = performance.now()
    const admitted = await run(
      process.execPath,
      [join(root, "packages/hook-entry/src/hook-main.ts"), "--codex-hook", "--controlled-writer"],
      { cwd: root, env, input: JSON.stringify(add), timeoutMs: 20_000 }
    )
    contractOutcome = admitted.code === 0 ? "admitted-completion-pending" : "admission-failed"
    for (let attempt = 0; attempt < 20 && admitted.code === 0; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
      const reply = await run(
        process.execPath,
        [join(root, "packages/hook-entry/src/hook-main.ts"), "--codex-hook", "--controlled-writer"],
        {
          cwd: root,
          env,
          input: JSON.stringify({
            ...base,
            turn_id: `collect-turn-${attempt}`,
            tool_use_id: `collect-tool-${attempt}`,
            tool_name: "Bash",
            tool_input: { command: "true" }
          }),
          timeoutMs: 20_000
        }
      )
      let output
      try {
        output = JSON.parse(reply.stdout)
      } catch {
        output = undefined
      }
      hostOutputKind = classifyHookOutput(output ?? {})
      if (hostOutputKind !== "none") {
        break
      }
    }
    const paths = residentPaths(runtime)
    const owner = await runClient(ensureResident(paths))
    let terminalStats
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const observed = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      ).catch(() => undefined)
      if (observed?.status === "stats" && observed.queued === 0 && observed.running === 0) {
        terminalStats = observed
        break
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
    // If evaluation completed after the ordinary collection loop, give the
    // finished result one final host opportunity before classification.
    if (hostOutputKind === "none" && terminalStats?.status === "stats") {
      const reply = await run(
        process.execPath,
        [join(root, "packages/hook-entry/src/hook-main.ts"), "--codex-hook", "--controlled-writer"],
        {
          cwd: root,
          env,
          input: JSON.stringify({
            ...base,
            turn_id: "final-collect-turn",
            tool_use_id: "final-collect-tool",
            tool_name: "Bash",
            tool_input: { command: "true" }
          }),
          timeoutMs: 20_000
        }
      )
      let output
      try {
        output = JSON.parse(reply.stdout)
      } catch {
        output = undefined
      }
      hostOutputKind = classifyHookOutput(output ?? {})
      terminalStats = await runClient(
        residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime: owner.lifetime })
      ).catch(() => terminalStats)
    }
    ;({ contractOutcome, successfulEvaluation } = classifyLiveOutcome({
      admissionExitCode: admitted.code,
      hostOutputKind,
      stats: terminalStats
    }))
    await runClient(
      residentRequest(paths, { requestRoute: "shared", operation: "cleanup", lifetime: owner.lifetime })
    ).catch(() => undefined)
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    try {
      process.kill(owner.pid, 0)
      process.kill(owner.pid, "SIGTERM")
    } catch {
      /* exited */
    }
    elapsedMilliseconds = Math.round(performance.now() - started)
  }
  result = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    milestoneDeclaration: declaration,
    credentialLocation: credential?.location ?? "unavailable",
    fixtureResults: [
      {
        fixtureId: declaration.fixtureIds[0],
        contractOutcome,
        hostOutputKind,
        sourceFreeSuccessfulEvaluation: successfulEvaluation,
        timingMilliseconds: elapsedMilliseconds,
        timingBand: elapsedMilliseconds === 0 ? "not-run" : band(elapsedMilliseconds)
      }
    ],
    paidCapableExecutions: gaps.length === 0 && credential !== undefined ? 1 : 0,
    providerCallCount: providerCallCountForEvidence(contractOutcome !== "admission-failed"),
    automaticRetries: 0,
    retainedRawBackendMaterial: false,
    evidenceGaps: gaps,
    verdict: gaps.length > 0 ? "not-run-environment-gap" : successfulEvaluation ? "passed" : "inconclusive"
  }
  if (process.argv.includes("--write-evidence")) {
    await mkdir(join(root, "evidence/direct-event-v1"), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (result.verdict === "inconclusive") process.exitCode = 1
