import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import { pathToFileURL } from "node:url"

const [root, mode, fixturePath, goldenPath, implementation = "public"] = process.argv.slice(2)
assert.ok(root && fixturePath && goldenPath)
const phaseStart = performance.now()
const phase = (name) => {
  if (process.env.HAPSLAND_PREPARATION_PROFILE_PHASES === "1")
    process.stderr.write(
      JSON.stringify({
        diagnosticOnly: true,
        implementation,
        phase: name,
        elapsedSeconds: (performance.now() - phaseStart) / 1000
      }) + "\n"
    )
}
phase("imports:start")
const load = (path) => import(pathToFileURL(root + path).href)
const ownerCalls = {}
const requestCounts = {},
  logicalRequestCounts = {},
  seenRequests = new Set(),
  requestMetadata = new Map(),
  issuedLeases = new Set(),
  providerOutcomes = { issuedCalls: 0, refusedCalls: 0, noActionCalls: 0 }
let requestEpoch = 0
const observeRequests = process.env.HAPSLAND_PREPARATION_PROFILE_REQUESTS === "1"
if (observeRequests) {
  assert.ok(process.env.HAPSLAND_PREPARATION_PROFILE_DIR, "request tracing is diagnostic only")
  assert.equal(process.env.HAPSLAND_PREPARATION_PROFILE_OWNER, "1", "request tracing reconciles with issued leases")
}
if (process.env.HAPSLAND_PREPARATION_PROFILE_OWNER === "1") {
  assert.ok(process.env.HAPSLAND_PREPARATION_PROFILE_DIR, "owner tracing is diagnostic only")
  const owner = (await load("/packages/agent-flow-bend/dist/canonical-resolver-owner.generated.js")).default
  for (const [name, original] of Object.entries(owner)) {
    if (typeof original !== "function") continue
    owner[name] = (...args) => {
      const record = (ownerCalls[name] ??= { calls: 0, seconds: 0 })
      record.calls++
      const start = performance.now()
      let result
      try {
        result = Reflect.apply(original, owner, args)
      } finally {
        record.seconds += (performance.now() - start) / 1000
      }
      if (observeRequests && name === "provider_start") {
        let issued = 0
        if (result.$ === "Rejected") providerOutcomes.refusedCalls++
        else {
          let actions = result.actions
          while (actions.$ === "Con") {
            const action = actions.head
            if (action.$ === "ExecuteProvider") {
              const identity = `${requestEpoch}:${action.invocation}:${action.lease}:${action.request}`
              assert.equal(issuedLeases.has(identity), false, "duplicate issued Canonical lease")
              const metadata = requestMetadata.get(`${requestEpoch}:${action.invocation}:${action.request}`)
              assert.ok(metadata, "issued Canonical lease lacks observed request metadata")
              issuedLeases.add(identity)
              requestCounts[metadata] = (requestCounts[metadata] ?? 0) + 1
              issued++
            }
            actions = actions.tail
          }
          assert.equal(actions.$, "Nil")
          if (issued) providerOutcomes.issuedCalls++
          else providerOutcomes.noActionCalls++
        }
      }
      return result
    }
  }
}
assert.ok(implementation === "public" || implementation === "native-oracle")
const prepareObservation =
  implementation === "native-oracle"
    ? (await load("/packages/review-execution/dist/direct-event/preparation/verification/native-preparation.js"))
        .prepareNativeObservation
    : (await load("/packages/review-execution/dist/direct-event/pipeline.js")).prepareObservation
if (observeRequests && implementation === "public") {
  for (const [family, path, name] of [
    ["graph", "/packages/source-analysis/dist/direct-event/graph-resolution/composition/protocol.js", "graphProtocol"],
    [
      "preparation",
      "/packages/review-execution/dist/direct-event/preparation/canonical-protocol.js",
      "preparationProtocol"
    ],
    [
      "finalization",
      "/packages/review-execution/dist/direct-event/preparation/finalization-protocol.js",
      "finalizationProtocol"
    ]
  ]) {
    const protocol = (await load(path))[name],
      original = protocol.awaitRequest
    protocol.awaitRequest = (...args) => {
      const request = Reflect.apply(original, protocol, args)
      if (request !== undefined) {
        const identity = `${family}:${request.invocation}:${request.id}`
        const operation = request.operation?.$ ?? request.command?.$ ?? request.finalization?.$ ?? "unknown"
        const nested = request.finalization?.step?.$
        const key = `${family}:${operation}${nested === undefined ? "" : ":" + nested}`
        const metadataIdentity = `${requestEpoch}:${request.invocation}:${request.id}`
        const existing = requestMetadata.get(metadataIdentity)
        assert.ok(existing === undefined || existing === key, "conflicting Canonical request metadata")
        requestMetadata.set(metadataIdentity, key)
        if (!seenRequests.has(identity)) {
          seenRequests.add(identity)
          logicalRequestCounts[key] = (logicalRequestCounts[key] ?? 0) + 1
        }
      }
      return request
    }
  }
}
const { discoverPhysicalWorkingTreeRoot } = await load("/packages/native-observation/dist/repository/root.js")
const { configuredRules } = await load("/scripts/test-support/default-rules.ts")
const { advicee } = await load("/scripts/test-support/test-fixtures.ts")
const { DEFAULT_BACKEND, DEFAULT_DESTINATION } = await load("/packages/review-definition/dist/runtime/review-config.js")
const Effect = await load("/node_modules/effect/dist/Effect.js")
phase("imports:complete")
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"))
const cases = await Promise.all(
  fixtures.map(async ({ root: fixtureRoot, paths }) => ({
    observation: {
      ...(await Effect.runPromise(discoverPhysicalWorkingTreeRoot(fixtureRoot))),
      advicee: advicee(),
      candidates: paths.map((path) => ({ operation: "add", path }))
    },
    context: {
      controlledWriter: true,
      advicee: advicee(),
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      rules: configuredRules
    }
  }))
)
phase("fixtures:complete")
const observeProcesses = process.env.HAPSLAND_PREPARATION_PROFILE_PROCESSES === "1" && typeof Bun === "undefined"
let processStarts = 0
const processCounts = []
const processObserver = observeProcesses
  ? (await import("node:async_hooks")).createHook({
      init(_id, type) {
        if (type === "PROCESSWRAP") processStarts++
      }
    })
  : undefined
