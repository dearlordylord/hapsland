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
import { resolveGraphUnit } from "@hapsland/source-analysis/direct-event/graph-resolver"
import { eligibleNamedPath, DEFAULT_DIRECT_FILE_POLICY } from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import {
  createGraphServiceRegistry as createServiceRegistry,
  createBendEffectResolver,
  createBendResolver
} from "@hapsland/source-analysis/direct-event/graph-resolution"
import { createOwnedArtifactDriver } from "../../composition/owned-artifact-driver.mjs"
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
    ["composition", "ArtifactComposition"],
    ["parent", "GenericArtifact"],
    ["python", "PythonArtifact"],
    ["go", "GoArtifact"],
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
            ArtifactComposition: "../../composition/ArtifactComposition.bend",
            ArtifactIndexSkipMutantCore:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/ArtifactIndexSkipMutantCore.bend",
            ArtifactProtocol: "../../composition/ArtifactProtocol.bend",
            Attach: "../../../../../../source-analysis/src/direct-event/graph-resolution/Attach.bend",
            AttachPlanning: "../../../../../../source-analysis/src/direct-event/graph-resolution/AttachPlanning.bend",
            BoundaryLiteralCheck:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/BoundaryLiteralCheck.bend",
            BoundaryValidationSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/BoundaryValidationSpecification.bend",
            CanonicalResolverOwner:
              "../../../../../../agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend",
            CaptureAdmission:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/CaptureAdmission.bend",
            Cargo: "../../../../../../source-analysis/src/direct-event/graph-resolution/Cargo.bend",
            CargoSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/CargoSpecification.bend",
            CargoSpecificationCheck:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/CargoSpecificationCheck.bend",
            Check: "../../../../../../source-analysis/src/direct-event/graph-resolution/Check.bend",
            Clock: "../../../../../../source-analysis/src/direct-event/graph-resolution/Clock.bend",
            ComposedBudget: "../../../../../../source-analysis/src/direct-event/graph-resolution/ComposedBudget.bend",
            ComposedMachine: "../../../../../../source-analysis/src/direct-event/graph-resolution/ComposedMachine.bend",
            Composition: "../../../../../../source-analysis/src/direct-event/graph-resolution/Composition.bend",
            Core: "../../../../../../source-analysis/src/direct-event/graph-resolution/Core.bend",
            DeadlineLiteralCheck:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/DeadlineLiteralCheck.bend",
            DeadlineSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/DeadlineSpecification.bend",
            EntrySpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/EntrySpecification.bend",
            Environment: "../../../../../../source-analysis/src/direct-event/graph-resolution/Environment.bend",
            ExpansionDriverSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/ExpansionDriverSpecification.bend",
            ExpansionSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/ExpansionSpecification.bend",
            ExpansionSpecificationCheck:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/ExpansionSpecificationCheck.bend",
            Facts: "../../../../../../source-analysis/src/direct-event/graph-resolution/Facts.bend",
            Failure: "../../../../../../source-analysis/src/direct-event/graph-resolution/Failure.bend",
            ForestAllowance: "../../../../../../source-analysis/src/direct-event/graph-resolution/ForestAllowance.bend",
            ForestSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/ForestSpecification.bend",
            GoArtifact: "../../composition/GoArtifact.bend",
            GenericArtifact: "../../composition/GenericArtifact.bend",
            GraphSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/GraphSpecification.bend",
            ImportedRust: "../../../../../../source-analysis/src/direct-event/graph-resolution/ImportedRust.bend",
            Loop: "../../../../../../source-analysis/src/direct-event/graph-resolution/Loop.bend",
            LoopPolicy: "../../../../../../source-analysis/src/direct-event/graph-resolution/LoopPolicy.bend",
            Machine: "../../../../../../source-analysis/src/direct-event/graph-resolution/Machine.bend",
            MechanicalPathAlgebra:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/MechanicalPathAlgebra.bend",
            ModuleSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/ModuleSpecification.bend",
            PostPreparation:
              "../../../../../../resident-runtime/src/resident/review-work/preparation/PostPreparation.bend",
            Preparation: "../../../../../../review-execution/src/direct-event/preparation/Preparation.bend",
            PreparationSelection:
              "../../../../../../review-execution/src/direct-event/preparation/PreparationSelection.bend",
            PreparationSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/PreparationSpecification.bend",
            Protocol: "../../../../../../source-analysis/src/direct-event/graph-resolution/Protocol.bend",
            PythonArtifact: "../../composition/PythonArtifact.bend",
            PythonModule: "../../../../../../source-analysis/src/direct-event/graph-resolution/PythonModule.bend",
            RUNTIME_INVARIANT_LAWS:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RUNTIME_INVARIANT_LAWS.bend",
            RUNTIME_INVARIANT_PROOF:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RUNTIME_INVARIANT_PROOF.bend",
            RUNTIME_LAWS: "../../../../../../source-analysis/src/direct-event/graph-resolution/RUNTIME_LAWS.bend",
            RUNTIME_PROOF: "../../../../../../source-analysis/src/direct-event/graph-resolution/RUNTIME_PROOF.bend",
            Read: "../../../../../../source-analysis/src/direct-event/graph-resolution/Read.bend",
            ReferenceGroupMutantCore:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/ReferenceGroupMutantCore.bend",
            Resolve: "../../../../../../source-analysis/src/direct-event/graph-resolution/Resolve.bend",
            Root: "../../../../../../source-analysis/src/direct-event/graph-resolution/Root.bend",
            RootAttribution:
              "../../../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.bend",
            RootPlanning: "../../../../../../source-analysis/src/direct-event/graph-resolution/RootPlanning.bend",
            Runtime: "../../../../../../source-analysis/src/direct-event/graph-resolution/Runtime.bend",
            RuntimeCancellationPhaseProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeCancellationPhaseProof.bend",
            RuntimeCorrespondenceProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeCorrespondenceProof.bend",
            RuntimeFrozenRowsProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeFrozenRowsProof.bend",
            RuntimeHistoryProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeHistoryProof.bend",
            RuntimeInvariant:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeInvariant.bend",
            RuntimeInvocationProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeInvocationProof.bend",
            RuntimeLawObservation:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeLawObservation.bend",
            RuntimeLeaseProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeLeaseProof.bend",
            RuntimeMachineFenceProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeMachineFenceProof.bend",
            RuntimeModel: "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeModel.bend",
            RuntimeNatProof: "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeNatProof.bend",
            RuntimeSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeSpecification.bend",
            RuntimeTraceProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeTraceProof.bend",
            RuntimeValidityProof:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeValidityProof.bend",
            RustCargo: "../../../../../../source-analysis/src/direct-event/graph-resolution/RustCargo.bend",
            RustFollow: "../../../../../../source-analysis/src/direct-event/graph-resolution/RustFollow.bend",
            RustMachine: "../../../../../../source-analysis/src/direct-event/graph-resolution/RustMachine.bend",
            RustSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RustSpecification.bend",
            RustStorage: "../../../../../../source-analysis/src/direct-event/graph-resolution/RustStorage.bend",
            RustTaskSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/RustTaskSpecification.bend",
            SPEC: "../../../../../../source-analysis/src/direct-event/graph-resolution/SPEC.bend",
            SignedLocalSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/SignedLocalSpecification.bend",
            SignedLocalSpecificationCheck:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/SignedLocalSpecificationCheck.bend",
            SourcePreparation:
              "../../../../../../resident-runtime/src/resident/review-work/preparation/SourcePreparation.bend",
            SourcePreparationProbe:
              "../../../../../../resident-runtime/src/resident/review-work/preparation/SourcePreparationProbe.bend",
            SourceValidationSpecification:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/SourceValidationSpecification.bend",
            SpecificationCheck:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/SpecificationCheck.bend",
            State: "../../../../../../source-analysis/src/direct-event/graph-resolution/State.bend",
            TerminalMachine: "../../../../../../source-analysis/src/direct-event/graph-resolution/TerminalMachine.bend",
            Types: "../../../../../../source-analysis/src/direct-event/graph-resolution/Types.bend",
            WholeObservation:
              "../../../../../../source-analysis/src/direct-event/graph-resolution/WholeObservation.bend"
          }[name],
          import.meta.url
        ).pathname,
        "-o",
        emitted
      ],
      { timeout: 5000 }
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
  const abandoned = createOwnedArtifactDriver({
    owner,
    initialState: initial(),
    scope,
    artifacts,
    registry: createServiceRegistry(),
    foreign: () => {
      throw new Error("unexpected provider")
    }
  })
  const allocated = abandoned.allocateInvocation()
  abandoned.cancel(allocated)
  assert.deepEqual(abandoned.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
  cases++
  const overflow = createOwnedArtifactDriver({
    owner,
    initialState: { ...initial(), next_invocation: 2n ** 53n },
    scope,
    artifacts,
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
      const driver = createOwnedArtifactDriver({
        owner,
        initialState: initial(),
        scope,
        artifacts: wrapped,
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
    const driver = createOwnedArtifactDriver({
      owner,
      initialState: initial(),
      scope,
      artifacts,
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
    try {
      expected = await Effect.runPromise(
        resolveGraphUnit(path, stable(path), "Root", contextFor(nativeEvents, nativeCache))
      )
    } catch (error) {
      nativeError = error
    }
    const registry = createServiceRegistry()
    const driver = createOwnedArtifactDriver({
      owner,
      initialState: initial(),
      scope,
      artifacts,
      registry,
      foreign: async ([request], options) => {
        totalRequests++
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
        return await registry.perform(request, options)
      }
    })
    const resolver = createBendEffectResolver({
      drive: driver.drive,
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
      scope:
        "actual Canonical admission/Prepare + split resolver children with physical native service/session, two roots under one preparation, cancellation/retirement/late rejection/provisional refusal/throw cleanup; all 58 original graph fixture facts compare full native results/effects/cache/errors; original generic IO/trace qualification, real resident preparation progression/retention/revision and universal proofs remain open"
    })
  )
} finally {
  await Promise.all([
    rm(temp, { recursive: true, force: true }),
    ...(emissionTemp ? [rm(emissionTemp, { recursive: true, force: true })] : [])
  ])
}
