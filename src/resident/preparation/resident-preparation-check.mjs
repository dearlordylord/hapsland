import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, lstat, rm, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import { GRAPH_LIMIT_CEILINGS } from "../../../packages/canonical-policy/dist/canonical/graph-limits.js";
import { resolveGraphUnit as __resolveGraphUnit } from "../../../packages/source-analysis/dist/direct-event/graph-resolver.js";
import { eligibleNamedPath as __eligibleNamedPath, DEFAULT_DIRECT_FILE_POLICY } from "../../../packages/native-observation/dist/direct-event/selection.js";
import { captureStable } from "../../../packages/native-observation/dist/direct-event/capture.js";
import { createServiceRegistry, productValue as __productValue, fromProductValue, list, unlist } from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs";
import { createBendResolver as __createBendResolver, pureReply } from "../../../packages/source-analysis/src/direct-event/graph-resolution/consumer.mjs";
import { createOwnedArtifactDriver } from "../../../packages/resident-runtime/src/resident/review-work/composition/owned-artifact-driver.mjs";
import * as Ref from "effect/Ref";
import { initialCanonical, projectCanonical as __projectCanonical } from "@hapsland/canonical-policy/canonical/adapter";
import { residentTransaction } from "../../../packages/resident-runtime/src/resident/state/resident/transaction.ts";
import { residentCapacity } from "../../../packages/resident-runtime/src/resident/state/resident/capacity.ts";
import { retireRound as __retireRound } from "../../../packages/resident-runtime/src/resident/state/capacity/rounds.ts";
import { completePreparation } from "../../../packages/resident-runtime/src/resident/state/capacity/preparation.ts";
import { createResidentOwnerTransaction } from "../../../packages/resident-runtime/src/resident/state/resolver-custody/resident-owner-transaction.mjs";
import { createPreparationMachine } from "../../../packages/review-execution/src/direct-event/preparation/preparation-dispatcher.mjs";
import { createAdviceTailMachine, createPostPreparationMachine } from "../../../packages/resident-runtime/src/resident/review-work/preparation/post-preparation-dispatcher.mjs";
import { inspectGraphFile as __inspectGraphFile, combinedAnalyzerMaterializationPreflight as __combinedAnalyzerMaterializationPreflight, analyzeTypeFile as __analyzeTypeFile } from "../../../packages/source-analysis/dist/direct-event/analyzer.js";
import { resize as __resize } from "../../../packages/resident-runtime/src/resident/state/capacity/reservations.ts";
import { analyzeFunctionFile as __analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer";
import { analysisWorkspaceBytes as __analysisWorkspaceBytes } from "../../../packages/resident-runtime/src/resident/work-ownership/workspace.ts";
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules";
import { nativePrepareReadyUnits as __nativePrepareReadyUnits } from "../../../packages/review-execution/src/direct-event/preparation/native-preparation-children.mjs";
import { nativePostPreparationSource } from "./native-post-preparation-child.mjs";
import { consumeRetainedPreparation } from "./retention-consumer.mjs";
import { createPreparationForeign } from "../../../packages/resident-runtime/src/resident/review-work/composition/preparation-foreign.mjs";
import { decodePreparationResult } from "../../../packages/review-execution/src/direct-event/preparation/preparation-result-codec.mjs";
import { prepareObservation } from "@hapsland/review-execution/direct-event/pipeline";
import { advicee } from "@hapsland/build-tooling/test-support/test-fixtures";
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT as __FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets";
const twoDeclarations = {
  path: "root.py",
  source: "from leaf import Foo\nclass Root:\n first: Foo\nclass Second:\n second: Foo\n",
  contracts: [{
    $: "PreparationSelection.TypeContract"
  }],
  expected: {
    selected: 2n,
    units: 2
  }
};
const oneDeclaration = {
  path: "single.py",
  source: "from leaf import Foo\nclass Root:\n first: Foo\n",
  contracts: [{
    $: "PreparationSelection.TypeContract"
  }],
  expected: {
    selected: 1n,
    units: 1
  }
};
const mixedContracts = {
  path: "mixed.ts",
  source: "export interface Foo { value: string }\nexport function run(value: Foo): Foo { return value }\n",
  contracts: [{
    $: "PreparationSelection.TypeContract"
  }, {
    $: "PreparationSelection.FunctionContract"
  }],
  expected: {
    selected: 2n,
    units: 2
  }
};
// Expectations describe each physical input independently of observed output.
const scenario = (name, fixture, {
  expected = fixture.expected,
  compareNative = false
} = {}) => ({
  name,
  fixture,
  expected,
  compareNative
});
const scenarios = [scenario("two-roots", twoDeclarations, {
  compareNative: true
}), scenario("first-refused", twoDeclarations, {
  expected: {
    selected: 2n,
    units: 1
  }
}), scenario("parent-cancel-late-success", twoDeclarations), scenario("parent-cancel-late-rejection", twoDeclarations), scenario("resize-refused", twoDeclarations, {
  expected: {
    selected: 0n,
    units: 0
  }
}), scenario("mixed-contracts", mixedContracts, {
  compareNative: true
}), scenario("retention-success", twoDeclarations), scenario("retention-before-flow", twoDeclarations), scenario("retention-owner-claimed", twoDeclarations), scenario("retention-after-revision", twoDeclarations), scenario("retention-fault-owner-claimed", twoDeclarations), scenario("retention-fault-after-revision", twoDeclarations), scenario("retention-cached-clear", twoDeclarations), scenario("retention-joined-claimed", twoDeclarations), scenario("retention-joined-pending", twoDeclarations), scenario("retention-bend-success", twoDeclarations), scenario("retention-bend-cached-clear", twoDeclarations), scenario("retention-bend-joined-claimed", twoDeclarations), scenario("retention-bend-joined-pending", twoDeclarations), scenario("retention-bend-after-revision", twoDeclarations), scenario("retention-bend-fault-after-revision", twoDeclarations), scenario("retention-owned-success", twoDeclarations), scenario("retention-owned-cached-clear", twoDeclarations), scenario("retention-owned-joined-claimed", twoDeclarations), scenario("retention-owned-after-revision", twoDeclarations), scenario("retention-owned-fault-after-revision", twoDeclarations), scenario("retention-owned-before-flow", twoDeclarations), scenario("retention-owned-before-enqueue", twoDeclarations), scenario("retention-owned-after-enqueue-ack", twoDeclarations), scenario("retention-owned-after-queue-commit", twoDeclarations), scenario("retention-owned-fault-after-queue-commit", twoDeclarations), scenario("retention-owned-fault-after-enqueue-ack", twoDeclarations), scenario("retention-owned-preinstall-cancel", twoDeclarations), scenario("retention-owned-constructor-fault", twoDeclarations), scenario("retention-owned-duplicate-active", twoDeclarations), scenario("retention-owned-joined-pending", twoDeclarations), scenario("retention-owned-joined-pending-restore-fault", twoDeclarations), scenario("retention-owned-fault-reuse-claim", twoDeclarations), scenario("retention-owned-fault-clear-register", twoDeclarations), scenario("retention-owned-fault-clear-release", twoDeclarations), scenario("retention-owned-fault-joined-append", twoDeclarations), scenario("retention-owned-fault-clear-shared-release", twoDeclarations), scenario("retention-owned-fault-clear-cleanup-receipt", twoDeclarations), scenario("retention-cached-finding", twoDeclarations), scenario("retention-owned-cached-finding", twoDeclarations), scenario("retention-cached-finding-standalone", twoDeclarations), scenario("retention-owned-cached-finding-standalone", twoDeclarations), scenario("retention-owned-cached-finding-standalone-cutoff", twoDeclarations), scenario("retention-owned-cached-finding-standalone-insert-ack", twoDeclarations), scenario("retention-owned-cached-finding-standalone-inspection", twoDeclarations), scenario("retention-cached-finding-standalone-inspection-single", oneDeclaration), scenario("retention-owned-cached-finding-standalone-inspection-single", oneDeclaration), scenario("retention-owned-cached-finding-standalone-barrier", twoDeclarations), scenario("retention-cached-finding-standalone-barrier-mixed", oneDeclaration), scenario("retention-owned-cached-finding-standalone-barrier-mixed", oneDeclaration), scenario("retention-cached-finding-standalone-barrier-mixed-remove-ack", oneDeclaration), scenario("retention-owned-cached-finding-standalone-barrier-mixed-remove-ack", oneDeclaration), scenario("retention-cached-finding-standalone-barrier-mixed-remove-before", oneDeclaration), scenario("retention-owned-cached-finding-standalone-barrier-mixed-remove-before", oneDeclaration), scenario("retention-cached-finding-standalone-inactive", twoDeclarations), scenario("retention-owned-cached-finding-standalone-inactive", twoDeclarations), scenario("retention-cached-finding-standalone-shared", twoDeclarations), scenario("retention-owned-cached-finding-standalone-shared", twoDeclarations)];
const selectedScenarios = scenarios.filter(item => !process.env.HAPSLAND_POSTFLOW_CASE || item.name === process.env.HAPSLAND_POSTFLOW_CASE);
assert.ok(selectedScenarios.length, "Unknown preparation scenario: " + process.env.HAPSLAND_POSTFLOW_CASE);
const temp = await mkdtemp("/tmp/hapsland-owned-root-");
try {
  const artifacts = {};
  let owner;
  for (const [key, name] of [["composition", "ArtifactComposition"], ["parent", "GenericArtifact"], ["python", "PythonArtifact"], ["owner", "CanonicalResolverOwner"]]) {
    const emitted = join(temp, name + ".mjs");
    execFileSync("taskset", ["-c", "10", "bend", new URL({
      ".runtime-cancellation-closure-diagnostic": "../../../packages/source-analysis/src/direct-event/graph-resolution/.runtime-cancellation-closure-diagnostic.bend",
      ".runtime-correspondence-closure-diagnostic": "../../../packages/source-analysis/src/direct-event/graph-resolution/.runtime-correspondence-closure-diagnostic.bend",
      ".runtime-resumed-proof-control": "../../../packages/source-analysis/src/direct-event/graph-resolution/.runtime-resumed-proof-control.bend",
      ArtifactComposition: "../../../packages/resident-runtime/src/resident/review-work/composition/ArtifactComposition.bend",
      ArtifactIndexSkipMutantCore: "../../../packages/source-analysis/src/direct-event/graph-resolution/ArtifactIndexSkipMutantCore.bend",
      ArtifactProtocol: "../../../packages/resident-runtime/src/resident/review-work/composition/ArtifactProtocol.bend",
      Attach: "../../../packages/source-analysis/src/direct-event/graph-resolution/Attach.bend",
      AttachPlanning: "../../../packages/source-analysis/src/direct-event/graph-resolution/AttachPlanning.bend",
      BoundaryLiteralCheck: "../../../packages/source-analysis/src/direct-event/graph-resolution/BoundaryLiteralCheck.bend",
      BoundaryValidationSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/BoundaryValidationSpecification.bend",
      CanonicalResolverOwner: "../../../packages/agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend",
      CaptureAdmission: "../../../packages/source-analysis/src/direct-event/graph-resolution/CaptureAdmission.bend",
      Cargo: "../../../packages/source-analysis/src/direct-event/graph-resolution/Cargo.bend",
      CargoSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/CargoSpecification.bend",
      CargoSpecificationCheck: "../../../packages/source-analysis/src/direct-event/graph-resolution/CargoSpecificationCheck.bend",
      Check: "../../../packages/source-analysis/src/direct-event/graph-resolution/Check.bend",
      Clock: "../../../packages/source-analysis/src/direct-event/graph-resolution/Clock.bend",
      ComposedBudget: "../../../packages/source-analysis/src/direct-event/graph-resolution/ComposedBudget.bend",
      ComposedMachine: "../../../packages/source-analysis/src/direct-event/graph-resolution/ComposedMachine.bend",
      Composition: "../../../packages/source-analysis/src/direct-event/graph-resolution/Composition.bend",
      Core: "../../../packages/source-analysis/src/direct-event/graph-resolution/Core.bend",
      DeadlineLiteralCheck: "../../../packages/source-analysis/src/direct-event/graph-resolution/DeadlineLiteralCheck.bend",
      DeadlineSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/DeadlineSpecification.bend",
      EntrySpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/EntrySpecification.bend",
      Environment: "../../../packages/source-analysis/src/direct-event/graph-resolution/Environment.bend",
      ExpansionDriverSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionDriverSpecification.bend",
      ExpansionSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionSpecification.bend",
      ExpansionSpecificationCheck: "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionSpecificationCheck.bend",
      Facts: "../../../packages/source-analysis/src/direct-event/graph-resolution/Facts.bend",
      Failure: "../../../packages/source-analysis/src/direct-event/graph-resolution/Failure.bend",
      ForestAllowance: "../../../packages/source-analysis/src/direct-event/graph-resolution/ForestAllowance.bend",
      ForestSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/ForestSpecification.bend",
      GenericArtifact: "../../../packages/resident-runtime/src/resident/review-work/composition/GenericArtifact.bend",
      GraphSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/GraphSpecification.bend",
      ImportedRust: "../../../packages/source-analysis/src/direct-event/graph-resolution/ImportedRust.bend",
      Loop: "../../../packages/source-analysis/src/direct-event/graph-resolution/Loop.bend",
      LoopPolicy: "../../../packages/source-analysis/src/direct-event/graph-resolution/LoopPolicy.bend",
      Machine: "../../../packages/source-analysis/src/direct-event/graph-resolution/Machine.bend",
      MechanicalPathAlgebra: "../../../packages/source-analysis/src/direct-event/graph-resolution/MechanicalPathAlgebra.bend",
      ModuleSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/ModuleSpecification.bend",
      PostPreparation: "../../../packages/resident-runtime/src/resident/review-work/preparation/PostPreparation.bend",
      Preparation: "../../../packages/review-execution/src/direct-event/preparation/Preparation.bend",
      PreparationSelection: "../../../packages/review-execution/src/direct-event/preparation/PreparationSelection.bend",
      PreparationSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/PreparationSpecification.bend",
      Protocol: "../../../packages/source-analysis/src/direct-event/graph-resolution/Protocol.bend",
      PythonArtifact: "../../../packages/resident-runtime/src/resident/review-work/composition/PythonArtifact.bend",
      PythonModule: "../../../packages/source-analysis/src/direct-event/graph-resolution/PythonModule.bend",
      RUNTIME_INVARIANT_LAWS: "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_INVARIANT_LAWS.bend",
      RUNTIME_INVARIANT_PROOF: "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_INVARIANT_PROOF.bend",
      RUNTIME_LAWS: "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_LAWS.bend",
      RUNTIME_PROOF: "../../../packages/source-analysis/src/direct-event/graph-resolution/RUNTIME_PROOF.bend",
      Read: "../../../packages/source-analysis/src/direct-event/graph-resolution/Read.bend",
      ReferenceGroupMutantCore: "../../../packages/source-analysis/src/direct-event/graph-resolution/ReferenceGroupMutantCore.bend",
      Resolve: "../../../packages/source-analysis/src/direct-event/graph-resolution/Resolve.bend",
      Root: "../../../packages/source-analysis/src/direct-event/graph-resolution/Root.bend",
      RootAttribution: "../../../packages/native-observation/src/direct-event/edit-attribution/RootAttribution.bend",
      RootPlanning: "../../../packages/source-analysis/src/direct-event/graph-resolution/RootPlanning.bend",
      Runtime: "../../../packages/source-analysis/src/direct-event/graph-resolution/Runtime.bend",
      RuntimeCancellationPhaseProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeCancellationPhaseProof.bend",
      RuntimeCorrespondenceProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeCorrespondenceProof.bend",
      RuntimeFrozenRowsProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeFrozenRowsProof.bend",
      RuntimeHistoryProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeHistoryProof.bend",
      RuntimeInvariant: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeInvariant.bend",
      RuntimeInvocationProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeInvocationProof.bend",
      RuntimeLawObservation: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeLawObservation.bend",
      RuntimeLeaseProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeLeaseProof.bend",
      RuntimeMachineFenceProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeMachineFenceProof.bend",
      RuntimeModel: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeModel.bend",
      RuntimeNatProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeNatProof.bend",
      RuntimeSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeSpecification.bend",
      RuntimeTraceProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeTraceProof.bend",
      RuntimeValidityProof: "../../../packages/source-analysis/src/direct-event/graph-resolution/RuntimeValidityProof.bend",
      RustCargo: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustCargo.bend",
      RustFollow: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustFollow.bend",
      RustMachine: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustMachine.bend",
      RustSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustSpecification.bend",
      RustStorage: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustStorage.bend",
      RustTaskSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/RustTaskSpecification.bend",
      SPEC: "../../../packages/source-analysis/src/direct-event/graph-resolution/SPEC.bend",
      SignedLocalSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecification.bend",
      SignedLocalSpecificationCheck: "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecificationCheck.bend",
      SourcePreparation: "../../../packages/resident-runtime/src/resident/review-work/preparation/SourcePreparation.bend",
      SourcePreparationProbe: "../../../packages/resident-runtime/src/resident/review-work/preparation/SourcePreparationProbe.bend",
      SourceValidationSpecification: "../../../packages/source-analysis/src/direct-event/graph-resolution/SourceValidationSpecification.bend",
      SpecificationCheck: "../../../packages/source-analysis/src/direct-event/graph-resolution/SpecificationCheck.bend",
      State: "../../../packages/source-analysis/src/direct-event/graph-resolution/State.bend",
      TerminalMachine: "../../../packages/source-analysis/src/direct-event/graph-resolution/TerminalMachine.bend",
      Types: "../../../packages/source-analysis/src/direct-event/graph-resolution/Types.bend",
      WholeObservation: "../../../packages/source-analysis/src/direct-event/graph-resolution/WholeObservation.bend"
    }[name], import.meta.url).pathname, "-o", emitted], {
      timeout: 5000
    });
    const loaded = (await import(pathToFileURL(emitted))).default;
    if (key === "owner") owner = loaded;else artifacts[key] = loaded;
  }
  const root = join(temp, "fixture");
  await mkdir(root);
  execFileSync("git", ["init", "-q", root], {
    timeout: 5000
  });
  for (const fixture of new Set(selectedScenarios.map(item => item.fixture))) await writeFile(join(root, fixture.path), fixture.source);
  await writeFile(join(root, "leaf.py"), "class Foo:\n value: str\n");
  const a = await lstat(root),
    b = await lstat(join(root, ".git"));
  const rootIdentity = {
    rootDevice: String(a.dev),
    rootInode: String(a.ino),
    gitDirectory: join(root, ".git"),
    gitDevice: String(b.dev),
    gitInode: String(b.ino)
  };
  const _c = (name, fields = {}) => ({
      $: "../../../packages/agent-flow-bend/Canonical." + name,
      ...fields
    }),
    scope = {
      $: "Scope",
      partition: 1n,
      lifetime: 1n,
      round: 1n,
      preparation: 2n
    };
  const initial = () => {
    const run = Effect.runSync,
      limits = {
        globalItems: 100,
        globalBytes: 100000000,
        partitionItems: 16,
        partitionBytes: 100000000
      };
    const ref = run(Ref.make({
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
      records: {
        runtime: {
          peakLedgerBytes: 0
        },
        marker: 0
      }
    }));
    const transaction = residentTransaction(ref, "physical"),
      capacity = residentCapacity(transaction);
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent"));
    const observation = run(capacity.admitObservation("agent", round));
    assert.equal(run(capacity.observation("agent", observation, "startObservation", round)), true);
    const preparation = run(capacity.beginObservedPreparation("agent", observation, 1000, round));
    assert.equal(preparation.status, "admitted");
    assert.equal(preparation.operation, 2);
    let attachedDriver;
    const bridge = createResidentOwnerTransaction({
      owner,
      transaction,
      validateAdviceInput: (origin, handle) => attachedDriver?.validateAdviceInput(origin, handle) === true,
      onActions: actions => Effect.sync(() => {
        if (actions.length && !attachedDriver) throw new Error("Unbound resident action consumer");
        attachedDriver?.acceptActions(actions);
      })
    });
    return {
      postCore,
      control: bridge.control,
      bridge,
      transaction,
      preparation,
      round,
      partition,
      attachDriver: driver => {
        attachedDriver = driver;
      }
    };
  };
  const preparationEmission = join(temp, "Preparation.mjs");
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../../packages/review-execution/src/direct-event/preparation/Preparation.bend"), "-o", preparationEmission], {
    timeout: 5000
  });
  const core = (await import(pathToFileURL(preparationEmission))).default,
    preparationMachine = createPreparationMachine(core);
  const none = {
      $: "None"
    },
    _some = value => ({
      $: "Some",
      value
    });
  const _location = value => ({
    $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Location",
    start: {
      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
      line: BigInt(value.start.line),
      column: BigInt(value.start.column)
    },
    end: {
      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
      line: BigInt(value.end.line),
      column: BigInt(value.end.column)
    }
  });
  const postEmission = join(temp, "PostPreparation.mjs");
  execFileSync("taskset", ["-c", "10", "bend", join(import.meta.dirname, "../../../packages/resident-runtime/src/resident/review-work/preparation/PostPreparation.bend"), "-o", postEmission], {
    timeout: 5000
  });
  const postCore = (await import(pathToFileURL(postEmission))).default,
    postMachine = createPostPreparationMachine(postCore),
    tailMachine = createAdviceTailMachine(postCore);
  let cases = 0,
    requests = 0,
    postRequests = 0;
  for (const testCase of selectedScenarios) {
    const {
      name: mode,
      fixture,
      expected,
      compareNative
    } = testCase;
    const owned = mode.startsWith("retention-owned-"),
      postSessions = new Map(),
      currentPath = fixture.path;
    const connection = {
        ...initial(),
        preparationObservation: {
          root,
          rootIdentity,
          advicee: advicee(),
          candidates: [{
            operation: "add",
            path: currentPath
          }]
        }
      },
      registry = createServiceRegistry(),
      cache = new Map(),
      _rootCaptures = new Map(),
      _selections = new Map();
    let parentInvocation,
      cancelled = false,
      roots = 0,
      physicalLateSuccess = 0;
    const context = {
      root,
      rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY,
      branch: "type",
      limits: GRAPH_LIMIT_CEILINGS,
      now: () => 0,
      captureCache: cache,
      captureSource: (...args) => captureStable(...args).pipe(Effect.tap(result => Effect.sync(() => {
        if (cancelled && result.status === "captured") physicalLateSuccess++;
      })), Effect.flatMap(result => mode === "parent-cancel-late-rejection" && cancelled ? Effect.fail(new Error("injected native late capture failure")) : Effect.succeed(result)))
    };
    const _snapshotCaptures = () => list([...cache].map(([path, capture], index) => ({
      $: "Capture",
      path,
      handle: BigInt(index + 1),
      text: capture.text,
      content_hash: capture.contentHash,
      bytes: BigInt(capture.byteLength)
    })));
    let duplicateChecked = false,
      reuseFaultInjected = false,
      originalCleanupFailure = false;
    const driver = createOwnedArtifactDriver({
      owner,
      control: connection.control,
      scope,
      artifacts,
      registry,
      hooks: {
        beforeInstall: ({
          invocation
        }) => {
          if (mode === "retention-owned-preinstall-cancel" && postSessions.has(Number(invocation))) driver.cancel(invocation);
        }
      },
      selectMachine: input => {
        if (input.postPreparation && mode === "retention-owned-constructor-fault") throw new Error("injected post machine construction failure");
        return input.preparation ? preparationMachine : input.postPreparation ? postMachine : input.adviceTail ? tailMachine : undefined;
      },
      foreign: async ([request], options) => {
        requests++;
        if (postSessions.has(Number(request.invocation))) {
          postRequests++;
          const postSession = postSessions.get(Number(request.invocation));
          if (mode === "retention-owned-duplicate-active" && !duplicateChecked) {
            duplicateChecked = true;
            const before = Effect.runSync(connection.transaction.read),
              resources = driver.resources;
            await assert.rejects(driver.driveHandoff(connection.owned.receipt, postSession, () => postSession.input), /Session already owned/);
            assert.strictEqual(Effect.runSync(connection.transaction.read), before);
            assert.deepEqual(driver.resources, resources);
          }
          const faultCommand = {
            "retention-owned-fault-reuse-claim": "LookupReuse",
            "retention-owned-fault-clear-register": "RegisterClear",
            "retention-owned-fault-clear-release": "ReleaseClear",
            "retention-owned-fault-joined-append": "AppendJoined",
            "retention-owned-fault-clear-shared-release": "ReleaseClear"
          }[mode];
          if (mode === "retention-owned-cached-finding-standalone-cutoff" || mode === "retention-owned-cached-finding-standalone-insert-ack") return postSession.perform(request, {
            ...options,
            afterCommit: command => {
              if (command.$ === "InsertCachedAdvice" && !reuseFaultInjected) {
                reuseFaultInjected = true;
                if (mode.endsWith("-cutoff")) driver.cancel(request.invocation);else throw new Error("injected cached insert acknowledgement loss");
              }
            }
          });
          if (mode === "retention-owned-fault-clear-cleanup-receipt") return postSession.perform(request, {
            ...options,
            beforeCommand: command => {
              if (command.$ === "ReleaseClear" && !originalCleanupFailure) {
                originalCleanupFailure = true;
                throw new Error("injected original clear release failure");
              }
            },
            afterCommit: (command, publication) => {
              if (command.$ === "Cleanup" && publication.releasedAcquisition !== undefined && !reuseFaultInjected) {
                reuseFaultInjected = true;
                throw new Error("injected cleanup release action sink failure");
              }
            }
          });
          if (faultCommand) return postSession.perform(request, {
            ...options,
            afterCommit: command => {
              if (!reuseFaultInjected && command.$ === faultCommand) {
                reuseFaultInjected = true;
                throw new Error("injected reuse commit acknowledgement loss");
              }
            }
          });
          return postSession.perform(request, mode === "retention-owned-joined-pending-restore-fault" ? {
            ...options,
            afterPendingRestore: () => {
              throw new Error("injected pending restore acknowledgement loss");
            }
          } : options);
        }
        const adviceSession = registry.get(Number(request.invocation));
        if (adviceSession?.input?.adviceTail) {
          postRequests++;
          return adviceSession.perform(request, options);
        }
        if (request.operation) {
          const session = registry.get(Number(request.invocation));
          if (mode.startsWith("parent-cancel") && !cancelled && request.operation.$ === "Types.CaptureSource") {
            const pending = session.perform(request, {
              ...options,
              signal: undefined
            });
            cancelled = true;
            driver.cancel(parentInvocation);
            const reply = await pending;
            if (mode === "parent-cancel-late-rejection") throw new Error("late capture provider fault");
            return pureReply(reply);
          }
          return pureReply(await session.perform(request, options));
        }
        return preparationForeign(request, options);
      }
    });
    // One action sink and one resource dispatcher for both parent and resolver.
    const preparationForeign = createPreparationForeign({
      connection,
      owner,
      driver,
      registry,
      root,
      rootIdentity,
      context,
      cache,
      mode,
      onRoot: () => {
        roots++;
      }
    });
    connection.attachDriver(driver);
    parentInvocation = owned ? driver.allocatePreparationInvocation() : driver.allocateInvocation();
    const session = {
      invocation: parentInvocation,
      revoke() {},
      close() {}
    };
    const limits = {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      version: 1n,
      ...Object.fromEntries(Object.entries(GRAPH_LIMIT_CEILINGS).map(([key, value]) => [{
        sourceBytes: "source_bytes",
        treeBytes: "tree_bytes",
        readBytes: "read_bytes",
        outgoingEdges: "outgoing_edges"
      }[key] ?? key, BigInt(value)]))
    };
    const preparationInput = {
      $: "Input",
      candidates: list([{
        $: "Candidate",
        path: currentPath,
        operation: {
          $: "CandidateAdd"
        },
        added_lines: list([])
      }]),
      contracts: list(fixture.contracts),
      limits,
      frozen: none,
      line: none,
      verified: none,
      native_patch: none,
      advicee_host: "codex",
      before_analyze: true
    };
    let outcome = await driver.drive(session, {
      invocation: BigInt(parentInvocation),
      preparation: preparationInput
    });
    if (owned) {
      const receipt = outcome;
      outcome = driver.handoffResult(receipt);
      connection.owned = {
        driver,
        receipt,
        postSessions,
        startPreparation: async preparation => {
          connection.preparation = preparation;
          const invocation = driver.allocatePreparationInvocation({
            ...scope,
            preparation: BigInt(preparation.operation)
          });
          const sourceSession = {
            invocation,
            revoke() {},
            close() {}
          };
          const nextReceipt = await driver.drive(sourceSession, {
            invocation: BigInt(invocation),
            preparation: preparationInput
          });
          const result = driver.handoffResult(nextReceipt);
          connection.owned.receipt = nextReceipt;
          return result.preparation;
        }
      };
    }
    if (mode.startsWith("parent-cancel")) {
      assert.ok(outcome.failure);
      assert.equal(roots, 1);
      assert.equal(physicalLateSuccess, 1);
      assert.equal(driver.stats.accepted, 0);
    } else {
      assert.ok(outcome.preparation);
      assert.equal(outcome.preparation.selected, expected.selected, mode + " selected declarations");
      assert.equal(unlist(outcome.preparation.units).length, expected.units, mode + " prepared units");
      if (compareNative) {
        const expected = await Effect.runPromise(prepareObservation({
          root,
          rootIdentity,
          advicee: advicee(),
          candidates: [{
            operation: "add",
            path: currentPath
          }]
        }, {
          settings: {
            rules: configuredRules
          },
          policy: DEFAULT_DIRECT_FILE_POLICY,
          ...(fixture.contracts.length === 1 ? {
            inputContract: TYPE_INPUT_CONTRACT
          } : {})
        }));
        assert.equal(expected.observation.status, "complete");
        assert.deepEqual(decodePreparationResult(outcome.preparation, advicee()), expected);
        assert.deepEqual(unlist(outcome.preparation.units).map(fromProductValue), expected.observation.changeSet.units);
        const actualReady = unlist(outcome.preparation.outcomes).filter(value => value.$ === "OutcomeReady").map(value => fromProductValue(value.prepared));
        assert.ok(actualReady.length > 0, "actual prepared input is produced");
        assert.deepEqual(actualReady, expected.outcomes.filter(value => value.status === "ready").map(({
          prepared
        }) => {
          const {
            advicee: _ignored,
            ...source
          } = prepared;
          return source;
        }));
      }
      if (mode.startsWith("retention-")) {
        await consumeRetainedPreparation(connection, outcome.preparation, root, rootIdentity, mode);
      } else {
        // Only complete preparation terminal converts capacity; child terminal does not.
        const completed = Effect.runSync(connection.bridge.native((draft, records) => [completePreparation(draft, "agent", connection.preparation.operation, connection.preparation.reservation, unlist(outcome.preparation.units).map(() => 100), connection.round), records])).value;
        assert.equal(completed.length, unlist(outcome.preparation.units).length);
      }
    }
    if (mode === "retention-owned-duplicate-active") assert.equal(duplicateChecked, true);
    if (mode.includes("-fault-reuse-") || mode.includes("-fault-clear-") || mode.includes("-fault-joined-")) assert.equal(reuseFaultInjected, true);
    assert.equal(driver.stats.providerStarts, driver.stats.providerCleanups);
    assert.deepEqual(driver.resources, {
      payloads: 0,
      leases: 0,
      sessions: 0,
      artifactStates: 0,
      launches: 0
    });
    assert.equal(registry.size, 0);
    assert.equal(registry.pendingCleanup, 0);
    const rootFds = await Promise.all((await readdir("/proc/self/fd")).map(fd => readlink("/proc/self/fd/" + fd).catch(() => "")));
    assert.equal(rootFds.filter(path => path === root || path.startsWith(root + "/")).length, 0);
    cases++;
  }
  console.log(JSON.stringify({
    passed: true,
    cases,
    requests,
    postRequests,
    nativePostPreparationSource,
    scope: "actual resident transaction, capacity resize/completion, emitted preparation progression and nested split resolver with native Python/TypeScript IO and full native preparation differential for successful branches; parent cancellation/late success/rejection and first semantic refusal; actual native preflight/workspace sizing/prepared input policy children; actual post-preparation admission/planning, revision/claims/spawn/enqueue and three post-acceptance cancellation barriers plus owner-claim and pre-spawn exceptions with guaranteed cleanup; native policy deletion, source-free Canonical progression and production adoption remain open"
  }));
} finally {
  await rm(temp, {
    recursive: true,
    force: true
  });
}