processObserver?.enable()
let sweep = 0
const run = async () => {
  const results = []
  const round = observeProcesses ? sweep++ : 0
  let index = 0
  for (const { observation, context } of cases) {
    const before = processStarts
    if (observeRequests) {
      requestEpoch++
      seenRequests.clear()
      requestMetadata.clear()
    }
    results.push(JSON.stringify(await Effect.runPromise(prepareObservation(observation, context))))
    if (observeProcesses) processCounts.push({ sweep: round, fixture: index++, starts: processStarts - before })
  }
  return results
}
phase("first-flow:start")
const actual = await run()
phase("first-flow:complete")
const controls = JSON.stringify(cases.map(({ context }) => context))
const results = actual.map((value) => JSON.parse(value))
for (const [index, result] of results.slice(0, 6).entries()) {
  assert.ok(
    result.outcomes.some((outcome) => outcome.status === "ready"),
    "fixture must prepare actual review work: " + JSON.stringify({ index, paths: fixtures[index].paths, result })
  )
  assert.equal(result.observation.units.length, 1)
  assert.equal(result.observation.units[0].root.artifact.name, "Root")
}
assert.ok(
  results[5].observation.units[0].root.references.some(
    (reference) => reference.kind === "expanded" && reference.node.artifact.name === "Support"
  ),
  "recursive fixture must capture and attach supporting evidence"
)
assert.equal(results[6].observation.status, "incomplete")
assert.equal(results[6].observation.units.length, 0)
assert.ok(
  results[6].observation.outcomes.some(
    (outcome) =>
      outcome.status === "observed" &&
      outcome.analysis.status === "incomplete" &&
      outcome.analysis.failures.some((failure) => failure.reason === "import" && failure.root === undefined)
  ),
  "error fixture must retain original import diagnosis"
)
if (mode === "prepare") {
  writeFileSync(goldenPath, JSON.stringify({ controls, results: actual }))
  process.exit(0)
}
const golden = JSON.parse(readFileSync(goldenPath, "utf8"))
assert.equal(controls, golden.controls, "lanes must use the same semantic rules and invocation settings")
const expected = golden.results
assert.deepEqual(actual, expected)
const warmups = 3,
  rounds = 2
phase("warmups:start")
for (let index = 0; index < warmups; index++) assert.deepEqual(await run(), expected)
phase("warmups:complete")
for (const record of Object.values(ownerCalls)) {
  record.calls = 0
  record.seconds = 0
}
for (const histogram of [requestCounts, logicalRequestCounts])
  for (const key of Object.keys(histogram)) histogram[key] = 0
issuedLeases.clear()
for (const key of Object.keys(providerOutcomes)) providerOutcomes[key] = 0
phase("measurement:start")
const started = performance.now(),
  cpu = process.cpuUsage()
let checksum = 0
for (let index = 0; index < rounds; index++) {
  const result = await run()
  assert.deepEqual(result, expected)
  checksum += result.reduce((sum, value) => sum + value.length, 0)
}
const used = process.cpuUsage(cpu)
phase("measurement:complete")
processObserver?.disable()
if (observeRequests && implementation === "public") {
  assert.equal(
    Object.values(requestCounts).reduce((sum, count) => sum + count, 0),
    issuedLeases.size
  )
  assert.equal(
    Object.values(providerOutcomes).reduce((sum, count) => sum + count, 0),
    ownerCalls.provider_start.calls
  )
}
if (observeProcesses) assert.ok(processStarts > 0 && processCounts.length === cases.length * (1 + warmups + rounds))
console.log(
  JSON.stringify({
    seconds: (performance.now() - started) / 1000,
    cpuSeconds: (used.user + used.system) / 1e6,
    checksum,
    fixtures: cases.length,
    warmups,
    rounds,
    definedAndEqual: true,
    implementation,
    ...(process.env.HAPSLAND_PREPARATION_PROFILE_DIR === undefined
      ? {}
      : {
          diagnosticMemory: process.memoryUsage(),
          diagnosticMeasurementWindow: {
            startedAtMicroseconds: (performance.timeOrigin + started) * 1000,
            endedAtMicroseconds: (performance.timeOrigin + performance.now()) * 1000
          }
        }),
    ...(process.env.HAPSLAND_PREPARATION_PROFILE_OWNER === "1" ? { diagnosticOwnerCalls: ownerCalls } : {}),
    ...(observeRequests
      ? {
          diagnosticRequestCounts: requestCounts,
          diagnosticLogicalRequestCounts: logicalRequestCounts,
          diagnosticIssuedLeases: issuedLeases.size,
          diagnosticProviderOutcomes: providerOutcomes
        }
      : {}),
    ...(observeProcesses ? { diagnosticProcessCounts: processCounts } : {}),
    runtime: typeof Bun === "undefined" ? process.version : Bun.version
  })
)
