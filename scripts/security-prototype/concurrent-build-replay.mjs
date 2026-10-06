/** Bounded offline build-overlap witness for issue #104; no live transport. */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
const root = fileURLToPath(new URL("../../", import.meta.url))
const evidencePath = process.argv[2]
if (!evidencePath) throw new Error("provide an evidence JSON path")
if (process.platform !== "linux" || process.arch !== "arm64") throw new Error("declared profile is Linux arm64")
const helper = resolve(root, "scripts/build-capture-helper.mjs")
const replay = resolve(root, "scripts/security-prototype/resident-wire.mjs")
const binding = resolve(root, "native/prebuilt/linux-arm64/tree-sitter/build/Release/tree_sitter_runtime_binding.node")
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const children = new Set()
const completions = []
const trials = []
const report = {
  version: 1,
  issue: 104,
  status: "incomplete",
  declaredAt: new Date().toISOString(),
  profile: { platform: process.platform, arch: process.arch, node: process.version },
  scope:
    "current resident offline security replay held after native parser preparation during actual helper rebuild; historical Quint generator is not executed",
  deadlineMs: 120000,
  selectedTrials: 3,
  scenarios: ["allowed", "exclude-at-dispatch"],
  inputs: {
    runnerSha256: digest(fileURLToPath(import.meta.url)),
    helperSha256: digest(helper),
    replaySha256: digest(replay),
    publicationSha256: digest(resolve(root, "scripts/native-artifact.mjs")),
    residentSha256: digest(resolve(root, "packages/resident-runtime/src/resident/server.ts")),
    nativeParserSha256: digest(resolve(root, "packages/source-analysis/src/direct-event/languages/native-parser.ts"))
  },
  trials,
  liveRequests: 0
}
const save = () => writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`)
save()
let expired = false
const killGroup = (child) => {
  if (!child.pid) return
  try {
    process.kill(-child.pid, "SIGKILL")
  } catch (error) {
    if (error.code !== "ESRCH") throw error
  }
}
const timer = setTimeout(() => {
  expired = true
  for (const child of children) killGroup(child)
}, report.deadlineMs)
const start = (path, args = [], ipc = false) => {
  const child = spawn(process.execPath, ["--experimental-strip-types", path, ...args], {
    cwd: root,
    detached: true,
    stdio: ["ignore", "pipe", "pipe", ...(ipc ? ["ipc"] : [])],
    env: { ...process.env, TYPESAFE_API_KEY: "", HAPSLAND_SECURITY_BUILD_BARRIER: ipc ? "1" : "0" }
  })
  children.add(child)
  let stdout = ""
  let outputOverflow = false
  child.stdout.on("data", (chunk) => {
    if (stdout.length + chunk.length > 1048576) {
      outputOverflow = true
      killGroup(child)
    } else stdout += chunk
  })
  // Preserve only sanitized outcome and stderr digest, never source-bearing responses.
  const stderrHash = createHash("sha256")
  child.stderr.on("data", (chunk) => stderrHash.update(chunk))
  let spawnError
  child.once("error", (error) => {
    spawnError = error.code ?? "spawn-error"
  })
  const completion = new Promise((resolve) =>
    child.once("close", (code, signal) => {
      children.delete(child)
      resolve({ code, signal, stdout, outputOverflow, spawnError, stderrSha256: stderrHash.digest("hex") })
    })
  )
  completions.push(completion)
  return { child, completion }
}
try {
  for (let trial = 1; trial <= 3; trial += 1)
    for (const scenario of report.scenarios) {
      const entry = { trial, scenario, startedAt: new Date().toISOString() }
      trials.push(entry)
      save()
      const actor = start(replay, ["--scenario", scenario], true)
      const prepared = await new Promise((resolve, reject) => {
        actor.child.once("message", (message) =>
          message?.kind === "prepared" ? resolve(message) : reject(new Error("invalid readiness"))
        )
        actor.child.once("exit", () => reject(new Error("replay exited before native preparation")))
        actor.child.once("error", reject)
      })
      entry.preparedAt = new Date().toISOString()
      const oldInode = statSync(binding).ino
      entry.loadedOriginalInode = prepared.nativeMappingInodes.includes(oldInode)
      if (!entry.loadedOriginalInode) throw new Error("replay did not map the artifact being rebuilt")
      const build = start(helper)
      const built = await build.completion
      entry.build = { code: built.code, signal: built.signal, stderrSha256: built.stderrSha256 }
      entry.nativeInodeReplaced = statSync(binding).ino !== oldInode
      if (built.code !== 0 || built.signal || expired) throw new Error("helper build failed or deadline expired")
      actor.child.send("build-complete")
      const replayed = await actor.completion
      entry.replay = {
        code: replayed.code,
        signal: replayed.signal,
        stderrSha256: replayed.stderrSha256,
        outputOverflow: replayed.outputOverflow,
        spawnError: replayed.spawnError
      }
      save()
      const outcome = JSON.parse(replayed.stdout.trim())
      entry.replay = {
        ...entry.replay,
        verdict: outcome.verdict,
        requestCount: outcome.requests.length,
        postBuildParsed: outcome.events.some((event) => event.kind === "postBuildParsed"),
        classifications: outcome.requests.map((request) => request.classification),
        authorityDecisions: outcome.authorityObservations.map((authority) => authority.decision)
      }
      entry.completedAt = new Date().toISOString()
      save()
      if (
        replayed.code !== 0 ||
        replayed.signal ||
        outcome.verdict !== "pass" ||
        !entry.nativeInodeReplaced ||
        !entry.replay.postBuildParsed ||
        outcome.requests.length !== (scenario === "allowed" ? 1 : 0) ||
        outcome.authorityObservations[0]?.decision !== (scenario === "allowed" ? "allow" : "deny")
      )
        throw new Error("build/replay acceptance failed")
    }
  report.status = "pass"
} catch (error) {
  report.failure = error.message
  process.exitCode = 1
} finally {
  for (const child of children) killGroup(child)
  await Promise.all(completions)
  clearTimeout(timer)
  report.completedAt = new Date().toISOString()
  save()
}
console.log(JSON.stringify({ status: report.status, trials: trials.length, evidencePath }))
