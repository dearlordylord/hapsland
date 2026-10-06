import { runClient } from "../../src/test-support/client-runtime.ts"
import { Deferred, Exit, Scope } from "effect"
import { reviewControlsLayer } from "../../src/test-support/review-controls.ts"
/** Offline resident wire witness. Run with node --experimental-strip-types. */
import { createHash } from "node:crypto"
import nodeHttp from "node:http"
import nodeHttps from "node:https"
import { rm } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { typeScriptRoot } from "@hapsland/source-analysis/direct-event/languages/native-parser"
import { makeGitFixture, put, updateEvent } from "../../src/direct-event/test-fixtures.ts"
import { DEFAULT_DESTINATION } from "@hapsland/review-definition/runtime/review-config"
import { residentRequestEffect as residentRequest } from "@hapsland/resident-transport/resident/client"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { makeResidentRuntime } from "@hapsland/resident-runtime/resident/server"
import { makeOfflineSecurityHttpClient, securityWireManifest, securityWireRule } from "./security-wire-observer.ts"

const scenario = process.argv[process.argv.indexOf("--scenario") + 1]
if (!["allowed", "exclude-at-dispatch", "exclude-at-admission"].includes(scenario)) {
  throw new Error("use --scenario allowed|exclude-at-dispatch|exclude-at-admission")
}

