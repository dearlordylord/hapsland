import {
  performGraphServiceEffect,
  createGraphServiceRegistry as createServiceRegistry,
  createBendEffectResolver,
  createBendResolver
} from "@hapsland/source-analysis/direct-event/graph-resolution"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, writeFile, lstat, rm, readdir, readlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { deserialize } from "node:v8"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { resolveGraphUnit } from "@hapsland/source-analysis/testing/native-graph"
import { eligibleNamedPath, DEFAULT_DIRECT_FILE_POLICY } from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { readNat } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { createArtifactMachine } from "../artifact-dispatcher.mjs"
import { createGraphDriver } from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
if (!process.env.HAPSLAND_GRAPH_FIXTURE_FACTS)
  throw new TypeError(
    "Run this consumer through scripts/run-bend-capability-check.mjs to supply owned graph fixture facts"
  )
const graphFixtures = deserialize(Buffer.from(process.env.HAPSLAND_GRAPH_FIXTURE_FACTS, "base64"))
assert.ok(Array.isArray(graphFixtures) && graphFixtures.length > 0)
assert.equal(graphFixtures.length, 58, "retain every original graph fixture")
assert.equal(new Set(graphFixtures.map((fixture) => fixture.name)).size, graphFixtures.length)
for (const name of [
  "go-root-type",
  "go-import-local-module",
  "python-preparation-deadline",
  "large-local-reuse",
  "capture-unavailable"
])
  assert.ok(
    graphFixtures.some((fixture) => fixture.name === name),
    "required whole graph fixture " + name
  )
