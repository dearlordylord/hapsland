import { artifactValueTag, binary64, fromProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import { createDispatcher } from "../runtime-observation/transport.mjs"
import { createServiceSession, createServiceRegistry } from "../service-session.ts"
import { inspectSourceFrontend, parseCargoSyntax, inspectRustModuleSyntax } from "../frontends.ts"
import { resolveGraphUnit } from "@hapsland/source-analysis/direct-event/graph-resolver"
import { DEFAULT_DIRECT_FILE_POLICY } from "@hapsland/native-observation/direct-event/selection"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import {
  createMachineDriver,
  createIODriver,
  createVerificationEffectResolver as createBendEffectResolver
} from "./resolver-driver.mjs"
import { pureReply } from "../frontend-codec.ts"
const folder = import.meta.dirname,
  temp = mkdtempSync("/tmp/hapsland-resolver-machine-"),
  tagged = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
try {
  assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), "bend 2.0.36")
  const machinePath = join(temp, "machine.mjs")
  execFileSync("bend", [join(folder, "../Machine.bend"), "-o", machinePath], { timeout: 5000 })
  const { default: machine } = await import(pathToFileURL(machinePath))
  const clockPath = join(temp, "clock.mjs")
  execFileSync("bend", [join(folder, "../Clock.bend"), "-o", clockPath], { timeout: 5000 })
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
  const runtimePath = join(temp, "runtime.js")
  execFileSync("bend", [join(folder, "../Runtime.bend"), "-o", runtimePath], { timeout: 5000 })
  const source = readFileSync(runtimePath, "utf8"),
    footer = "\ncli(process.argv.slice(1));\nio_exit($main$, null);"
  assert.ok(source.endsWith(footer))
  assert.deepEqual(
    [...source.matchAll(/io_eff\("([^"]+)",/g)].map((m) => m[1]),
    ["perform"]
  )
  const embedded = join(temp, "embedded.mjs")
  writeFileSync(
    embedded,
    source.slice(0, -footer.length) +
      "\nexport const start=request=>run_loop($call_service$(request)(value=>({$:'Emit',value})));\nexport const handlers=Object.freeze({perform:$0eff.perform});\n"
  )
  const { start, handlers } = await import(pathToFileURL(embedded)),
    foreign = createDispatcher(start, handlers)
  const fullRuntime = join(temp, "full-runtime.mjs")
  execFileSync("bend", [join(folder, "../Runtime.bend"), "-o", fullRuntime], { timeout: 5000 })
  writeFileSync(
    fullRuntime,
    readFileSync(fullRuntime, "utf8") + "\nexport const handlers=Object.freeze({perform:$0eff.perform});\n"
  )
  const { default: ioProgram, handlers: ioHandlers } = await import(pathToFileURL(fullRuntime)),
    ioForeign = createDispatcher(
      (value) => ioProgram.resolve_debug(value)((value) => ({ $: "Emit", value })),
      ioHandlers
    )
  const registry = createServiceRegistry()
  globalThis.__hapslandWholeResolverServices = registry
  const c = GRAPH_LIMIT_CEILINGS,
    limits = {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      version: 1n,
      source_bytes: BigInt(c.sourceBytes),
      tree_bytes: BigInt(c.treeBytes),
      files: BigInt(c.files),
      read_bytes: BigInt(c.readBytes),
      outgoing_edges: BigInt(c.outgoingEdges),
      depth: BigInt(c.depth),
      work: BigInt(c.work)
    }
  let id = 1,
    maximumPureChain = 0
  const input = (session, path, source, branch = "type", overrides = {}) =>
    tagged("ResolverInput", {
      invocation: BigInt(session.invocation),
      root_path: path,
      root_capture: pureReply(session.registerCapture({ text: source, byteLength: Buffer.byteLength(source) })),
      root_bytes: BigInt(Buffer.byteLength(source)),
      root_name: "Root",
      root_source: source,
      branch: tagged(branch === "function" ? "FunctionBranch" : "TypeBranch"),
      caller_cache: pureReply(session.callerCache),
      limits,
      ...overrides
    })
  const ioProductForeign = createDispatcher(
      (value) => ioProgram.resolve(value)((value) => ({ $: "Emit", value })),
      ioHandlers
    ),
    ioProductDrive = createIODriver({ resolve: ioProductForeign, registry })
  const ioDrive = createIODriver({ resolve: ioForeign, registry })
  const normalize = (value) =>
    JSON.stringify(value, (key, item) =>
      key === "invocation" ? "OWNER" : typeof item === "bigint" ? String(item) : item
    )
  let requestTrace = []
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
      requestTrace.push(normalize(step.request))
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
      assert.deepEqual(machine.settle(BigInt(count), raw), chain)
      if (count > 0) assert.equal(machine.settle(BigInt(count - 1), raw).step.failure.$, "Types.MalformedReply")
    }
  })

  const fixtures = [
    ["root.ts", "export interface Child { value: boolean }; export interface Root { child: Child }", "type"],
    ["root.ts", "export function Root(value: string): string { return value }", "function"],
    ["root.bend", "type Child is Data:\n  Child{}\ntype Root is Data:\n  Root{child: Child}", "type"]
  ]
  for (const [path, source, branch] of fixtures) {
    requestTrace = []
    let calls = 0
    const session = createServiceSession({
        invocation: id++,
        root: temp,
        now: () => {
          calls++
          return 0
        },
        frontend: inspectSourceFrontend,
        parseCargo: parseCargoSyntax,
        inspectRustModules: inspectRustModuleSyntax
      }),
      data = input(session, path, source, branch),
      actual = await drive(session, data)
    assert.equal(actual.result.$, "Types.ReviewUnitResult")
    let nativeCalls = 0
    const expected = await Effect.runPromise(
      resolveGraphUnit(path, { text: source, byteLength: Buffer.byteLength(source) }, "Root", {
        root: temp,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        branch,
        now: () => {
          nativeCalls++
          return 0
        }
      })
    )
    assert.equal(JSON.stringify(fromProductValue(actual.result.value)), JSON.stringify(expected))
    assert.equal(calls, nativeCalls)
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
    for (const [label, driver] of [
      ["debug", ioDrive],
      ["product", ioProductDrive]
    ]) {
      const ioTrace = []
      const ioOriginal = createServiceSession({
        invocation: id++,
        root: temp,
        now: () => 0,
        frontend: inspectSourceFrontend,
        parseCargo: parseCargoSyntax,
        inspectRustModules: inspectRustModuleSyntax
      })
      const ioSession = {
        ...ioOriginal,
        perform: (request) => {
          ioTrace.push(normalize(request))
          return ioOriginal.perform(request)
        }
      }
      const ioResult = await driver(ioSession, input(ioSession, path, source, branch))
      assert.deepEqual(ioTrace, requestTrace, path + " exact generic IO requests")
      assert.deepEqual(ioResult.result, actual.result, path + " generic IO terminal result")
      if (label === "debug")
        assert.equal(normalize(ioResult.finalFrame), normalize(actual.finalFrame), path + " generic terminal frame")
    }
  }
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
    [{ invocation: 999n }, "Types.WrongInvocation"],
    [{ id: 99n }, "Types.WrongCorrelation"],
    [{ outcome: tagged("ProductEncoded", { bytes: 1n }) }, "Types.WrongReplyKind"]
  ]) {
    const reply = tagged("Reply", {
      invocation: request.invocation,
      id: request.id,
      outcome: tagged("ClockStarted", { clock: tagged("ClockToken", { invocation: request.invocation, id: 1n }) }),
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
  const ioOriginalError = new Error("IO clock failure"),
    ioThrows = createServiceSession({
      invocation: id++,
      root: temp,
      now: () => {
        throw ioOriginalError
      }
    })
  await assert.rejects(
    ioDrive(ioThrows, input(ioThrows, "root.ts", "interface Root {}")),
    (error) => error === ioOriginalError
  )
  assert.equal(registry.size, 0)
  let releaseFrontend, markFrontend
  const frontendStarted = new Promise((resolve) => {
      markFrontend = resolve
    }),
    lateFrontend = new Promise((resolve) => {
      releaseFrontend = resolve
    }),
    abort = new AbortController()
  let lateCalls = 0
  const lateOriginal = createServiceSession({
      invocation: id++,
      root: temp,
      now: () => 0,
      frontend: () => {
        markFrontend()
        return lateFrontend
      }
    }),
    lateSession = {
      ...lateOriginal,
      perform: (...args) => {
        lateCalls++
        return lateOriginal.perform(...args)
      }
    }
  const lateRun = ioDrive(lateSession, input(lateSession, "root.ts", "interface Root {}"), { signal: abort.signal })
  await frontendStarted
  abort.abort()
  await assert.rejects(lateRun, (error) => error.code === "aborted")
  assert.equal(registry.size, 0)
  const callsBeforeLateReply = lateCalls
  releaseFrontend(undefined)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(lateCalls, callsBeforeLateReply)
  const hostileClock = tagged("Reply", {
    invocation: request.invocation,
    id: request.id,
    outcome: tagged("ClockStarted", { clock: tagged("ClockToken", { invocation: 999n, id: 1n }) })
  })
  assert.equal(
    machine.resume(awaiting, tagged("ServiceReply", { reply: hostileClock })).step.failure.$,
    "Types.WrongInvocation"
  )
  const physicalCancellation = []
  execFileSync("git", ["init", "-q", temp])
  const captureRoot = "import type { A } from './interrupt-a'; export interface Root { a: A }"
  writeFileSync(join(temp, "interrupt-a.ts"), "export interface A {}")
  for (const mode of ["native", "bend-io", "bend-machine"]) {
    const events = [],
      cache = new Map()
    let releaseCapture, markCapture
    const started = new Promise((resolve) => {
        markCapture = resolve
      }),
      late = new Promise((resolve) => {
        releaseCapture = resolve
      }),
      controller = new AbortController()
    const host = {
      root: temp,
      branch: "type",
      policy: DEFAULT_DIRECT_FILE_POLICY,
      captureCache: cache,
      now: () => {
        events.push("clock")
        return 0
      },
      captureSource: (_root, selection) =>
        Effect.ensuring(
          Effect.promise((signal) => {
            events.push("capture:" + selection.relativePath)
            assert.equal(signal.aborted, false)
            markCapture()
            return late.then((value) => {
              events.push("late-provider-completion")
              return value
            })
          }),
          Effect.sync(() => {
            events.push("capture-finalized")
          })
        )
    }
    const candidate =
      mode === "native"
        ? resolveGraphUnit
        : createBendEffectResolver(
            mode === "bend-io" ? { resolveIO: ioProductForeign, registry } : { machine, foreign, registry }
          )
    const pending = Effect.runPromiseExit(
      candidate("root.ts", { text: captureRoot, byteLength: Buffer.byteLength(captureRoot) }, "Root", host),
      { signal: controller.signal }
    )
    await Promise.race([
      started,
      pending.then((exit) => {
        throw new Error(mode + " resolver terminated before pending capture: " + JSON.stringify(exit))
      })
    ])
    controller.abort()
    const exit = await pending
    assert.ok(Exit.hasInterrupts(exit), mode + " outer interruption")
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(events.includes("capture-finalized"), mode + " capture finalizer")
    assert.equal(registry.size, 0, mode + " registry cleanup")
    const prefix = events.slice(),
      cachePrefix = [...cache]
    releaseCapture({ status: "captured", capture: { text: "export interface A {}", byteLength: 21 } })
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(events, [...prefix, "late-provider-completion"], mode + " late provider must not resume resolver")
    assert.deepEqual([...cache], cachePrefix, mode + " late provider must not publish cache writes")
    physicalCancellation.push({
      mode,
      prefix,
      afterLate: events.slice(),
      cache: cachePrefix,
      interrupted: true,
      registryEmpty: true
    })
  }
  const captureDefect = new Error("injected capture defect", { cause: new Error("injected underlying cause") }),
    captureFailures = []
  for (const mode of ["native", "bend-io", "bend-machine"]) {
    const prefix = [],
      cache = new Map(),
      host = {
        root: temp,
        branch: "type",
        policy: DEFAULT_DIRECT_FILE_POLICY,
        captureCache: cache,
        now: () => {
          prefix.push("clock")
          return 0
        },
        captureSource: (_root, selection) =>
          Effect.ensuring(
            Effect.sync(() => {
              prefix.push("capture:" + selection.relativePath)
              throw captureDefect
            }),
            Effect.sync(() => {
              prefix.push("capture-finalized")
            })
          )
      }
    const candidate =
      mode === "native"
        ? resolveGraphUnit
        : createBendEffectResolver(
            mode === "bend-io" ? { resolveIO: ioProductForeign, registry } : { machine, foreign, registry }
          )
    const exit = await Effect.runPromiseExit(
      candidate("root.ts", { text: captureRoot, byteLength: Buffer.byteLength(captureRoot) }, "Root", host)
    )
    assert.ok(Exit.isFailure(exit))
    assert.equal(Cause.squash(exit.cause), captureDefect, mode + " original capture defect identity")
    assert.deepEqual(
      exit.cause.reasons.map((failure) => ({ kind: failure._tag, defect: failure.defect })),
      [{ kind: "Die", defect: captureDefect }],
      mode + " capture Cause preserved"
    )
    assert.equal(registry.size, 0)
    assert.deepEqual([...cache], [])
    captureFailures.push({
      mode,
      prefix,
      originalIdentity: true,
      causeKind: "Die",
      underlyingCausePreserved: Cause.squash(exit.cause).cause === captureDefect.cause,
      registryEmpty: true
    })
  }
  assert.deepEqual(captureFailures[1].prefix, captureFailures[0].prefix)
  assert.deepEqual(captureFailures[2].prefix, captureFailures[0].prefix)
  assert.deepEqual(physicalCancellation[1].prefix, physicalCancellation[0].prefix)
  assert.deepEqual(physicalCancellation[2].prefix, physicalCancellation[0].prefix)
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    actualForeignBendIO: true,
    physicalCancellation,
    captureFailures,
    ioOwnedRuntimeLoop: true,
    productOnlyRuntimeEntry: true,
    debugTerminalStateExact: true,
    exactRuntimeToPureRequestTrace: true,
    ioProviderExceptionIdentity: true,
    lateCancelledFrontendDoesNotResume: true,
    maximumPureChain,
    zeroFuelServiceBoundaryAccepted: true,
    exactClockCaptureCacheDiagnosticEffects: true,
    providerExceptionIdentityBeforeCleanup: true,
    outputTokenInvocationRejected: true,
    rootConsumerFixtures: fixtures.length,
    wholeGraphConsumerOwner: "resident-runtime/preparation/verification/artifact-owned-root-check.mjs",
    exactCaptureCacheAndDiagnosticEffects: true,
    exactOrderedRootEffects: true,
    clockBitCases: numbers.length,
    deadlineBeforeFrontend: true,
    deadlineTransitionRetained: true,
    measuredProductReturned: true,
    wrongOwnerCorrelationKindRejected: true,
    cancellationDistinct: true,
    registryClosed: registry.size === 0,
    scope:
      "standalone generic machine/IO pure-chain, protocol, cancellation and Cause checks; full multilingual graph fixtures belong to resident-owned composition; no whole migration adoption or proof claim"
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
