import { runClient } from "../../src/test-support/client-runtime.ts"
/** Distinct-process resident witness: parent drives Unix IPC, child owns TypeSafe encoding. */
import { spawn } from "node:child_process"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import { adaptCodexDirectEvent } from "../../src/direct-event/adapter.ts"
import { makeGitFixture, put, updateEvent } from "../../src/direct-event/test-fixtures.ts"
import { DEFAULT_DESTINATION } from "../../src/runtime/review-config.ts"
import { residentRequestEffect as residentRequest } from "../../src/resident/client.ts"
import { monotonicNow } from "../../src/resident/hook-clock.ts"
import { residentPaths } from "../../src/resident/paths.ts"
import { decodeResidentRequest } from "../../src/resident/protocol.ts"
import { securityWireManifest, securityWireRule } from "./security-wire-observer.ts"

const scenario = process.argv[process.argv.indexOf("--scenario") + 1]
if (!["allowed", "exclude-at-dispatch", "exclude-at-admission"].includes(scenario)) {
  throw new Error("use --scenario allowed|exclude-at-dispatch|exclude-at-admission")
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 10))
const waitFile = async (path, child) => {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    if (child.exitCode !== null) throw new Error("offline resident exited before readiness")
    try {
      const content = await readFile(path, "utf8")
      if (content.trim().length > 0) return content
    } catch {
      /* The child has not published the marker yet. */
    }
    await pause()
  }
  throw new Error("offline resident readiness timed out")
}
let root
let child
try {
  root = await makeGitFixture()
  const path = securityWireManifest.positive.path
  await put(root, path, securityWireManifest.positive.source)
  await put(
    root,
    "rules.jsonc",
    JSON.stringify({
      version: 1,
      ...securityWireRule,
      inputs: [
        {
          languages: ["typescript", "rust", "bend"],
          kind: "type",

          requires: ["root-declaration", "resolved-outbound-types"]
        }
      ]
    })
  )
  const config = { version: 1, rules: ["rules.jsonc"] }
  if (scenario === "exclude-at-admission") config.excludes = [path]
  await put(root, ".hapsland.jsonc", JSON.stringify(config))
  const statePath = join(root, "consent")
  const observation = await Effect.runPromise(
    adaptCodexDirectEvent(updateEvent(root, path, [securityWireManifest.positive.root]))
  )
  if (observation === undefined) throw new Error("fixture observation failed")
  const paths = residentPaths(join(root, "runtime"))
  child = spawn(
    process.execPath,
    ["--experimental-strip-types", new URL("./resident-wire-child.mjs", import.meta.url).pathname, root],
    { stdio: "ignore", env: { ...process.env, TYPESAFE_API_KEY: "" } }
  )
  const lifetime = (await waitFile(join(root, "wire-ready"), child)).trim()
  const events = [
    {
      kind: "fixtureAuthority",
      phase: "admission",
      source: "fixture",
      repoId: "fixture-repo",
      path,
      destination: DEFAULT_DESTINATION,
      policyRevision: scenario === "exclude-at-admission" ? "excluded" : "initial"
    }
  ]
  const dispatch = {
    statePath,
    userConfigPath: null,
    credential: {
      name: "TYPESAFE_API_KEY",
      environmentValue: "WIRE_KEY_SENTINEL",

      generation: 0,
      statePath: join(root, "credential-state")
    },
    controlled: null
  }
  const admission = {
    requestRoute: "shared",
    operation: "admit",
    lifetime,
    observation,
    controlledWriter: true,
    dispatch,
    composed: true
  }
  if (decodeResidentRequest(JSON.stringify(admission)) === undefined) {
    throw new Error("fixture admission failed resident protocol validation before send")
  }
  const permit = await runClient(
    residentRequest(paths, {
      requestRoute: "shared",
      operation: "register-edit",
      lifetime,
      root: observation.root,
      advicee: observation.advicee,
      startedAt: monotonicNow()
    })
  )
  if (permit.status !== "advanced") throw new Error(`resident rejected fixture permit: ${permit.status}`)
  const admit = await runClient(residentRequest(paths, admission))
  events.push({ kind: "admit", status: admit.status, source: "production", repoId: "fixture-repo", path })
  if (admit.status !== "accepted") throw new Error(`resident rejected fixture: ${admit.status}`)
  if (scenario !== "exclude-at-admission") {
    await waitFile(join(root, "wire-prepared"), child)
    events.push({ kind: "prepared", source: "production", repoId: "fixture-repo", path })
  }
  if (scenario === "exclude-at-dispatch") {
    await put(root, ".hapsland.jsonc", JSON.stringify({ ...config, excludes: [path] }))
  }
  events.push({
    kind: "fixtureAuthority",
    phase: "dispatch",
    source: "fixture",
    repoId: "fixture-repo",
    path,
    destination: DEFAULT_DESTINATION,
    policyRevision: scenario === "allowed" ? "initial" : "excluded"
  })
  await writeFile(join(root, "wire-release"), "go\n")
  let settled = false
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const stats = await runClient(residentRequest(paths, { requestRoute: "shared", operation: "stats", lifetime }))
    if (stats.status === "stats" && stats.queued === 0 && stats.running === 0 && stats.pendingEvaluations === 0) {
      settled = true
      break
    }
    await pause()
  }
  if (!settled) throw new Error("offline resident did not become idle")
  const collection = await runClient(
    residentRequest(paths, {
      requestRoute: "shared",
      operation: "collect",
      lifetime,
      root: observation.root,
      advicee: observation.advicee,
      dispatch,
      composed: true
    })
  )
  if (collection.status === "unsupported") throw new Error("resident rejected composed fixture collection")
  const journalPath = join(root, "wire-child-journal.jsonl")
  let childRecords = []
  try {
    childRecords = (await readFile(journalPath, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse)
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error
  }
  const authorityObservations = childRecords.filter((item) => item.kind === "dispatchAuthority")
  const authorityOrder = childRecords
    .filter((item) => item.kind === "dispatchAuthority" || item.kind === "request")
    .map((item) =>
      item.kind === "dispatchAuthority"
        ? { kind: item.kind, path: item.path, sequence: item.sequence }
        : { kind: item.kind, path }
    )
  const requests = childRecords.filter((item) => item.kind === "request").map(({ kind: _kind, ...request }) => request)
  for (const request of requests)
    events.push({ kind: "request", source: "production", repoId: "fixture-repo", path, ...request })
  events.push({ kind: "settled", source: "production", repoId: "fixture-repo", path })
  const expectedCount = scenario === "exclude-at-admission" ? 0 : 1
  const expectedAuthorityCount = scenario === "exclude-at-admission" ? 0 : 1
  const authority = authorityObservations[0]
  const expectedSelection = scenario !== "exclude-at-admission"
  const authorityMatches =
    authorityObservations.length === expectedAuthorityCount &&
    (authority === undefined ||
      (authority.path === path &&
        authority.sequence === 1 &&
        /^[a-f0-9]{64}$/.test(authority.evaluationId) &&
        /^[a-f0-9]{64}$/.test(authority.policyDigest) &&
        authority.selected === expectedSelection &&
        authority.decision === (expectedSelection ? "allow" : "deny") &&
        authority.admission === (expectedSelection ? "admitReview" : "refuseSelection") &&
        authority.physicalRootVerified === true &&
        /^[a-f0-9]{64}$/.test(authority.expectedRootIdentitySha256) &&
        authority.credentialStatus === "present" &&
        authority.credentialGeneration === 0))
  const expectedOrder = scenario !== "exclude-at-admission" ? ["dispatchAuthority", "request"] : []
  const orderMatches =
    JSON.stringify(authorityOrder.map((item) => item.kind)) === JSON.stringify(expectedOrder) &&
    authorityOrder.every((item) => item.path === path)
  const verdict =
    requests.length === expectedCount &&
    requests.every((request) => request.classification === "allowed") &&
    !childRecords.some((item) => item.kind === "unexpectedNetworkAttempt") &&
    childRecords.filter((item) => item.kind === "prepared").length === (scenario === "exclude-at-admission" ? 0 : 1) &&
    authorityMatches &&
    orderMatches
      ? "pass"
      : "offline resident effect mismatch"
  process.stdout.write(
    `${JSON.stringify({ version: 1, profile: "distinct-process", scenario, events, requests, authorityObservations, authorityOrder, verdict })}\n`
  )
  if (verdict !== "pass") process.exitCode = 1
} catch (error) {
  process.stderr.write(
    `resident wire process fixture failed: ${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
} finally {
  if (child !== undefined && child.exitCode === null) {
    child.kill("SIGTERM")
    await new Promise((resolve) => child.once("exit", resolve))
  }
  if (root !== undefined) await rm(root, { recursive: true, force: true })
}
