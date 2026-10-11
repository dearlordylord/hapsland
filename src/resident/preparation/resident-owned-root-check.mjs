import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, lstat, rm, readdir, readlink } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "../../../packages/canonical-policy/dist/canonical/graph-limits.js"
import { resolveGraphUnit } from "../../../packages/source-analysis/dist/direct-event/graph-resolver.js"
import {
  eligibleNamedPath,
  DEFAULT_DIRECT_FILE_POLICY
} from "../../../packages/native-observation/dist/direct-event/selection.js"
import { captureStable } from "../../../packages/native-observation/dist/direct-event/capture.js"
import { createServiceRegistry } from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs"
import {
  createBendResolver,
  pureReply
} from "../../../packages/source-analysis/src/direct-event/graph-resolution/consumer.mjs"
import { createOwnedArtifactDriver } from "../../../packages/resident-runtime/src/resident/review-work/composition/owned-artifact-driver.mjs"
import * as Ref from "effect/Ref"
import { initialCanonical, projectCanonical } from "@hapsland/canonical-policy/canonical/adapter"
import { residentTransaction } from "../../../packages/resident-runtime/src/resident/state/resident/transaction.ts"
import { residentCapacity } from "../../../packages/resident-runtime/src/resident/state/resident/capacity.ts"
import { retireRound } from "../../../packages/resident-runtime/src/resident/state/capacity/rounds.ts"
import { completePreparation } from "../../../packages/resident-runtime/src/resident/state/capacity/preparation.ts"
import { createResidentOwnerTransaction } from "../../../packages/resident-runtime/src/resident/state/resolver-custody/resident-owner-transaction.mjs"
const temp = await mkdtemp("/tmp/hapsland-owned-root-")
try {
  const artifacts = {}
  let owner
  for (const [key, name] of [
    ["composition", "ArtifactComposition"],
    ["parent", "GenericArtifact"],
    ["python", "PythonArtifact"],
    ["owner", "CanonicalResolverOwner"]
  ]) {
    const emitted = join(temp, name + "../../../../../source-analysis/src/direct-event/graph-resolution/.mjs")
    execFileSync(
      "taskset",
      [
        "-c",
        "10",
        "bend",
        new URL(
          {
            "../../../../../source-analysis/src/direct-event/graph-resolution/.runtime-cancellation-closure-diagnostic":
              "../../../packages/source-analysis/src/direct-event/graph-resolution/.runtime-cancellation-closure-diagnostic.bend",
            "../../../../../source-analysis/src/direct-event/graph-resolution/.runtime-correspondence-closure-diagnostic":
              "../../../packages/source-analysis/src/direct-event/graph-resolution/.runtime-correspondence-closure-diagnostic.bend",
            "../../../../../source-analysis/src/direct-event/graph-resolution/.runtime-resumed-proof-control":
              "../../../packages/source-analysis/src/direct-event/graph-resolution/.runtime-resumed-proof-control.bend",
            ArtifactComposition:
              "../../../packages/resident-runtime/src/resident/review-work/composition/ArtifactComposition.bend",
            ArtifactIndexSkipMutantCore:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/ArtifactIndexSkipMutantCore.bend",
            ArtifactProtocol:
              "../../../packages/resident-runtime/src/resident/review-work/composition/ArtifactProtocol.bend",
            Attach: "../../../packages/source-analysis/src/direct-event/graph-resolution/Attach.bend",
            AttachPlanning: "../../../packages/source-analysis/src/direct-event/graph-resolution/AttachPlanning.bend",
            BoundaryLiteralCheck:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/BoundaryLiteralCheck.bend",
            BoundaryValidationSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/BoundaryValidationSpecification.bend",
            CanonicalResolverOwner:
              "../../../packages/agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend",
            CaptureAdmission:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/CaptureAdmission.bend",
            Cargo: "../../../packages/source-analysis/src/direct-event/graph-resolution/Cargo.bend",
            CargoSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/CargoSpecification.bend",
            CargoSpecificationCheck:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/CargoSpecificationCheck.bend",
            Check: "../../../packages/source-analysis/src/direct-event/graph-resolution/Check.bend",
            Clock: "../../../packages/source-analysis/src/direct-event/graph-resolution/Clock.bend",
            ComposedBudget: "../../../packages/source-analysis/src/direct-event/graph-resolution/ComposedBudget.bend",
            ComposedMachine: "../../../packages/source-analysis/src/direct-event/graph-resolution/ComposedMachine.bend",
            Composition: "../../../packages/source-analysis/src/direct-event/graph-resolution/Composition.bend",
            Core: "../../../packages/source-analysis/src/direct-event/graph-resolution/Core.bend",
            DeadlineLiteralCheck:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/DeadlineLiteralCheck.bend",
            DeadlineSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/DeadlineSpecification.bend",
            EntrySpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/EntrySpecification.bend",
            Environment: "../../../packages/source-analysis/src/direct-event/graph-resolution/Environment.bend",
            ExpansionDriverSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionDriverSpecification.bend",
            ExpansionSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionSpecification.bend",
            ExpansionSpecificationCheck:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionSpecificationCheck.bend",
            Facts: "../../../packages/source-analysis/src/direct-event/graph-resolution/Facts.bend",
            Failure: "../../../packages/source-analysis/src/direct-event/graph-resolution/Failure.bend",
            ForestAllowance: "../../../packages/source-analysis/src/direct-event/graph-resolution/ForestAllowance.bend",
            ForestSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/ForestSpecification.bend",
            GenericArtifact:
              "../../../packages/resident-runtime/src/resident/review-work/composition/GenericArtifact.bend",
            GraphSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/GraphSpecification.bend",
            ImportedRust: "../../../packages/source-analysis/src/direct-event/graph-resolution/ImportedRust.bend",
            Loop: "../../../packages/source-analysis/src/direct-event/graph-resolution/Loop.bend",
            LoopPolicy: "../../../packages/source-analysis/src/direct-event/graph-resolution/LoopPolicy.bend",
            Machine: "../../../packages/source-analysis/src/direct-event/graph-resolution/Machine.bend",
            MechanicalPathAlgebra:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/MechanicalPathAlgebra.bend",
            ModuleSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/ModuleSpecification.bend",
            PostPreparation:
              "../../../packages/resident-runtime/src/resident/review-work/preparation/PostPreparation.bend",
            Preparation: "../../../packages/review-execution/src/direct-event/preparation/Preparation.bend",
            PreparationSelection:
              "../../../packages/review-execution/src/direct-event/preparation/PreparationSelection.bend",
            PreparationSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/PreparationSpecification.bend",
            Protocol: "../../../packages/source-analysis/src/direct-event/graph-resolution/Protocol.bend",
            PythonArtifact:
              "../../../packages/resident-runtime/src/resident/review-work/composition/PythonArtifact.bend",
            PythonModule: "../../../packages/source-analysis/src/direct-event/graph-resolution/PythonModule.bend",
            RUNTIME_INVARIANT_LAWS:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_INVARIANT_LAWS.bend",
            RUNTIME_INVARIANT_PROOF:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_INVARIANT_PROOF.bend",
            RUNTIME_LAWS: "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_LAWS.bend",
            RUNTIME_PROOF: "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_PROOF.bend",
            Read: "../../../packages/source-analysis/src/direct-event/graph-resolution/Read.bend",
            ReferenceGroupMutantCore:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/ReferenceGroupMutantCore.bend",
            Resolve: "../../../packages/source-analysis/src/direct-event/graph-resolution/Resolve.bend",
            Root: "../../../packages/source-analysis/src/direct-event/graph-resolution/Root.bend",
            RootAttribution:
              "../../../packages/native-observation/src/direct-event/edit-attribution/RootAttribution.bend",
            RootPlanning: "../../../packages/source-analysis/src/direct-event/graph-resolution/RootPlanning.bend",
            Runtime: "../../../packages/source-analysis/src/direct-event/graph-resolution/Runtime.bend",
            RuntimeCancellationPhaseProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeCancellationPhaseProof.bend",
            RuntimeCorrespondenceProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeCorrespondenceProof.bend",
            RuntimeFrozenRowsProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeFrozenRowsProof.bend",
            RuntimeHistoryProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeHistoryProof.bend",
            RuntimeInvariant:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeInvariant.bend",
            RuntimeInvocationProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeInvocationProof.bend",
            RuntimeLawObservation:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeLawObservation.bend",
            RuntimeLeaseProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeLeaseProof.bend",
            RuntimeMachineFenceProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeMachineFenceProof.bend",
            RuntimeModel: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeModel.bend",
            RuntimeNatProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeNatProof.bend",
            RuntimeSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeSpecification.bend",
            RuntimeTraceProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeTraceProof.bend",
            RuntimeValidityProof:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeValidityProof.bend",
            RustCargo: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustCargo.bend",
            RustFollow: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustFollow.bend",
            RustMachine: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustMachine.bend",
            RustSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RustSpecification.bend",
            RustStorage: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustStorage.bend",
            RustTaskSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/RustTaskSpecification.bend",
            SPEC: "../../../packages/source-analysis/src/direct-event/graph-resolution/SPEC.bend",
            SignedLocalSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecification.bend",
            SignedLocalSpecificationCheck:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecificationCheck.bend",
            SourcePreparation:
              "../../../packages/resident-runtime/src/resident/review-work/preparation/SourcePreparation.bend",
            SourcePreparationProbe:
              "../../../packages/resident-runtime/src/resident/review-work/preparation/SourcePreparationProbe.bend",
            SourceValidationSpecification:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/SourceValidationSpecification.bend",
            SpecificationCheck:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/SpecificationCheck.bend",
            State: "../../../packages/source-analysis/src/direct-event/graph-resolution/State.bend",
            TerminalMachine: "../../../packages/source-analysis/src/direct-event/graph-resolution/TerminalMachine.bend",
            Types: "../../../packages/source-analysis/src/direct-event/graph-resolution/Types.bend",
            WholeObservation:
              "../../../packages/source-analysis/src/direct-event/graph-resolution/WholeObservation.bend"
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
    b = await lstat(join(root, "../../../../../source-analysis/src/direct-event/graph-resolution/.git"))
  const rootIdentity = {
    rootDevice: String(a.dev),
    rootInode: String(a.ino),
    gitDirectory: join(root, "../../../../../source-analysis/src/direct-event/graph-resolution/.git"),
    gitDevice: String(b.dev),
    gitInode: String(b.ino)
  }
  const selection = await Effect.runPromise(
      eligibleNamedPath(root, "root.py", DEFAULT_DIRECT_FILE_POLICY, rootIdentity)
    ),
    captured = await Effect.runPromise(captureStable(root, selection, {}, rootIdentity))
  assert.equal(captured.status, "captured")
  const c = (name, fields = {}) => ({
      $: "../../../../../source-analysis/packages/agent-flow-bend/Canonical." + name,
      ...fields
    }),
    scope = { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n }
  const initial = () => {
    const run = Effect.runSync,
      limits = { globalItems: 100, globalBytes: 100000000, partitionItems: 16, partitionBytes: 100000000 }
    const ref = run(
      Ref.make({
        residentLifetime: "physical",
        limits,
        canonical: initialCanonical(limits),
        resolverCustody: owner.initial_custody(),
        reservations: new Map(),
        partitionIds: new Map(),
        partitionIdentityBytes: 0,
        roundIds: new Map(),
        requestRounds: new Map(),
        collectionTokens: new Map(),
        nextCollectionToken: 1,
        nextPartitionId: 1,
        minimumFreshStart: 0,
        records: { runtime: { peakLedgerBytes: 0 }, marker: 0 }
      })
    )
    const transaction = residentTransaction(ref, "physical"),
      capacity = residentCapacity(transaction)
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent"))
    const observation = run(capacity.admitObservation("agent", round))
    assert.equal(run(capacity.observation("agent", observation, "startObservation", round)), true)
    const preparation = run(capacity.beginObservedPreparation("agent", observation, 1000, round))
    assert.equal(preparation.status, "admitted")
    assert.equal(preparation.operation, 2)
    let attachedDriver
    const bridge = createResidentOwnerTransaction({
      owner,
      transaction,
      onActions: (actions) =>
        Effect.sync(() => {
          if (actions.length && !attachedDriver) throw new Error("Unbound resident action consumer")
          attachedDriver?.acceptActions(actions)
        })
    })
    return {
      control: bridge.control,
      bridge,
      transaction,
      preparation,
      round,
      partition,
      attachDriver: (driver) => {
        attachedDriver = driver
      }
    }
  }
  let cases = 0,
    totalRequests = 0
  for (const mode of [
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
    const connection = initial(),
      registry = createServiceRegistry()
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
          Effect.runSync(
            connection.bridge.native((draft, records) => {
              retireRound(draft, "agent", connection.round)
              return [undefined, records]
            })
          )
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
      control: connection.control,
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
          const pending = registry
            .get(Number(request.invocation))
            .perform(request, mode === "cancel-inflight-success" ? { ...options, signal: undefined } : options)
          triggered = true
          beforeCancelResumes = driver.stats.resumes
          driver.cancel(request.invocation)
          return pureReply(await pending)
        }
        if (mode === "late-rejection") throw new Error("injected late provider rejection")
        return pureReply(await registry.get(Number(request.invocation)).perform(request, options))
      }
    })
    connection.attachDriver(driver)
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
    if (mode === "construction-throws") {
      await assert.rejects(
        resolver("root.py", { ...captured.capture, byteLength: undefined }, "Root", context),
        TypeError
      )
    } else if (mode === "two-roots" || mode === "between-roots") {
      const expected = await Effect.runPromise(
        resolveGraphUnit("root.py", captured.capture, "Root", { ...context, captureCache: new Map() })
      )
      assert.deepEqual(await resolver("root.py", captured.capture, "Root", context), expected)
      if (mode === "between-roots") {
        driver.canonicalEvent(c("InterruptPreparation", { partition: 1n, lifetime: 1n, round: 1n, operation: 2n }))
        await assert.rejects(resolver("root.py", captured.capture, "Second", context), /NotPreparing/)
      } else {
        const second = await Effect.runPromise(
          resolveGraphUnit("root.py", captured.capture, "Second", { ...context, captureCache: new Map() })
        )
        assert.deepEqual(await resolver("root.py", captured.capture, "Second", context), second)
        const completed = Effect.runSync(
          connection.bridge.native((draft, records) => [
            completePreparation(
              draft,
              "agent",
              connection.preparation.operation,
              connection.preparation.reservation,
              [100, 100],
              connection.round
            ),
            { ...records, marker: 1 }
          ])
        )
        assert.equal(completed.value.length, 2)
        const snapshot = Effect.runSync(connection.transaction.read)
        assert.equal(snapshot.reservations.size, 2)
        assert.equal(snapshot.records.marker, 1)
        assert.equal(projectCanonical(snapshot.canonical).global.bytes, 200)
        assert.equal("canonical" in snapshot.resolverCustody, false)
        assert.equal(driver.stats.accepted, 2)
        assert.equal(driver.stats.launches, 2)
        assert.equal(owner.live(driver.state.canonical, scope), false)
      }
    } else {
      await assert.rejects(
        resolver("root.py", captured.capture, "Root", context, { signal: controller.signal }),
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
      if (["cancel-provider", "retire-provider", "late-rejection"].includes(mode)) assert.equal(driver.stats.resumes, 0)
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
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests: totalRequests,
      scope:
        "actual resident transaction and capacity admission/completion + split resolver children and native session; driver retains no Canonical state; full preparation root selection/progression, retention/revision and universal proofs remain open"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