const temp = await mkdtemp("/tmp/hapsland-owned-root-")
let emissionTemp
try {
  emissionTemp = await mkdtemp(join(existsSync("/dev/shm") ? "/dev/shm" : "/tmp", "hapsland-owned-emission-"))
  const artifacts = {}
  let owner
  for (const [key, name] of [
    ["composition", "GraphCompositionEntry"],
    ["parent", "GenericGraphEntry"],
    ["python", "PythonGraphEntry"],
    ["go", "GoGraphEntry"],
    ["owner", "CanonicalResolverOwner"]
  ]) {
    const emitted = join(emissionTemp, name + ".mjs")
    execFileSync(
      "taskset",
      [
        "-c",
        "10",
        "bend",
        new URL(
          {
            GraphCompositionEntry: "../../GraphCompositionEntry.bend",
            GenericGraphEntry: "../../GenericGraphEntry.bend",
            PythonGraphEntry: "../../PythonGraphEntry.bend",
            GoGraphEntry: "../../GoGraphEntry.bend",
            CanonicalResolverOwner:
              "../../../../../../agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend"
          }[name],
          import.meta.url
        ).pathname,
        "-o",
        emitted
      ],
      { timeout: 10000 }
    )
    const loaded = (await import(pathToFileURL(emitted))).default
    if (key === "owner") owner = loaded
    else artifacts[key] = loaded
  }
  const root = join(temp, "fixture")
  await mkdir(root)
  execFileSync("git", ["init", "-q", root], { timeout: 5000 })
  await writeFile(
    join(root, "root.py"),
    "from leaf import Foo\nclass Root:\n first: Foo\nclass Second:\n second: Foo\n"
  )
  await writeFile(join(root, "leaf.py"), "class Foo:\n value: str\n")
  const a = await lstat(root),
    b = await lstat(join(root, ".git"))
  const rootIdentity = {
    rootDevice: String(a.dev),
    rootInode: String(a.ino),
    gitDirectory: join(root, ".git"),
    gitDevice: String(b.dev),
    gitInode: String(b.ino)
  }
  const selection = await Effect.runPromise(
      eligibleNamedPath(root, "root.py", DEFAULT_DIRECT_FILE_POLICY, rootIdentity)
    ),
    captured = await Effect.runPromise(captureStable(root, selection, {}, rootIdentity))
  assert.equal(captured.status, "captured")
  const c = (name, fields = {}) => ({ $: "../Canonical." + name, ...fields }),
    scope = { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n }
  const initial = () => {
    let state = owner.initial_limits(100n, 100000000n, 100n, 100000000n)
    for (const event of [
      c("OpenRound", { partition: 1n, lifetime: 1n }),
      c("AdmitObservation", { partition: 1n, lifetime: 1n, round: 1n }),
      c("StartObservation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n }),
      c("BeginObservedPreparation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n, bytes: 1000n })
    ]) {
      const step = owner.canonical_event(state, event)
      assert.equal(step.$, "Advanced")
      state = step.state
    }
    return state
  }
  let cases = 0,
    totalRequests = 0
  const abandoned = createGraphDriver({
    owner,
    initialState: initial(),
    scope,
    machine: createArtifactMachine({ ...artifacts, retainPrefixes: false }),
    registry: createServiceRegistry(),
    foreign: () => {
      throw new Error("unexpected provider")
    }
  })
  const allocated = abandoned.allocateInvocation()
  abandoned.cancel(allocated)
  assert.deepEqual(abandoned.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
  cases++
  const overflow = createGraphDriver({
    owner,
    initialState: { ...initial(), next_invocation: 2n ** 53n },
    scope,
    machine: createArtifactMachine({ ...artifacts, retainPrefixes: false }),
    registry: createServiceRegistry(),
    foreign: () => {
      throw new Error("unexpected provider")
    }
  })
  assert.throws(() => overflow.allocateInvocation(), RangeError)
  assert.deepEqual(overflow.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
  cases++
  await writeFile(join(root, "go.mod"), "module example\n")
  await mkdir(join(root, "lib"))
  await writeFile(join(root, "root.go"), 'package p\nimport "example/lib"\ntype Root lib.Foo\ntype Second lib.Foo\n')
  await writeFile(join(root, "lib/leaf.go"), "package lib\ntype Foo struct { Value string }\n")
  const goSelection = await Effect.runPromise(
    eligibleNamedPath(root, "root.go", DEFAULT_DIRECT_FILE_POLICY, rootIdentity)
  )
  const goCaptured = await Effect.runPromise(captureStable(root, goSelection, {}, rootIdentity))
  assert.equal(goCaptured.status, "captured")
  for (const [fixturePath, fixtureCapture, configuration] of [
    ["root.py", captured.capture],
    ["root.go", goCaptured.capture],
    ["root.go", goCaptured.capture, { goos: "linux", goarch: "amd64", tags: ["custom"] }]
  ]) {
    for (const mode of [
      "unit-budget",
      "two-roots",
      "cancel-provider",
      "cancel-inflight",
      "cancel-inflight-success",
      "retire-provider",
      "late-rejection",
      "cancel-before-install",
      "cancel-before-terminal",
      "resume-throws",
      "completion-hook-throws",
      "construction-throws",
      "external-abort",
      "between-roots"
    ]) {
      const registry = createServiceRegistry()
      let triggered = false,
        requests = 0,
        beforeCancelResumes,
        captureSuccesses = 0
      const hooks = {},
        controller = new AbortController()
      if (["cancel-provider", "retire-provider", "late-rejection"].includes(mode))
        hooks.beforeProvider = ({ invocation, driver }) => {
          if (triggered) return
          triggered = true
          if (mode === "retire-provider")
            driver.canonicalEvent(c("RetirePartition", { partition: 1n, lifetime: 1n, round: 1n }))
          else driver.cancel(invocation)
        }
      if (mode === "completion-hook-throws")
        hooks.beforeCompletion = () => {
          throw new Error("injected completion fault")
        }
      if (mode === "external-abort") hooks.beforeProvider = () => controller.abort()
      if (mode === "cancel-before-install")
        hooks.beforeInstall = ({ invocation, generation, driver }) => {
          if (generation === 0n || triggered) return
          triggered = true
          driver.cancel(invocation)
        }
      if (mode === "cancel-before-terminal")
        hooks.beforeTerminal = ({ invocation, driver }) => {
          if (triggered) return
          triggered = true
          driver.cancel(invocation)
        }
      const wrapped =
        mode === "resume-throws"
          ? {
              ...artifacts,
              composition: {
                ...artifacts.composition,
                resume() {
                  throw new Error("injected artifact fault")
                }
              }
            }
          : artifacts
      const driver = createGraphDriver({
        owner,
        initialState: initial(),
        scope,
        machine: createArtifactMachine({ ...wrapped, retainPrefixes: false }),
        registry,
        hooks,
        foreign: async ([request], options) => {
          requests++
          if (
            ["cancel-inflight", "cancel-inflight-success"].includes(mode) &&
            !triggered &&
            request.operation.$ === "Types.CaptureSource"
          ) {
            const pending = registry.perform(
              request,
              mode === "cancel-inflight-success" ? { ...options, signal: undefined } : options
            )
            triggered = true
            beforeCancelResumes = driver.stats.resumes
            driver.cancel(request.invocation)
            return await pending
          }
          if (mode === "late-rejection") throw new Error("injected late provider rejection")
          return await registry.perform(request, options)
        }
      })
      const resolver = createBendResolver({
        registry,
        drive: driver.drive,
        allocateInvocation: driver.allocateInvocation,
        onConstructionFailure: driver.constructionFailed
      })
      const context = {
        root,
        rootIdentity,
        policy: DEFAULT_DIRECT_FILE_POLICY,
        branch: "type",
        ...(configuration === undefined
          ? {}
          : { analysisConfiguration: { go: configuration }, analysisConfigurationIdentity: "configured-go" }),
        limits: GRAPH_LIMIT_CEILINGS,
        now: () => 0,
        captureCache: new Map(),
        captureSource: (...args) =>
          captureStable(...args).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                if (result.status === "captured") captureSuccesses++
              })
            )
          )
      }
      if (mode === "unit-budget") {
        const full = await Effect.runPromise(
          resolveGraphUnit(fixturePath, fixtureCapture, "Root", { ...context, captureCache: new Map() })
        )
        assert.ok(full)
        const bytes = Buffer.byteLength(JSON.stringify(full))
        for (const treeBytes of [bytes - 1, bytes, bytes + 1]) {
          const bounded = { ...context, limits: { ...context.limits, treeBytes }, captureCache: new Map() }
          const expected = await Effect.runPromise(
            resolveGraphUnit(fixturePath, fixtureCapture, "Root", { ...bounded, captureCache: new Map() })
          )
          assert.deepEqual(
            await resolver(fixturePath, fixtureCapture, "Root", bounded),
            expected,
            fixturePath + " treeBytes=" + treeBytes
          )
        }
      } else if (mode === "construction-throws") {
        await assert.rejects(
          resolver(fixturePath, { ...fixtureCapture, byteLength: undefined }, "Root", context),
          TypeError
        )
      } else if (mode === "two-roots" || mode === "between-roots") {
        const expected = await Effect.runPromise(
          resolveGraphUnit(fixturePath, fixtureCapture, "Root", { ...context, captureCache: new Map() })
        )
        assert.deepEqual(await resolver(fixturePath, fixtureCapture, "Root", context), expected)
        if (mode === "between-roots") {
          driver.canonicalEvent(c("InterruptPreparation", { partition: 1n, lifetime: 1n, round: 1n, operation: 2n }))
          await assert.rejects(resolver(fixturePath, fixtureCapture, "Second", context), /NotPreparing/)
        } else {
          const second = await Effect.runPromise(
            resolveGraphUnit(fixturePath, fixtureCapture, "Second", { ...context, captureCache: new Map() })
          )
          assert.deepEqual(await resolver(fixturePath, fixtureCapture, "Second", context), second)
          driver.canonicalEvent(
            c("PreparationCompleted", {
              partition: 1n,
              lifetime: 1n,
              round: 1n,
              operation: 2n,
              unit_bytes: { $: "Con", head: 100n, tail: { $: "Con", head: 100n, tail: { $: "Nil" } } }
            })
          )
          assert.equal(driver.stats.accepted, 2)
          assert.equal(driver.stats.launches, 2)
          assert.equal(owner.live(driver.state.canonical, scope), false)
        }
      } else {
        await assert.rejects(
          resolver(fixturePath, fixtureCapture, "Root", context, { signal: controller.signal }),
          mode === "completion-hook-throws"
            ? /injected completion fault/
            : mode === "resume-throws"
              ? /injected artifact fault/
              : mode === "cancel-before-install"
                ? /WrongGeneration/
                : mode === "cancel-before-terminal"
                  ? /WrongPhase/
                  : /InvocationCancelled/
        )
        assert.equal(driver.stats.accepted, 0)
        if (["cancel-provider", "retire-provider", "late-rejection"].includes(mode))
          assert.equal(driver.stats.resumes, 0)
        if (["cancel-inflight", "cancel-inflight-success"].includes(mode)) {
          assert.equal(triggered, true)
          assert.equal(driver.stats.resumes, beforeCancelResumes)
        }
        if (mode === "cancel-inflight-success")
          assert.ok(captureSuccesses > 0, "physical late capture succeeds while session registration is revoked")
      }
      assert.deepEqual(
        driver.resources,
        { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 },
        mode + " cleanup"
      )
      assert.equal(registry.size, 0)
      const rootFds = await Promise.all(
        (await readdir("/proc/self/fd")).map((fd) => readlink("/proc/self/fd/" + fd).catch(() => ""))
      )
      assert.equal(
        rootFds.filter((path) => path === root || path.startsWith(root + "/")).length,
        0,
        mode + " physical root-owned descriptors"
      )
      assert.equal(driver.stats.providerStarts, driver.stats.providerCleanups, mode + " provider lease cleanup")
      totalRequests += requests
      cases++
    }
  }
  for (const [fixturePath, fixtureCapture, branch] of [
    ["root.go", goCaptured.capture, "function"],
    ["root.py", captured.capture, "type"]
  ]) {
    const registry = createServiceRegistry()
    const driver = createGraphDriver({
      owner,
      initialState: initial(),
      scope,
      machine: createArtifactMachine({ ...artifacts, retainPrefixes: false }),
      registry,
      foreign: async ([request], options) => await registry.perform(request, options)
    })
    const resolver = createBendResolver({
      registry,
      drive: driver.drive,
      allocateInvocation: driver.allocateInvocation,
      onConstructionFailure: driver.constructionFailed
    })
    const context = {
      root,
      rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY,
      branch,
      limits: GRAPH_LIMIT_CEILINGS,
      now: () => 0,
      captureCache: new Map()
    }
    for (const name of ["analysisConfiguration", "analysisConfigurationIdentity"])
      Object.defineProperty(context, name, {
        get() {
          throw new Error("unused configuration observed: " + name)
        }
      })
    const expected = await Effect.runPromise(resolveGraphUnit(fixturePath, fixtureCapture, "Root", context))
    context.captureCache = new Map()
    assert.deepEqual(
      await resolver(fixturePath, fixtureCapture, "Root", context),
      expected,
      fixturePath + " lazy configuration priority"
    )
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assert.equal(registry.size, 0)
    cases++
  }
  const finalDeadlineFixture = {
    ...graphFixtures.find((fixture) => fixture.name === "bend-unsupported-relative-import"),
    name: "bend-final-publication-deadline",
    expireAt: 3
  }
  for (const fixture of [...graphFixtures, finalDeadlineFixture]) {
    console.log(JSON.stringify({ graphFixture: fixture.name }))
    const fixtureRoot = join(temp, "whole-" + fixture.name)
    await mkdir(fixtureRoot)
    execFileSync("git", ["init", "-q", fixtureRoot], { timeout: 5000 })
    const path = fixture.path ?? "root.ts"
    const source =
      fixture.source ?? "import type { A } from '" + (fixture.importPath ?? "./a") + "'; export interface Root { a: A }"
    const sources = new Map([[path, source], ...Object.entries(fixture.files)])
    for (const [file, text] of sources) {
      await mkdir(dirname(join(fixtureRoot, file)), { recursive: true })
      await writeFile(join(fixtureRoot, file), text)
    }
    for (const directory of fixture.directories ?? []) await mkdir(join(fixtureRoot, directory), { recursive: true })
    const stable = (file) => {
      const text = sources.get(file)
      const bytes = Buffer.from(text)
      return {
        text,
        bytes,
        byteLength: bytes.length,
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        metadata: "fixture:" + file
      }
    }
    const nativeEvents = [],
      bendEvents = []
    const nativeCache = fixture.cache === undefined ? undefined : new Map(fixture.cache)
    const bendCache = fixture.cache === undefined ? undefined : new Map(fixture.cache)
    const contextFor = (events, cache) => {
      let ticks = 0
      return {
        root: fixtureRoot,
        policy: fixture.policy ?? DEFAULT_DIRECT_FILE_POLICY,
        branch: fixture.branch ?? "type",
        limits: { ...GRAPH_LIMIT_CEILINGS, ...fixture.limits },
        captureCache: cache,
        now: () => {
          const tick = ticks++
          events.push(["clock", tick])
          return tick >= (fixture.expireAt ?? Infinity) ? 5000 : 0
        },
        captureSource: (_root, selected) => {
          events.push(["capture", selected.relativePath])
          return Effect.succeed(
            fixture.unavailable
              ? { status: "unavailable", diagnostic: { stage: "capture", code: "fixture-unavailable", args: {} } }
              : { status: "captured", capture: stable(selected.relativePath) }
          )
        },
        observeCaptureDiagnostic: (file, value) => events.push(["diagnostic", file, value])
      }
    }
    let expected, nativeError, actual, bendError
    const operationTrace = []
    const ownedTranscript = [],
      directTranscript = []
    let ownedTerminal, directTerminal
    const ownedMachine = createArtifactMachine({ ...artifacts, retainPrefixes: false })
    const ownedView = ownedMachine.view
    ownedMachine.view = (step) => {
      const terminal = ownedView(step)
      if (terminal.$ !== "Types.AwaitService") ownedTerminal = structuredClone(terminal)
      return terminal
    }
    try {
      expected = await Effect.runPromise(
        resolveGraphUnit(path, stable(path), "Root", contextFor(nativeEvents, nativeCache))
      )
    } catch (error) {
      nativeError = error
    }
    const registry = createServiceRegistry()
    const driver = createGraphDriver({
      owner,
      initialState: initial(),
      scope,
      machine: ownedMachine,
      registry,
      foreign: () => {
        throw new TypeError("Expected Graph Effect service")
      },
      foreignSync: ([request], options) => {
        totalRequests++
        ownedTranscript.push({ request: structuredClone(request) })
        operationTrace.push(request.operation.$)
        if (request.operation.$ === "Types.HashJsonProduct") {
          const checkText = (value, at = "value") => {
            if (!value || typeof value !== "object") return
            if (value.$?.endsWith("Value.ProductText"))
              assert.equal(typeof value.value, "string", fixture.name + " invalid ProductText at " + at)
            for (const [key, child] of Object.entries(value)) if (key !== "$") checkText(child, at + "." + key)
          }
          checkText(request.operation.value)
        }
        const session = registry.get(Number(request.invocation))
        if (!session) throw new TypeError("Unknown graph service invocation")
        return {
          effect: performGraphServiceEffect(session, request, options),
          map(reply) {
            ownedTranscript.push({ reply: structuredClone(reply) })
            return reply
          }
        }
      }
    })
    const resolver = createBendEffectResolver({
      drive: driver.driveEffect,
      allocateInvocation: driver.allocateInvocation,
      onConstructionFailure: driver.constructionFailed
    })
    try {
      actual = await Effect.runPromise(resolver(path, stable(path), "Root", contextFor(bendEvents, bendCache)))
    } catch (error) {
      bendError = error
    }
    if (fixture.technicalFailure) {
      assert.ok(nativeError && bendError, fixture.name + " must retain its technical failure")
      const shape = (error) => ({
        name: error.name,
        message: error.message,
        cause: { name: error.cause.name, message: error.cause.message }
      })
      assert.deepEqual(shape(bendError), shape(nativeError), fixture.name)
    } else {
      assert.ifError(nativeError)
      assert.ifError(bendError)
      assert.deepEqual(actual, expected, fixture.name + " whole ReviewUnit")
      if (fixture.requireUnit) {
        assert.ok(actual, fixture.name + " must return a ReviewUnit")
        if (fixture.name === "large-local-reuse" || fixture.name === "large-import-diamond-cycle")
          assert.equal(actual.root.references.length, fixture.name === "large-local-reuse" ? 12 : 6)
        const visit = (node) => {
          for (const reference of node.references) {
            assert.notEqual(reference.kind, "omitted", fixture.name + " must complete without omissions")
            if (reference.kind === "expanded") visit(reference.node)
          }
        }
        visit(actual.root)
      }
      if (fixture.requiredExpanded) {
        const expanded = []
        const visit = (node) => {
          for (const ref of node.references)
            if (ref.kind === "expanded") {
              expanded.push(ref.node.artifact.name)
              visit(ref.node)
            }
        }
        assert.ok(actual, fixture.name)
        visit(actual.root)
        for (const name of fixture.requiredExpanded)
          assert.ok(expanded.includes(name), fixture.name + " must expand " + name)
      }
      if (fixture.name === "rust-unicode-multiple-roles")
        assert.deepEqual(actual.sourceDependencies, ["Cargo.toml", "src/\u{10000}.rs", "src/\ue000.rs"])
      if (fixture.name === "tree-refusal")
        assert.equal(operationTrace.filter((operation) => operation === "Types.EncodeProduct").length, 4)
    }
    const directEvents = []
    const directCache = fixture.cache === undefined ? undefined : new Map(fixture.cache)
    const directRegistry = createServiceRegistry()
    const directMachine = createArtifactMachine({ ...artifacts, retainPrefixes: false })
    const directResolver = createBendResolver({
      allocateInvocation: () => 1,
      onConstructionFailure: () => {},
      drive: (session, input, options) =>
        directRegistry.run(session, async () => {
          try {
            let state = directMachine.initial(input)
            for (;;) {
              const step = directMachine.view(state)
              if (step.$ !== "Types.AwaitService") {
                directTerminal = step
                if (step.$ === "Types.FinishedResolver") return { result: step.result, finalFrame: step.final_frame }
                assert.equal(step.$, "Types.FailedResolver")
                if (step.failure.$ === "Types.ForeignProviderFailure" || step.failure.$ === "Types.RuntimeFailure")
                  throw session.exception(step.failure.exception)
                if (step.failure.$ === "Types.NegativeGraphWork") readNat(-Number(step.failure.magnitude))
                return { failure: step.failure }
              }
              directTranscript.push({ request: structuredClone(step.request) })
              const reply = await directRegistry.perform(step.request, options)
              directTranscript.push({ reply: structuredClone(reply) })
              state = directMachine.resume(state, { $: "Types.ServiceReply", reply })
            }
          } finally {
            directMachine.disposeInvocation(input.invocation)
          }
        })
    })
    let directResult, directError
    try {
      directResult = await directResolver(path, stable(path), "Root", contextFor(directEvents, directCache))
    } catch (error) {
      directError = error
    }
    assert.deepEqual(directTranscript, ownedTranscript, fixture.name + " complete request/reply IO stream")
    assert.deepEqual(directTerminal, ownedTerminal, fixture.name + " accepted full terminal projection")
    assert.deepEqual(directResult, actual, fixture.name + " IO terminal result")
    assert.equal(directError?.message, bendError?.message, fixture.name + " IO error")
    assert.deepEqual(directEvents, bendEvents, fixture.name + " IO effects")
    if (bendCache) assert.deepEqual([...directCache], [...bendCache], fixture.name + " IO cache")
    assert.equal(directMachine.retainedHandles, 0, fixture.name + " IO artifact cleanup")
    assert.equal(directRegistry.size, 0, fixture.name + " IO registry cleanup")
    assert.equal(driver.stats.accepted, 1, fixture.name + " single Canonical terminal acceptance")
    assert.deepEqual(bendEvents, nativeEvents, fixture.name + " effect sequence")
    if (nativeCache) assert.deepEqual([...bendCache], [...nativeCache], fixture.name + " caller cache")
    assert.deepEqual(
      driver.resources,
      { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 },
      fixture.name
    )
    assert.equal(registry.size, 0, fixture.name)
    assert.equal(driver.stats.providerStarts, driver.stats.providerCleanups, fixture.name)
    cases++
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests: totalRequests,
      graphConsumerFixtures: graphFixtures.length,
      finalPublicationDeadlineCases: 1,
      completeRequestReplyAndAcceptedTerminalComparisons: graphFixtures.length + 1,
      scope:
        "actual Canonical admission/Prepare + split resolver children with physical native service/session, two roots under one preparation, cancellation/retirement/late rejection/provisional refusal/throw cleanup; all 58 original graph fixture facts compare full native results/effects/cache/errors; complete request/reply IO and accepted full terminal compare Canonical-owned execution with the existing dispatcher verification loop; standalone generic pure-chain/Cause qualification, real resident preparation progression/retention/revision and universal proofs remain open"
    })
  )
} finally {
  await Promise.all([
    rm(temp, { recursive: true, force: true }),
    ...(emissionTemp ? [rm(emissionTemp, { recursive: true, force: true })] : [])
  ])
}
