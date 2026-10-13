import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { createHash } from "node:crypto"
import * as Effect from "effect/Effect"
import { createTimedNativeResolver } from "./verification/native-boundary-timing.mjs"
import { resolveGraphUnit } from "../../../dist/direct-event/graph-resolution/verification/native-graph-resolver.js"
import {
  DEFAULT_DIRECT_FILE_POLICY,
  eligibleNamedPath
} from "../../../../native-observation/dist/direct-event/selection.js"
import { captureStable } from "../../../../native-observation/dist/direct-event/capture.js"
import { discoverPhysicalWorkingTreeRoot } from "../../../../native-observation/dist/repository/root.js"
import { createServiceRegistry } from "./service-session.ts"
import { createCanonicalGraphConsumer } from "./verification/canonical-graph-consumer.mjs"
import { createGraphFixtures } from "./verification/fixtures.mjs"
import { GRAPH_LIMIT_CEILINGS } from "../../../../canonical-policy/dist/canonical/graph-limits.js"

const [lane, mode, goldenPath] = process.argv.slice(2)
assert.ok(["typescript", "wholeBend"].includes(lane))
const temporary = mkdtempSync("/tmp/hapsland-whole-connected-")
const stableCaptureLane = process.env.HAPSLAND_WHOLE_STABLE_CAPTURE === "1"
try {
  const observedProducts = []
  const operationCounts = {}
  const boundaryTimings = {}
  const timingEnabled = Boolean(process.env.HAPSLAND_WHOLE_BOUNDARY_TIMINGS)
  let activeCase
  const recordTiming = (name, elapsed) => {
    const row = (boundaryTimings[name] ??= { calls: 0, milliseconds: 0 })
    row.calls++
    row.milliseconds += elapsed
    if (name === "service:Types.AccessPath" && activeCase) {
      const byCase = (boundaryTimings["access-case:" + activeCase] ??= { calls: 0, milliseconds: 0 })
      byCase.calls++
      byCase.milliseconds += elapsed
    }
  }
  const timedSync = (name, task) => {
    const start = performance.now()
    try {
      return task()
    } finally {
      recordTiming(name, performance.now() - start)
    }
  }
  let resolver, candidateRegistry
  if (lane === "wholeBend") {
    const registry = (candidateRegistry = createServiceRegistry())
    resolver = createCanonicalGraphConsumer({
      registry,
      observeProduct: process.env.HAPSLAND_WHOLE_PRODUCT_VALUES ? (value) => observedProducts.push(value) : undefined,
      timedSync: timingEnabled ? timedSync : undefined,
      timedPromise: (name, task) => {
        if (process.env.HAPSLAND_WHOLE_OPERATION_COUNTS) {
          const operation = name.slice("service:".length)
          operationCounts[operation] = (operationCounts[operation] ?? 0) + 1
        }
        if (!timingEnabled) return task()
        const start = performance.now()
        return task().finally(() => recordTiming(name, performance.now() - start))
      }
    })
  } else if (timingEnabled) {
    const observed = createTimedNativeResolver({
      status: "service:Types.ReadFileStatus",
      access: "service:Types.AccessPath",
      timedPromise: (name, task) => {
        const start = performance.now()
        return task().finally(() => recordTiming(name, performance.now() - start))
      },
      timedEffect: (name, effect) =>
        Effect.suspend(() => {
          const start = performance.now()
          return effect.pipe(Effect.onExit(() => Effect.sync(() => recordTiming(name, performance.now() - start))))
        })
    })
    resolver = (...args) => Effect.runPromise(observed(...args))
  } else resolver = (...args) => Effect.runPromise(resolveGraphUnit(...args))

  const diagnosticFixture = process.env.HAPSLAND_WHOLE_DIAGNOSTIC_FIXTURE
  const declaredFixtures = createGraphFixtures().filter(
    (fixture) =>
      (!stableCaptureLane || !fixture.unavailable) && (!diagnosticFixture || fixture.name === diagnosticFixture)
  )
  if (diagnosticFixture) assert.equal(declaredFixtures.length, 1)
  if (stableCaptureLane)
    declaredFixtures.push(
      {
        name: "physical-root-identity-mismatch",
        files: { "a.ts": "export interface A {}" },
        physicalFailure: "identity"
      },
      { name: "physical-between-reads-change", files: { "a.ts": "export interface A {}" }, physicalFailure: "changed" }
    )
  const fixtures = declaredFixtures.map((fixture) => {
    const root = join(temporary, fixture.name)
    mkdirSync(root)
    execFileSync("git", ["init", "-q", root])
    const path = fixture.path ?? "root.ts",
      source =
        fixture.source ??
        "import type { A } from '" + (fixture.importPath ?? "./a") + "'; export interface Root { a: A }"
    const sources = new Map([[path, source], ...Object.entries(fixture.files)])
    for (const [path, text] of sources) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    for (const directory of fixture.directories ?? []) mkdirSync(join(root, directory), { recursive: true })
    return { ...fixture, root, path, sources }
  })
  if (stableCaptureLane)
    for (const fixture of fixtures) {
      fixture.rootIdentity = (await Effect.runPromise(discoverPhysicalWorkingTreeRoot(fixture.root))).rootIdentity
      const selected = await Effect.runPromise(
        eligibleNamedPath(
          fixture.root,
          fixture.path,
          fixture.policy ?? DEFAULT_DIRECT_FILE_POLICY,
          fixture.rootIdentity
        )
      )
      assert.ok(selected, fixture.name + " root selection")
      const captured = await Effect.runPromise(captureStable(fixture.root, selected, {}, fixture.rootIdentity))
      assert.equal(captured.status, "captured", fixture.name + " root capture")
      fixture.rootCapture = captured.capture
      if (fixture.physicalFailure === "identity")
        fixture.rootIdentity = {
          ...fixture.rootIdentity,
          rootInode: String(BigInt(fixture.rootIdentity.rootInode) + 1n)
        }
    }
  const errorShape = (error) => ({
    name: error.name,
    message: error.message,
    ...(error.cause ? { cause: errorShape(error.cause) } : {})
  })
  const caseTimings = []
  let collectCaseTiming = false
  async function sweep(selectedResolver = resolver) {
    const outputs = []
    for (const fixture of fixtures) {
      activeCase = fixture.name
      const caseStarted = collectCaseTiming ? performance.now() : 0
      const events = [],
        cache = fixture.cache === undefined ? undefined : new Map(fixture.cache)
      if (fixture.physicalFailure === "changed") writeFileSync(join(fixture.root, "a.ts"), fixture.sources.get("a.ts"))
      let ticks = 0
      const stable = (path) => {
        const text = fixture.sources.get(path),
          bytes = Buffer.from(text)
        return {
          text,
          bytes,
          byteLength: bytes.length,
          contentHash: createHash("sha256").update(bytes).digest("hex"),
          metadata: "fixture:" + path
        }
      }
      const context = {
        root: fixture.root,
        rootIdentity: fixture.rootIdentity,
        policy: fixture.policy ?? DEFAULT_DIRECT_FILE_POLICY,
        branch: fixture.branch ?? "type",
        limits: { ...GRAPH_LIMIT_CEILINGS, ...fixture.limits },
        captureCache: cache,
        captureHooks: stableCaptureLane
          ? {
              sourceRead: (path) => events.push(["source-read", path]),
              ...(fixture.physicalFailure === "changed"
                ? {
                    betweenReads: () =>
                      Effect.sync(() =>
                        writeFileSync(
                          join(fixture.root, "a.ts"),
                          fixture.sources.get("a.ts") + "\n// changed between reads"
                        )
                      )
                  }
                : {})
            }
          : undefined,
        now: () => {
          const count = ticks++
          events.push(["clock", count])
          return count >= (fixture.expireAt ?? Infinity) ? 5000 : 0
        },
        captureSource: (_root, selected, hooks, identity, sourceCap) => {
          events.push(["capture", selected.relativePath])
          return stableCaptureLane
            ? captureStable(_root, selected, hooks, identity, sourceCap)
            : Effect.succeed(
                fixture.unavailable
                  ? { status: "unavailable", diagnostic: { stage: "capture", code: "fixture-unavailable", args: {} } }
                  : { status: "captured", capture: stable(selected.relativePath) }
              )
        },
        observeCaptureDiagnostic: (path, value) => events.push(["diagnostic", path, value])
      }
      let unit, error
      try {
        unit = await selectedResolver(fixture.path, fixture.rootCapture ?? stable(fixture.path), "Root", context)
      } catch (failure) {
        error = errorShape(failure)
      }
      if (fixture.requireUnit) assert.ok(unit, fixture.name + " must return a ReviewUnit")
      if (fixture.requiredExpanded) {
        assert.ok(unit)
        const expanded = []
        const visit = (node) => {
          for (const ref of node.references)
            if (ref.kind === "expanded") {
              expanded.push(ref.node.artifact.name)
              visit(ref.node)
            }
        }
        visit(unit.root)
        for (const name of fixture.requiredExpanded)
          assert.ok(expanded.includes(name), fixture.name + " must expand " + name)
      }
      if (fixture.physicalFailure) {
        assert.ok(unit)
        assert.ok(
          unit.root.references.every((ref) => ref.kind !== "expanded"),
          fixture.name + " must refuse captured child"
        )
        assert.ok(
          events.some(
            (event) =>
              event[0] === "diagnostic" &&
              event[2].code ===
                (fixture.physicalFailure === "identity" ? "capture-validation-failed" : "capture-unstable")
          ),
          fixture.name + " must retain capture diagnostic"
        )
      }
      outputs.push({
        name: fixture.name,
        unit: unit ?? null,
        error: error ?? null,
        events,
        cache: cache ? [...cache] : null
      })
      if (collectCaseTiming) caseTimings.push({ name: fixture.name, seconds: (performance.now() - caseStarted) / 1000 })
      activeCase = undefined
    }
    return outputs
  }
  if (mode === "prepare") {
    assert.equal(lane, "typescript")
    writeFileSync(goldenPath, JSON.stringify(await sweep()))
  } else {
    // Physical capture metadata contains inode/time identity. Compare both
    // consumers on the same files, retaining those bytes rather than normalizing
    // them away across independently-created worker directories.
    const golden = stableCaptureLane
      ? JSON.stringify(await sweep((...args) => Effect.runPromise(resolveGraphUnit(...args))))
      : readFileSync(goldenPath, "utf8")
    const warmup = await sweep(),
      expected = JSON.parse(golden)
    for (let index = 0; index < expected.length; index++) {
      if (JSON.stringify(warmup[index]) !== JSON.stringify(expected[index])) {
        const keys = Object.keys(expected[index]).filter(
          (key) => JSON.stringify(warmup[index][key]) !== JSON.stringify(expected[index][key])
        )
        throw new Error(
          JSON.stringify({
            case: expected[index].name,
            keys,
            expected: Object.fromEntries(keys.map((key) => [key, expected[index][key]])),
            actual: Object.fromEntries(keys.map((key) => [key, warmup[index][key]]))
          })
        )
      }
    }
    let profiler
    if (process.env.HAPSLAND_WHOLE_PROFILE) {
      const { Session } = await import("node:inspector")
      profiler = new Session()
      profiler.connect()
      await new Promise((resolve, reject) =>
        profiler.post("Profiler.enable", (error) => (error ? reject(error) : resolve()))
      )
      await new Promise((resolve, reject) =>
        profiler.post("Profiler.start", (error) => (error ? reject(error) : resolve()))
      )
    }
    collectCaseTiming = Boolean(profiler || process.env.HAPSLAND_WHOLE_CASE_TIMINGS)
    for (const key of Object.keys(operationCounts)) delete operationCounts[key]
    for (const key of Object.keys(boundaryTimings)) delete boundaryTimings[key]
    const diagnosticRounds = Number(process.env.HAPSLAND_WHOLE_DIAGNOSTIC_ROUNDS ?? 200)
    assert.ok(Number.isSafeInteger(diagnosticRounds) && diagnosticRounds >= 1 && diagnosticRounds <= 200)
    const rounds =
        diagnosticFixture || process.env.HAPSLAND_WHOLE_DIAGNOSTIC_ROUNDS
          ? diagnosticRounds
          : collectCaseTiming
            ? 12
            : 3,
      cpuBefore = process.cpuUsage(),
      before = performance.now(),
      outputs = []
    for (let round = 0; round < rounds; round++) outputs.push(await sweep())
    const seconds = (performance.now() - before) / 1000
    const cpu = process.cpuUsage(cpuBefore),
      cpuSeconds = (cpu.user + cpu.system) / 1e6
    if (profiler) {
      const { profile } = await new Promise((resolve, reject) =>
        profiler.post("Profiler.stop", (error, value) => (error ? reject(error) : resolve(value)))
      )
      profiler.disconnect()
      writeFileSync(process.env.HAPSLAND_WHOLE_PROFILE, JSON.stringify(profile))
      writeFileSync(process.env.HAPSLAND_WHOLE_PROFILE + ".cases.json", JSON.stringify(caseTimings))
    }
    if (process.env.HAPSLAND_WHOLE_CASE_TIMINGS)
      writeFileSync(process.env.HAPSLAND_WHOLE_CASE_TIMINGS, JSON.stringify(caseTimings))
    for (const output of outputs) assert.equal(JSON.stringify(output), golden, "measured complete result/effects")
    const checksum = createHash("sha256").update(golden).digest("hex")
    if (candidateRegistry !== undefined)
      assert.equal(candidateRegistry.size, 0, "actual Canonical Graph registry settled")
    const record = {
      shell: lane === "wholeBend" ? "canonical-graph-consumer" : "nested-run-promise",
      lane,
      seconds,
      cpuSeconds,
      cases: fixtures.length,
      rounds,
      allResultsAndEffectsEqual: true,
      checksum
    }
    if (process.env.HAPSLAND_WHOLE_OPERATION_COUNTS) {
      record.operationCounts = operationCounts
      writeFileSync(process.env.HAPSLAND_WHOLE_OPERATION_COUNTS, JSON.stringify(operationCounts))
    }
    if (timingEnabled) {
      record.boundaryTimings = boundaryTimings
      record.boundaryTimingScope =
        "Diagnostic only: packaged Graph machine initial/view/resume and native IO/fact ports; service wall includes asynchronous provider work. Canonical owns candidate lifecycle and terminal acceptance. Generated ABI conversion and private internal spans are not separately measured."
      writeFileSync(process.env.HAPSLAND_WHOLE_BOUNDARY_TIMINGS, JSON.stringify(record, null, 2))
    }
    if (process.env.HAPSLAND_WHOLE_CASE_TIMINGS)
      record.profileMeasurementWindow = {
        startTime: (performance.timeOrigin + before) * 1000,
        endTime: (performance.timeOrigin + before + seconds * 1000) * 1000,
        unit: "epoch microseconds",
        scope: "Only the measured repeated sweeps; excludes setup, compilation/import and warmup"
      }
    if (stableCaptureLane) {
      Object.assign(record, {
        at: new Date().toISOString(),
        runtime: typeof Bun === "undefined" ? "node" : "bun",
        actualStableCapture: true,
        productChecksum: createHash("sha256")
          .update(JSON.stringify(expected.map(({ name, unit, error }) => ({ name, unit, error }))))
          .digest("hex"),
        physicalRootIdentity: true,
        nativeReferenceSamePhysicalFiles: true,
        fullCaptureCacheMetadataCompared: true,
        sourceReadEffectsCompared: true,
        physicalFailureCases: fixtures.filter((fixture) => fixture.physicalFailure).map((fixture) => fixture.name),
        ...(candidateRegistry === undefined ? {} : { registryClosed: true }),
        scope:
          "Unadopted whole resolver on actual stable filesystem capture; full result/error/clock/capture/source-read/cache/diagnostic comparison against native on same physical files, one warmup and " +
          rounds +
          " repeated sweeps; explicit root-identity mismatch and between-read source change refuse publication. Linux only; cancellation, descriptor-count leak audit, Windows/macOS, whole universal laws and performance parity not established."
      })
      const evidence = new URL("../../../../../../.test-runs/bend-migration/diagnostics/", import.meta.url)
      mkdirSync(evidence, { recursive: true })
      writeFileSync(
        new URL("stable-capture-" + record.runtime + "-evidence.json", evidence),
        JSON.stringify(record, null, 2) + "\n"
      )
    }
    if (process.env.HAPSLAND_WHOLE_PRODUCT_VALUES)
      writeFileSync(
        process.env.HAPSLAND_WHOLE_PRODUCT_VALUES,
        JSON.stringify(observedProducts, (_, value) => (typeof value === "bigint" ? Number(value) : value))
      )
    console.log(JSON.stringify(record))
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
