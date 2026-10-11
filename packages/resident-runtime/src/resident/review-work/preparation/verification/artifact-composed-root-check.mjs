import { artifactValueTag } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, lstat, rm } from "node:fs/promises"
import { join, dirname } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { resolveGraphUnit } from "@hapsland/source-analysis/direct-event/graph-resolver"
import { eligibleNamedPath, DEFAULT_DIRECT_FILE_POLICY } from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import {
  createGraphServiceRegistry as createServiceRegistry,
  createBendResolver
} from "@hapsland/source-analysis/direct-event/graph-resolution"
import { createOwnedArtifactDriver } from "../../composition/owned-artifact-driver.mjs"
import { createArtifactMachine } from "../../composition/artifact-dispatcher.mjs"
const temp = await mkdtemp("/tmp/hapsland-composed-root-")
try {
  let machine
  {
    const artifacts = {}
    for (const [key, name] of [
      ["composition", "ArtifactComposition"],
      ["parent", "GenericArtifact"],
      ["python", "PythonArtifact"]
    ]) {
      const emitted = join(temp, name + ".mjs")
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
              ComposedMachine:
                "../../../../../../source-analysis/src/direct-event/graph-resolution/ComposedMachine.bend",
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
              ForestAllowance:
                "../../../../../../source-analysis/src/direct-event/graph-resolution/ForestAllowance.bend",
              ForestSpecification:
                "../../../../../../source-analysis/src/direct-event/graph-resolution/ForestSpecification.bend",
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
              RuntimeNatProof:
                "../../../../../../source-analysis/src/direct-event/graph-resolution/RuntimeNatProof.bend",
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
              TerminalMachine:
                "../../../../../../source-analysis/src/direct-event/graph-resolution/TerminalMachine.bend",
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
      artifacts[key] = (await import(pathToFileURL(emitted))).default
    }
    const split = createArtifactMachine(artifacts)
    const shadowPath = join(temp, "shadow.mjs")
    execFileSync(
      "taskset",
      [
        "-c",
        "10",
        "bend",
        join(
          import.meta.dirname,
          "../../../../../../source-analysis/src/direct-event/graph-resolution/ComposedMachine.bend"
        ),
        "-o",
        shadowPath
      ],
      { timeout: 5000 }
    )
    const shadow = (await import(pathToFileURL(shadowPath))).default
    const observation = (step) => (step.$ === "Types.AwaitService" ? { kind: step.$, request: step.request } : step)
    const compare = (pair) => {
      assert.deepEqual(
        observation(split.view(pair.split)),
        observation(shadow.view(pair.shadow)),
        "reachable split/monolithic observation"
      )
      return pair
    }
    machine = {
      initial: (input) => compare({ split: split.initial(input), shadow: shadow.initial(input) }),
      resume: (state, event) =>
        compare({ split: split.resume(state.split, event), shadow: shadow.resume(state.shadow, event) }),
      view: (state) => split.view(state.split),
      dispose: split.dispose,
      disposeInvocation: split.disposeInvocation,
      get retainedHandles() {
        return split.retainedHandles
      }
    }
  }
  const ownerPath = join(temp, "owner.mjs")
  execFileSync(
    "taskset",
    [
      "-c",
      "10",
      "bend",
      new URL("../../../../../../agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend", import.meta.url)
        .pathname,
      "-o",
      ownerPath
    ],
    { timeout: 5000 }
  )
  const owner = (await import(pathToFileURL(ownerPath))).default
  let ownerState = owner.initial_limits(100n, 100000000n, 100n, 100000000n)
  const canonical = (name, fields) => ({ $: "../Canonical." + name, ...fields })
  for (const event of [
    canonical("OpenRound", { partition: 1n, lifetime: 1n }),
    canonical("AdmitObservation", { partition: 1n, lifetime: 1n, round: 1n }),
    canonical("StartObservation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n }),
    canonical("BeginObservedPreparation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n, bytes: 1000n })
  ]) {
    const step = owner.canonical_event(ownerState, event)
    assert.equal(step.$, "Advanced")
    ownerState = step.state
  }
  const registry = createServiceRegistry(),
    operations = []
  let activeState,
    fences = 0,
    terminalSuffixes = 0
  const t = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
  const guarded = {
    ...machine,
    view(state) {
      activeState = state
      const projection = machine.view(state)
      if (projection.$ !== "Types.AwaitService") {
        assert.equal(
          machine.view(machine.resume(state, t("CancelInvocation", { invocation: 0n }))).failure.$,
          "Types.ReplyAfterTerminal"
        )
        assert.equal(
          machine.view(
            machine.resume(
              state,
              t("ServiceReply", {
                reply: t("Reply", {
                  invocation: 0n,
                  id: 0n,
                  outcome: t("ClockRead", { bits: t("Binary64", { high: 0, low: 0 }) })
                })
              })
            )
          ).failure.$,
          "Types.ReplyAfterTerminal"
        )
      }
      if (projection.$ !== "Types.AwaitService") terminalSuffixes += 2
      return projection
    }
  }
  const driver = createOwnedArtifactDriver({
    owner,
    initialState: ownerState,
    scope: { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n },
    machine: guarded,
    registry,
    foreign: async ([request], options) => {
      operations.push(request.operation.$)
      const reply = await registry.perform(request, options)
      const cancelled = machine.resume(activeState, t("CancelInvocation", { invocation: request.invocation }))
      assert.equal(machine.view(cancelled).failure.$, "Types.InvocationCancelled")
      assert.equal(
        machine.view(machine.resume(cancelled, t("CancelInvocation", { invocation: request.invocation }))).failure.$,
        "Types.ReplyAfterTerminal"
      )
      assert.equal(
        machine.view(machine.resume(cancelled, t("ServiceReply", { reply }))).failure.$,
        "Types.ReplyAfterTerminal"
      )
      assert.equal(
        machine.view(machine.resume(activeState, t("ServiceReply", { reply: { ...reply, id: reply.id + 1n } }))).failure
          .$,
        "Types.WrongCorrelation"
      )
      assert.equal(
        machine.view(
          machine.resume(activeState, t("ServiceReply", { reply: { ...reply, invocation: reply.invocation + 1n } }))
        ).failure.$,
        "Types.WrongInvocation"
      )
      fences += 5
      return reply
    }
  })
  const resolver = createBendResolver({
    machine: guarded,
    registry,
    allocateInvocation: () => driver.allocateInvocation(),
    onConstructionFailure: driver.constructionFailed,
    drive: driver.drive
  })
  let cases = 0
  for (const [index, fixture] of [
    { branch: "type", text: "class Root:\n value: str\n" },
    { branch: "type", text: "class Leaf:\n id: str\nclass Root:\n leaf: Leaf\n" },
    { branch: "function", text: "def Root():\n return 1\n" },
    { branch: "type", text: "class Root:\n value: str\n", limits: { files: 0 } },
    { branch: "type", text: "class Root:\n value: str\n", limits: { readBytes: 0 } },
    { branch: "type", text: "class Root:\n value: str\n", cache: true },
    {
      branch: "type",
      text: "from leaf import Foo\nclass Root:\n value: Foo\n",
      files: { "leaf.py": "class Foo:\n id: str\n" }
    },
    {
      branch: "type",
      text: "from pkg import Foo\nclass Root:\n value: Foo\n",
      files: { "pkg/__init__.py": "from .leaf import Foo\n", "pkg/leaf.py": "class Foo:\n id: str\n" }
    },
    {
      branch: "type",
      text: "from pkg import Foo\nclass Root:\n value: Foo\n",
      files: { "pkg/__init__.py": "from .leaf import Bar as Foo\n", "pkg/leaf.py": "class Bar:\n id: str\n" }
    },
    { branch: "type", text: "from absent import Foo\nclass Root:\n value: Foo\n" },
    ...[
      { files: 1 },
      { files: 2 },
      { files: 3 },
      { work: 1 },
      { work: 3 },
      { work: 8 },
      { sourceBytes: 16 },
      { readBytes: 80, sourceBytes: 80 }
    ].map((limits) => ({
      branch: "type",
      text: "from pkg import Foo\nclass Root:\n value: Foo\n",
      files: { "pkg/__init__.py": "from .leaf import Foo\n", "pkg/leaf.py": "class Foo:\n id: str\n" },
      limits
    }))
  ].entries()) {
    const root = join(temp, String(index))
    await mkdir(root)
    execFileSync("git", ["init", "-q", root], { timeout: 5000 })
    await writeFile(join(root, "root.py"), fixture.text)
    for (const [path, text] of Object.entries(fixture.files ?? {})) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), text)
    }
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
    )
    const captured = await Effect.runPromise(captureStable(root, selection, {}, rootIdentity))
    assert.equal(captured.status, "captured")
    const context = {
      root,
      rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY,
      branch: fixture.branch,
      limits: { ...GRAPH_LIMIT_CEILINGS, ...fixture.limits },
      now: () => 0
    }
    const expected = await Effect.runPromise(
      resolveGraphUnit("root.py", captured.capture, "Root", {
        ...context,
        ...(fixture.cache ? { captureCache: new Map() } : {})
      })
    )
    const actual = await resolver("root.py", captured.capture, "Root", {
      ...context,
      ...(fixture.cache ? { captureCache: new Map() } : {})
    })
    assert.deepEqual(actual, expected, "full root ReviewUnit " + index)
    cases++
  }
  assert.equal(registry.size, 0)
  assert.equal(driver.stats.accepted, cases)
  assert.equal(driver.stats.providerStarts, driver.stats.providerCleanups)
  assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
  machine.dispose?.()
  if (machine.retainedHandles !== undefined) assert.equal(machine.retainedHandles, 0)
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests: operations.length,
      fences,
      terminalSuffixes,
      splitArtifacts: true,
      canonicalAccepted: driver.stats.accepted,
      scope:
        "actual Canonical child lifecycle/result acceptance and resolveGraphUnit Python root/module/reexport consumer, split/monolithic equality, preparation/cache/import/inspect; capture census/terminal revalidation and per-Await cancellation/wrong identity refusal; finite qualification, whole resident production adoption and universal proofs remain open"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