const manifest = securityWireManifest
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex")
const path = manifest.positive.path
const oracleRule = securityWireRule
const events = []
const requests = []
const authorityObservations = []
const authorityOrder = []
let failure
const denyNetwork = () => {
  failure = "unexpected network HTTP attempt"
  event("unexpectedNetworkAttempt", { source: "production" })
  throw new Error("offline wire witness forbids network HTTP")
}
globalThis.fetch = async () => denyNetwork()
nodeHttp.request = denyNetwork
nodeHttp.get = denyNetwork
nodeHttps.request = denyNetwork
nodeHttps.get = denyNetwork
const held = Effect.runSync(Deferred.make())
const prepared = Effect.runSync(Deferred.make())
const reachedPrepare = Effect.runPromise(Deferred.await(prepared))
const event = (kind, fields = {}) => events.push({ kind, jobId: "job-1", ...fields })
const http = makeOfflineSecurityHttpClient((record) => {
  requests.push(record)
  authorityOrder.push({ kind: "request", path })
  event("request", { ...record, repoId: "fixture-repo", path, destination: DEFAULT_DESTINATION, source: "production" })
  if (record.classification === "forbidden") failure = "encoded request differed from independent oracle"
})
let root
let server
let fixtureScope
try {
  root = await makeGitFixture()
  await put(root, path, manifest.positive.source)
  await put(
    root,
    "rules.jsonc",
    JSON.stringify({
      version: 1,
      ...oracleRule,
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
  event("fixtureAuthority", {
    phase: "admission",
    repoId: "fixture-repo",
    path,
    destination: DEFAULT_DESTINATION,
    policyRevision: scenario === "exclude-at-admission" ? "excluded" : "initial",
    source: "fixture"
  })
  const observation = await Effect.runPromise(adaptCodexDirectEvent(updateEvent(root, path, [manifest.positive.root])))
  if (observation === undefined) throw new Error("fixture observation failed")
  const paths = residentPaths(join(root, "runtime"))
  fixtureScope = await Effect.runPromise(Scope.make())
  server = await Effect.runPromise(
    makeResidentRuntime(paths, undefined, {
      offlineHttpClient: http,
      dispatchAuthorityObserver: (record) => {
        authorityObservations.push(record)
        authorityOrder.push({ kind: "dispatchAuthority", path: record.path, sequence: record.sequence })
      },
      reviewControls: reviewControlsLayer({
        beforeEvaluate: (unit) =>
          Effect.gen(function* () {
            event("prepared", {
              repoId: "fixture-repo",
              path: unit.input.path,
              declaration: unit.input.declaration.name,
              sourceSha256: sha256(unit.input.declaration.source),
              source: "production"
            })
            yield* Deferred.succeed(prepared, undefined)
            yield* Deferred.await(held)
          })
      })
    }).pipe(Effect.provideService(Scope.Scope, fixtureScope))
  )
  await Effect.runPromise(server.listen())
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
  const permit = await runClient(
    residentRequest(paths, {
      requestRoute: "shared",
      operation: "register-edit",
      lifetime: server.lifetime,
      root: observation.root,
      advicee: observation.advicee,
      startedAt: monotonicNow()
    })
  )
  if (permit.status !== "advanced") throw new Error(`resident rejected fixture permit: ${permit.status}`)
  const admit = await runClient(
    residentRequest(paths, {
      requestRoute: "shared",
      operation: "admit",
      lifetime: server.lifetime,
      observation,
      controlledWriter: true,
      dispatch,
      composed: true
    })
  )
  event("admit", { status: admit.status, repoId: "fixture-repo", path, source: "production" })
  if (admit.status !== "accepted") throw new Error(`resident rejected fixture: ${admit.status}`)
  if (scenario !== "exclude-at-admission") await reachedPrepare
  // Optional build-overlap witness: preparation has loaded the native parsers,
  // and dispatch remains held until the parent finishes refreshing artifacts.
  if (process.env.HAPSLAND_SECURITY_BUILD_BARRIER === "1") {
    if (process.send === undefined || scenario === "exclude-at-admission")
      throw new Error("build barrier requires IPC and a prepared scenario")
    const released = new Promise((resolve) =>
      process.once("message", (message) => {
        if (message !== "build-complete") throw new Error("unexpected build barrier message")
        resolve()
      })
    )
    const nativeMappings = readFileSync("/proc/self/maps", "utf8")
      .split("\n")
      .filter((line) => line.includes("/native/prebuilt/") && line.includes("tree_sitter_runtime_binding.node"))
      .map((line) => Number(line.trim().split(/\s+/)[4]))
    if (nativeMappings.length === 0) throw new Error("prepared replay has no mapped release parser binding")
    process.send({ kind: "prepared", nativeMappingInodes: [...new Set(nativeMappings)] })
    await released
    // Exercise the already-loaded binding again after publication, before dispatch.
    const parsed = typeScriptRoot(path, manifest.positive.source)
    if (parsed.hasError || !parsed.namedChildren.some((node) => node.text === manifest.positive.root)) {
      throw new Error("post-build native parsing failed to recover the expected interface")
    }
    event("postBuildParsed", { source: "production", path })
  }
  if (scenario === "exclude-at-dispatch") {
    await put(root, ".hapsland.jsonc", JSON.stringify({ ...config, excludes: [path] }))
    event("fixtureAuthority", {
      phase: "dispatch",
      repoId: "fixture-repo",
      path,
      destination: DEFAULT_DESTINATION,
      policyRevision: "excluded",
      source: "fixture"
    })
  } else {
    event("fixtureAuthority", {
      phase: "dispatch",
      repoId: "fixture-repo",
      path,
      destination: DEFAULT_DESTINATION,
      policyRevision: scenario === "allowed" ? "initial" : "excluded",
      source: "fixture"
    })
  }
  await Effect.runPromise(Deferred.succeed(held, undefined))
  await Effect.runPromise(server.whenIdle())
  const collection = await runClient(
    residentRequest(paths, {
      requestRoute: "shared",
      operation: "collect",
      lifetime: server.lifetime,
      root: observation.root,
      advicee: observation.advicee,
      dispatch,
      composed: true
    })
  )
  if (collection.status === "unsupported") throw new Error("resident rejected composed fixture collection")
  event("settled", { repoId: "fixture-repo", path, source: "production" })
  const expectedCount = scenario === "exclude-at-admission" ? 0 : 1
  if (requests.length !== expectedCount) failure = `expected ${expectedCount} request(s), observed ${requests.length}`
  if (requests.some((request) => request.classification !== "allowed")) failure = "forbidden request observed"
  if (events.some((entry) => entry.kind === "prepared" && entry.path !== path)) failure = "unexpected prepared path"
  const expectedAuthorityCount = scenario === "exclude-at-admission" ? 0 : 1
  if (authorityObservations.length !== expectedAuthorityCount) failure = "resident authority observation count mismatch"
  const authority = authorityObservations[0]
  if (authority !== undefined) {
    const expectedSelection = scenario !== "exclude-at-admission"
    if (
      authority.path !== path ||
      authority.sequence !== 1 ||
      !/^[a-f0-9]{64}$/.test(authority.evaluationId) ||
      !/^[a-f0-9]{64}$/.test(authority.policyDigest) ||
      authority.selected !== expectedSelection ||
      authority.decision !== (expectedSelection ? "allow" : "deny") ||
      authority.admission !== (expectedSelection ? "admitReview" : "refuseSelection") ||
      authority.physicalRootVerified !== true ||
      !/^[a-f0-9]{64}$/.test(authority.expectedRootIdentitySha256) ||
      authority.credentialStatus !== "present" ||
      authority.credentialGeneration !== 0
    ) {
      failure = "resident authority observation mismatch"
    }
  }
  const orderKinds = authorityOrder.map((entry) => entry.kind)
  if (
    JSON.stringify(orderKinds) !==
    JSON.stringify(scenario !== "exclude-at-admission" ? ["dispatchAuthority", "request"] : [])
  )
    failure = "resident authority/request ordering mismatch"
  if (authorityOrder.some((entry) => entry.path !== path)) failure = "authority/request path mismatch"
  process.stdout.write(
    `${JSON.stringify({ version: 1, scenario, events, requests, authorityObservations, authorityOrder, verdict: failure ?? "pass" })}\n`
  )
  if (failure !== undefined) process.exitCode = 1
} catch (error) {
  process.stderr.write(`resident wire fixture failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  if (fixtureScope !== undefined) await Effect.runPromise(Scope.close(fixtureScope, Exit.void))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
}
