import { artifactValueTag, binary64, fromProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import { createServiceSession, createServiceRegistry } from "../service-session.ts"
import { inspectSourceFrontend, parseCargoSyntax, inspectRustModuleSyntax } from "../frontends.ts"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { DEFAULT_DIRECT_FILE_POLICY, eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { createMachineDriver } from "./resolver-driver.mjs"
import { encodeGraphToken, encodeGraphCache } from "../reply-codec.ts"
const folder = import.meta.dirname,
  temp = mkdtempSync("/tmp/hapsland-resolver-machine-"),
  tagged = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
try {
  const machinePath = join(temp, "machine.mjs")
  execFileSync("bend", [join(folder, "../Machine.bend"), "-o", machinePath], { timeout: 10000 })
  const { default: machine } = await import(pathToFileURL(machinePath))
  const clockPath = join(temp, "clock.mjs")
  execFileSync("bend", [join(folder, "../Clock.bend"), "-o", clockPath], { timeout: 10000 })
  const { default: clock } = await import(pathToFileURL(clockPath))
  const numbers = [
    0,
    -0,
    4999.999999999999,
    5000,
    5000.000000000001,
    -5000,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_VALUE,
    Number.MIN_VALUE
  ]
  for (const n of numbers) assert.equal(clock.expired(binary64(n)), n >= 5000)
  const registry = createServiceRegistry()
  const foreign = ([request], options) => registry.perform(request, options)
  const c = GRAPH_LIMIT_CEILINGS,
    limits = {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      version: 1,
      source_bytes: c.sourceBytes,
      tree_bytes: c.treeBytes,
      files: c.files,
      read_bytes: c.readBytes,
      outgoing_edges: c.outgoingEdges,
      depth: c.depth,
      work: c.work
    }
  let id = 1,
    maximumPureChain = 0
  const input = (session, path, source, branch = "type", overrides = {}) =>
    tagged("ResolverInput", {
      invocation: session.invocation,
      root_path: path,
      root_capture: encodeGraphToken(session.registerCapture({ text: source, byteLength: Buffer.byteLength(source) })),
      root_bytes: Buffer.byteLength(source),
      root_name: "Root",
      root_source: source,
      branch: tagged(branch === "function" ? "FunctionBranch" : "TypeBranch"),
      caller_cache: encodeGraphCache(session.callerCache),
      limits,
      ...overrides
    })
  let measuredProduct
  const drive = createMachineDriver({
    machine,
    foreign,
    registry,
    trace: true,
    observeFinished: (step) => {
      if (step.result.$ === "Types.ReviewUnitResult") assert.deepEqual(step.result.value, measuredProduct)
    },
    observeTransition: (step, reply) => {
      if (step.request.operation.$ === "Types.EncodeProduct") measuredProduct = step.request.operation.value
      if (reply.outcome.$ === "Types.ProviderRejected") return
      const raw = machine.stage_reply(step.state.stage, reply.outcome, step.state)
      let chain = raw,
        count = 0
      while (chain.$ !== "Loop.ServiceStep" && count <= 16) {
        chain = machine.dispatch_action(chain)
        count++
      }
      assert.equal(chain.$, "Loop.ServiceStep", "pure dispatch exceeded bound")
      maximumPureChain = Math.max(maximumPureChain, count)
      assert.deepEqual(machine.settle(count, raw), chain)
      if (count > 0) assert.equal(machine.settle(count - 1, raw).step.failure.$, "Types.MalformedReply")
    }
  })

  execFileSync("git", ["init", "-q", temp])
  writeFileSync(join(temp, "probe-a.ts"), "export interface A { value: string }")
  const physicalPorts = {
    access: (path) => Effect.runPromise(eligibleNamedPath(temp, path, DEFAULT_DIRECT_FILE_POLICY)),
    capture: (selection) => Effect.runPromise(captureStable(temp, selection))
  }
  const fixtures = [
    ["root.ts", "export interface Child { value: boolean }; export interface Root { child: Child }", "type"],
    ["root.ts", "export function Root(value: string): string { return value }", "function"],
    ["root.bend", "type Child is Data:\n  Child{}\ntype Root is Data:\n  Root{child: Child}", "type"],
    ["root.ts", "import type { A } from './probe-a'; export interface Root { a: A }", "type", true]
  ]
  for (const [path, source, branch, crossFile] of fixtures) {
    let calls = 0
    const session = createServiceSession({
        invocation: id++,
        root: temp,
        now: () => {
          calls++
          return 0
        },
        ...physicalPorts,
        frontend: inspectSourceFrontend,
        parseCargo: parseCargoSyntax,
        inspectRustModules: inspectRustModuleSyntax
      }),
      data = input(session, path, source, branch),
      actual = await drive(session, data)
    assert.equal(actual.result.$, "Types.ReviewUnitResult")
    const declarations = languageForPath(path).inspect(path, source)?.declarations
    const rootArtifact =
      branch === "function"
        ? languageForPath(path).analyzeFunctions(path, source).functions.get("Root").artifact
        : declarations.get("Root").artifact
    const childPath = crossFile ? "probe-a.ts" : path
    const childName = crossFile ? "A" : "Child"
    const childArtifact =
      branch === "function"
        ? undefined
        : crossFile
          ? languageForPath(childPath).inspect(childPath, "export interface A { value: string }").declarations.get("A")
              .artifact
          : declarations.get("Child").artifact
    assert.deepEqual(fromProductValue(actual.result.value), {
      root: {
        artifact: rootArtifact,
        references: childArtifact
          ? [{ kind: "expanded", site: { symbol: childName }, node: { artifact: childArtifact, references: [] } }]
          : []
      },
      sourceDependencies: []
    })
    assert.equal(calls, crossFile ? 8 : 4)
    if (!crossFile)
      assert.deepEqual(actual.trace, [
        "Types.StartClock",
        "Types.PathExtension",
        "Types.ReadClock",
        "Types.InspectSource",
        "Types.EncodeProduct",
        "Types.ReadClock",
        "Types.EncodeProduct",
        "Types.ReadClock"
      ])
  }
  assert.ok(maximumPureChain > 0, "cross-file fixture must exercise nonzero pure dispatch")
  const expired = createServiceSession({
    invocation: id++,
    root: temp,
    now: (() => {
      let calls = 0
      return () => (calls++ === 0 ? 0 : 5000)
    })(),
    frontend: () => {
      throw new Error("frontend must not run")
    }
  })
  assert.equal((await drive(expired, input(expired, "root.ts", "interface Root {}"))).result.$, "Types.NoReviewUnit")
  const iterationExpired = createServiceSession({
    invocation: id++,
    root: temp,
    now: (() => {
      let calls = 0
      return () => (calls++ < 2 ? 0 : 5000)
    })(),
    frontend: inspectSourceFrontend
  })
  const deadlineResult = await drive(iterationExpired, input(iterationExpired, "root.ts", "export interface Root {}"))
  assert.equal(deadlineResult.result.$, "Types.NoReviewUnit")
  assert.equal(deadlineResult.finalFrame.$, "Some")
  assert.equal(deadlineResult.finalFrame.value.graph.phase.$, "../../../../agent-flow-bend/ImportGraph.Incomplete")
  assert.equal(deadlineResult.finalFrame.value.graph.phase.reason.$, "../../../../agent-flow-bend/ImportGraph.Deadline")
  const unavailable = createServiceSession({ invocation: id++, root: temp, now: () => 0 })
  assert.equal((await drive(unavailable, input(unavailable, "root.txt", "unknown"))).result.$, "Types.NoReviewUnit")
  const protocolSession = createServiceSession({ invocation: id++, root: temp }),
    awaiting = machine.initial(input(protocolSession, "root.ts", "interface Root {}"))
  const request = awaiting.step.request
  for (const [patch, expected] of [
    [{ invocation: 999 }, "Types.WrongInvocation"],
    [{ id: 99 }, "Types.WrongCorrelation"],
    [{ outcome: tagged("ProductEncoded", { bytes: 1 }) }, "Types.WrongReplyKind"]
  ]) {
    const reply = tagged("Reply", {
      invocation: request.invocation,
      id: request.id,
      outcome: tagged("ClockStarted", { clock: tagged("ClockToken", { invocation: request.invocation, id: 1 }) }),
      ...patch
    })
    assert.equal(machine.resume(awaiting, tagged("ServiceReply", { reply })).step.failure.$, expected)
  }
  assert.equal(
    machine.resume(awaiting, tagged("CancelInvocation", { invocation: request.invocation })).step.failure.$,
    "Types.InvocationCancelled"
  )
  protocolSession.close()
  const originalError = new Error("original clock failure"),
    throwsClock = createServiceSession({
      invocation: id++,
      root: temp,
      now: () => {
        throw originalError
      }
    })
  await assert.rejects(
    drive(throwsClock, input(throwsClock, "root.ts", "interface Root {}")),
    (error) => error === originalError
  )
  assert.equal(registry.size, 0)
  const hostileClock = tagged("Reply", {
    invocation: request.invocation,
    id: request.id,
    outcome: tagged("ClockStarted", { clock: tagged("ClockToken", { invocation: 999, id: 1 }) })
  })
  assert.equal(
    machine.resume(awaiting, tagged("ServiceReply", { reply: hostileClock })).step.failure.$,
    "Types.WrongInvocation"
  )
  const record = {
    passed: true,
    cases: numbers.length + fixtures.length + 10,
    clockBitCases: numbers.length,
    rootConsumerFixtures: fixtures.length,
    maximumPureChain,
    zeroFuelServiceBoundaryAccepted: true,
    measuredProductReturned: true,
    deadlineBeforeFrontend: true,
    deadlineTransitionRetained: true,
    wrongOwnerCorrelationKindRejected: true,
    outputTokenInvocationRejected: true,
    cancellationDistinct: true,
    providerExceptionIdentityBeforeCleanup: true,
    registryClosed: registry.size === 0,
    scope:
      "Standalone pure machine settlement/protocol/deadline checks over four authored trees and native parser facts. Production Canonical Cause/interruption/late cleanup belong to owned Graph and physical clock/capture consumers; no generic IO-loop, native graph oracle or whole acceptance claim."
  }
  assert.equal(registry.size, 0)
  mkdirSync(join(folder, "../../../../../..", ".test-runs"), { recursive: true })
  writeFileSync(
    join(folder, "../../../../../..", ".test-runs", "machine-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
