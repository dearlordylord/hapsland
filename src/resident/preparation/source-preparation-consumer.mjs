import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, lstat, rm, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Exit from "effect/Exit";
import { initialCanonical, projectCanonical } from "@hapsland/canonical-policy/canonical/adapter";
import { residentTransaction } from "../../../packages/resident-runtime/src/resident/state/resident/transaction.ts";
import { residentCapacity } from "../../../packages/resident-runtime/src/resident/state/resident/capacity.ts";
import { GRAPH_LIMIT_CEILINGS } from "../../../packages/canonical-policy/dist/canonical/graph-limits.js";
import { DEFAULT_DIRECT_FILE_POLICY } from "../../../packages/native-observation/dist/direct-event/selection.js";
import { captureStable } from "../../../packages/native-observation/dist/direct-event/capture.js";
import { prepareObservation } from "@hapsland/review-execution/direct-event/pipeline";
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets";
import { effectiveGraphLimits } from "@hapsland/runtime-inputs/configuration/resolve";
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config";
import { nativeSourceReference, snapshotSourceOwnership, captureActivityPublications, snapshotReservationCustody } from "./native-source-reference.mjs";
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules";
import { createServiceRegistry, list, unlist as __unlist } from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs";
import { pureReply } from "../../../packages/source-analysis/src/direct-event/graph-resolution/consumer.mjs";
import { createResidentOwnerTransaction } from "../../../packages/resident-runtime/src/resident/state/resolver-custody/resident-owner-transaction.mjs";
import { createOwnedArtifactDriver } from "../../../packages/resident-runtime/src/resident/review-work/composition/owned-artifact-driver.mjs";
import { createPreparationMachine } from "../../../packages/review-execution/src/direct-event/preparation/preparation-dispatcher.mjs";
import { createSourcePreparationMachine } from "../../../packages/resident-runtime/src/resident/review-work/preparation/source-preparation-dispatcher.mjs";
import { createPostPreparationMachine, createAdviceTailMachine } from "../../../packages/resident-runtime/src/resident/review-work/preparation/post-preparation-dispatcher.mjs";
import { createResidentRetentionContext } from "./resident-retention-context.mjs";
import { createPreparationForeign } from "../../../packages/resident-runtime/src/resident/review-work/composition/preparation-foreign.mjs";
import { createSourcePreparationProvider } from "../../../packages/resident-runtime/src/resident/review-work/preparation/source-preparation-provider.mjs";
const run = Effect.runSync,
  temp = await mkdtemp("/tmp/hapsland-source-composition-");
try {
  const modules = {};
  for (const name of ["ArtifactComposition", "GenericArtifact", "PythonArtifact", "CanonicalResolverOwner", "Preparation", "PostPreparation", "SourcePreparation"]) {
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
    modules[name] = (await import(pathToFileURL(emitted))).default;
  }
  const owner = modules.CanonicalResolverOwner,
    artifacts = {
      composition: modules.ArtifactComposition,
      parent: modules.GenericArtifact,
      python: modules.PythonArtifact
    };
  const machines = {
    source: createSourcePreparationMachine(modules.SourcePreparation),
    preparation: createPreparationMachine(modules.Preparation),
    post: createPostPreparationMachine(modules.PostPreparation),
    tail: createAdviceTailMachine(modules.PostPreparation)
  };
  const root = join(temp, "fixture");
  await mkdir(root);
  execFileSync("git", ["init", "-q", root], {
    timeout: 5000
  });
  await writeFile(join(root, "first.py"), "from leaf import Foo\nclass First:\n field: Foo\n");
  await writeFile(join(root, "second.py"), "from leaf import Foo\nclass Second:\n field: Foo\n");
  await writeFile(join(root, "empty.py"), "value = 1\n");
  await writeFile(join(root, "leaf.py"), "class Foo:\n value: str\n");
  await writeFile(join(root, "multi.py"), "from leaf import Foo\nclass First:\n field: Foo\nclass Second:\n field: Foo\n");
  const a = await lstat(root),
    b = await lstat(join(root, ".git")),
    rootIdentity = {
      rootDevice: String(a.dev),
      rootInode: String(a.ino),
      gitDirectory: join(root, ".git"),
      gitDevice: String(b.dev),
      gitInode: String(b.ino)
    };
  await writeFile(join(root, "comment.ts"), '// updated outside declarations\nexport class Example { value: string = "x" }\nexport function identity(value: string): string { return value }\n');
  let cases = 0,
    totalRequests = 0,
    nativeWholeCases = 0;
  const modes = ["two-candidates", "repeat-candidate", "refused-second", "admission-ack-loss", "completion-ack-loss", "after-prepare-failure", "after-prepare-analytics-failure", "after-prepare-release-ack-loss", "after-prepare-runtime-inactive", "cancel-between-candidates", "first-preparation-failure", "second-preparation-failure", "source-cleanup-pending", "post-finalizer-cause", "full-workflow", "full-repeat", "full-refused-second", "full-owner-barrier-failure", "full-no-ready", "full-comment-update", "full-capture-failure", "full-inspection-failure", "full-inspection-diagnostic-failure", "full-activity-refused", "full-mixed-cause", "full-register-defect-cleanup", "full-register-failure-cleanup", "full-multi-register-cleanup", "full-backend-fail", "full-backend-die", "full-backend-mixed", "full-backend-interrupt", "full-backend-fail-interrupt", "full-backend-all", "full-backend-recovery-fail", "full-backend-recovery-die", "full-backend-recovery-interrupt", "full-credential-die", "full-after-prepare-interrupt", "gates-controlled", "gates-shape", "gates-root", "gates-generation", "gates-backend-failure", "gates-runtime-first", "gates-runtime-second", "gates-job-inactive", "gates-start-policy", "gates-start-observation", "gates-start-ack"];
  for (const mode of modes.filter(mode => !process.env.HAPSLAND_SOURCE_CASE || mode === process.env.HAPSLAND_SOURCE_CASE)) {
    const fullEntry = mode.startsWith("full-") || mode.startsWith("gates-"),
      gateRefusal = mode.startsWith("gates-");
    const limits = {
      globalItems: 100,
      globalBytes: 100000000,
      partitionItems: 16,
      partitionBytes: 100000000
    };
    const initial = {
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
        }
      }
    };
    const transaction = residentTransaction(run(Ref.make(initial)), "physical"),
      capacity = residentCapacity(transaction);
    const partition = run(capacity.partitionId("agent")),
      round = run(capacity.roundId("agent")),
      observationId = run(capacity.admitObservation("agent", round));
    if (!fullEntry) assert.equal(run(capacity.observation("agent", observationId, "startObservation", round)), true);
    let driver;
    const injectedPreparationError = new Error("injected original preparation failure"),
      injectedAdmissionError = new Error("injected source admission acknowledgement loss"),
      injectedDiagnosticError = new Error("injected panic diagnostic failure");
    let finalizerAckLost = false,
      finalizerFailed = false;
    const backendCause = mode.startsWith("full-backend-") ? {
      fail: Cause.fail(injectedPreparationError),
      die: Cause.die(injectedPreparationError),
      mixed: Cause.combine(Cause.fail(injectedPreparationError), Cause.die(injectedDiagnosticError)),
      interrupt: Cause.interrupt(42),
      "fail-interrupt": Cause.combine(Cause.fail(injectedPreparationError), Cause.interrupt(42)),
      all: Cause.combine(Cause.combine(Cause.fail(injectedPreparationError), Cause.die(injectedDiagnosticError)), Cause.interrupt(42))
    }[mode.startsWith("full-backend-recovery-") ? "fail" : mode.slice("full-backend-".length)] : undefined;
    const credentialCause = mode === "full-credential-die" ? Cause.die(injectedPreparationError) : undefined,
      afterPrepareCause = mode === "full-after-prepare-interrupt" ? Cause.interrupt(44) : undefined;
    const backendRecoveryCause = mode === "full-backend-recovery-fail" ? Cause.fail(injectedDiagnosticError) : mode === "full-backend-recovery-die" ? Cause.die(injectedDiagnosticError) : mode === "full-backend-recovery-interrupt" ? Cause.interrupt(43) : undefined;
    const analyticsCause = mode === "full-mixed-cause" ? Cause.combine(Cause.fail(injectedPreparationError), Cause.die(injectedDiagnosticError)) : undefined;
    const registerWorkFailure = mode === "full-register-defect-cleanup" ? "defect" : mode === "full-register-failure-cleanup" ? "failure" : mode === "full-multi-register-cleanup" ? "multi" : undefined,
      registerWorkError = injectedPreparationError,
      cleanupError = injectedDiagnosticError;
    const outputs = [],
      commands = [],
      caches = [],
      preparationIds = [],
      sourceEffects = [];
    const bridge = createResidentOwnerTransaction({
      owner,
      transaction,
      validateAdviceInput: (origin, handle) => driver?.validateAdviceInput(origin, handle) === true,
      onActions: actions => Effect.sync(() => driver.acceptActions(actions))
    });
    const connection = {
      transaction,
      bridge,
      control: bridge.control,
      partition,
      round,
      postCore: modules.PostPreparation
    };
    const registry = createServiceRegistry();
    driver = createOwnedArtifactDriver({
      owner,
      control: bridge.control,
      artifacts,
      registry,
      hooks: {
        canonicalOutputs: items => outputs.push(...items)
      },
      selectMachine: input => input.sourcePreparation ? machines.source : input.preparation ? machines.preparation : input.postPreparation ? machines.post : input.adviceTail ? machines.tail : undefined,
      foreign: async ([request], options) => {
        totalRequests++;
        const session = registry.get(Number(request.invocation));
        if (request.operation) return pureReply(await session.perform(request, options));
        commands.push({
          invocation: request.invocation,
          command: request.command.$,
          candidate: request.command.candidate
        });
        if (session.input?.sourcePreparation) {
          return session.perform(request, {
            ...options,
            beforeCommand: command => {
              if (mode === "after-prepare-analytics-failure" && command.$ === "RecordPreparationFailureAnalytics") throw new Error("secondary recovery analytics failure");
              if (mode === "after-prepare-runtime-inactive" && command.$ === "ReadRuntimeActive") run(context.deps.residentLedger.runtime.close());
              if (mode === "gates-start-observation" && command.$ === "StartObservation") assert.equal(run(capacity.observation("agent", observationId, "startObservation", round)), true);
              if (mode === "cancel-between-candidates" && command.$ === "CheckCandidateActive" && command.candidate === 2n) driver.cancel(request.invocation);
            },
            afterCommit: (command, publication) => {
              if (mode === "after-prepare-release-ack-loss" && command.$ === "ReleaseJobReservation") throw new Error("secondary source release acknowledgement loss");
              if (mode === "gates-start-ack" && command.$ === "StartObservation") throw injectedPreparationError;
              if (command.$ === "CompleteObservation") outputs.push(...publication.outputs);
              if (["admission-ack-loss", "source-cleanup-pending"].includes(mode) && command.$ === "AdmitCandidateWorkspace" && command.candidate === 2n) throw injectedAdmissionError;
              if (mode === "completion-ack-loss" && command.$ === "CompleteObservation") throw new Error("injected observation completion acknowledgement loss");
            }
          });
        }
        if ((mode === "first-preparation-failure" && caches.length === 1 || mode === "second-preparation-failure" && caches.length === 2) && session.input?.preparation && request.command.$ === "CaptureSource") throw injectedPreparationError;
        if (mode === "post-finalizer-cause" && session.input?.postPreparation) return session.perform(request, {
          ...options,
          afterCommit: (command, publication) => {
            options.afterCommit?.(command, publication);
            if (command.$ === "RegisterRevision" && !finalizerAckLost) {
              finalizerAckLost = true;
              throw injectedPreparationError;
            }
          }
        });
        return session.perform(request, options);
      }
    });
    connection.owned = {
      driver
    };
    const candidates = mode === "full-comment-update" ? [{
      operation: "update",
      path: "comment.ts",
      addedLines: ["// updated outside declarations"]
    }, {
      operation: "update",
      path: "comment.ts",
      addedLines: ["// updated outside declarations"]
    }] : [{
      operation: "add",
      path: ["full-no-ready", "full-mixed-cause"].includes(mode) ? "empty.py" : mode === "full-multi-register-cleanup" ? "multi.py" : "first.py"
    }, {
      operation: "add",
      path: ["full-no-ready", "full-mixed-cause"].includes(mode) ? "empty.py" : ["repeat-candidate", "full-repeat"].includes(mode) ? "first.py" : "second.py"
    }];
    const nativePatchCommand = mode === "full-comment-update" ? '*** Begin Patch\n*** Update File: comment.ts\n@@\n-// old comment\n+// updated outside declarations\n export class Example { value: string = "x" }\n*** End Patch' : undefined;
    const shared = await createResidentRetentionContext(connection, root, rootIdentity, {
      useOwned: true,
      observation: {
        root,
        rootIdentity,
        advicee: undefined,
        candidates,
        ...(nativePatchCommand === undefined ? {} : {
          nativePatchCommand
        })
      }
    });
    shared.observation.advicee = shared.identity;
    if (mode.startsWith("full-")) shared.context.job.dispatch.activityPath = join(root, mode === "full-activity-refused" ? ".bend-activity-refused" : ".bend-activity");
    if (mode === "full-activity-refused") await writeFile(shared.context.job.dispatch.activityPath, "blocked directory");
    if (fullEntry) {
      const credentials = await import("../../../packages/resident-runtime/src/resident/authorization/credentials.ts");
      shared.context.job.dispatch.controlled = {};
      if (mode === "gates-controlled") shared.context.job.dispatch.controlled = {
        unknownProperty: true
      };
      if (mode === "gates-shape") shared.context.job.dispatch.controlled = null;
      if (mode === "gates-root") shared.observation.rootIdentity = {
        ...rootIdentity,
        rootInode: "0"
      };
      if (mode === "gates-generation") {
        shared.context.job.dispatch.controlled = {
          requireCredential: true
        };
        shared.context.job.settings.credentialEnvVar = "HAPSLAND_FIXTURE";
        shared.context.job.dispatch.credential = {
          name: "HAPSLAND_FIXTURE",
          statePath: join(temp, "absent-credential-state"),
          generation: 999
        };
      }
      if (mode === "gates-start-policy") shared.context.job.workObservationId = 999;
      shared.context.job.settings.configuration.policy.layers = [];
      Object.assign(shared.context.deps, {
        residentCredentialRequired: credentials.residentCredentialRequired,
        residentCredentialShapeMatches: credentials.residentCredentialShapeMatches,
        residentCredentialGenerationCurrent: credentials.residentCredentialGenerationCurrent,
        residentAwaitBackendGate: () => mode === "gates-backend-failure" ? Effect.fail(injectedPreparationError) : mode === "gates-runtime-first" ? shared.ledger.runtime.close() : Effect.void
      });
    }
    const {
      context,
      ledger,
      lifecycle,
      scope,
      hold
    } = shared;
    if (mode.startsWith("full-")) context.job.settings = {
      ...(await Effect.runPromise(loadReviewSettings(root, {
        userConfigPath: join(temp, "absent-user.jsonc"),
        projectConfigPath: join(root, "absent-project.jsonc")
      }))),
      rules: configuredRules
    };
    context.job.reservation = run(capacity.reserve("agent", 32, "observationDispatch"));
    assert.ok(context.job.reservation);
    if (mode === "post-finalizer-cause") {
      const releaseRevision = context.deps.residentReleaseCurrentWork;
      context.deps.residentReleaseCurrentWork = (...args) => releaseRevision(...args).pipe(Effect.tap(() => Effect.sync(() => {
        if (!finalizerFailed) {
          finalizerFailed = true;
          throw injectedDiagnosticError;
        }
      })));
    }
    if (credentialCause) context.deps.residentCredentialShapeMatches = () => {
      sourceEffects.push({
        kind: "credential-shape"
      });
      throw injectedPreparationError;
    };
    if (afterPrepareCause) context.deps.residentPreparationControls = {
      ...context.deps.residentPreparationControls,
      afterPrepare: Effect.failCause(afterPrepareCause)
    };
    if (backendCause) context.deps.residentAwaitBackendGate = () => Effect.sync(() => sourceEffects.push({
      kind: "backend"
    })).pipe(Effect.andThen(Effect.failCause(backendCause)));
    if (mode === "gates-runtime-second") {
      const generation = context.deps.residentCredentialGenerationCurrent;
      context.deps.residentCredentialGenerationCurrent = (...args) => {
        const current = generation(...args);
        run(ledger.runtime.close());
        return current;
      };
    }
    if (mode === "gates-job-inactive") context.deps.residentJobActive = () => Effect.succeed(false);
    let admissionCalls = 0,
      cleanupFails = mode === "source-cleanup-pending",
      claimReleased = false;
    if (mode === "source-cleanup-pending") {
      const release = ledger.release;
      ledger.release = reservation => cleanupFails && context.activeWorkspaces.has(reservation) ? Effect.fail(new Error("injected workspace release failure")) : release(reservation);
      assert.equal(run(context.deps.residentReuse.claim("cleanup-extra-claim")), true);
      context.unassignedClaims.add("cleanup-extra-claim");
      const releaseClaim = context.deps.residentReleaseReuseClaim;
      context.deps.residentReleaseReuseClaim = key => releaseClaim(key).pipe(Effect.tap(() => Effect.sync(() => {
        if (key === "cleanup-extra-claim") claimReleased = true;
      })));
    }
    if (["refused-second", "full-refused-second"].includes(mode)) {
      const begin = ledger.beginObservedPreparation;
      ledger.beginObservedPreparation = (partition, observation, bytes, round) => begin(partition, observation, ++admissionCalls === 2 ? 200000000 : bytes, round);
    }
    if (mode === "full-owner-barrier-failure") context.deps.residentPreparationControls = {
      ...context.deps.residentPreparationControls,
      afterReuseBoundary: phase => phase === "ownerClaimed" ? Effect.fail(new Error("injected owner barrier failure")) : Effect.void
    };
    if (mode.startsWith("after-prepare-")) context.deps.residentPreparationControls = {
      ...context.deps.residentPreparationControls,
      afterPrepare: Effect.fail(new Error("injected preparation barrier failure"))
    };
    if (mode.startsWith("full-")) {
      const begin = context.deps.residentLedger.beginObservedPreparation;
      context.deps.residentLedger.beginObservedPreparation = (partition, observation, bytes, round) => begin(partition, observation, bytes, round).pipe(Effect.tap(value => Effect.sync(() => sourceEffects.push({
        kind: "admission",
        bytes,
        status: value.status
      }))));
      context.deps.residentRecordAnalytics = (_job, event, findings) => Effect.sync(() => sourceEffects.push({
        kind: "analytics",
        event,
        ...(findings === undefined ? {} : {
          findings
        })
      })).pipe(Effect.andThen(backendRecoveryCause && event === "preparation-failed" ? Effect.failCause(backendRecoveryCause) : analyticsCause && event === "incomplete-candidate" ? Effect.failCause(analyticsCause) : Effect.void));
      context.deps.residentInspection = {
        ...context.deps.residentInspection,
        observePreparation: (_job, value) => {
          sourceEffects.push({
            kind: "prepared",
            value
          });
          if (mode.startsWith("full-inspection-")) throw injectedPreparationError;
        },
        observeDiagnostic: (_receipt, path, _candidate, value) => {
          sourceEffects.push({
            kind: "diagnostic",
            path,
            value,
            custody: snapshotReservationCustody(run(transaction.read))
          });
          if (mode === "full-inspection-diagnostic-failure") throw injectedDiagnosticError;
        }
      };
    }
    if (registerWorkFailure) {
      let workFailed = false,
        cleanupFailed = false,
        claimsReleased = 0;
      const policyWork = context.deps.residentLedger.rounds.policyWork,
        release = context.deps.residentLedger.release,
        releaseRevision = context.deps.residentReleaseCurrentWork;
      context.deps.residentLedger.rounds.policyWork = (...args) => !workFailed && run(transaction.read).records.revision.current.size > 0 ? (workFailed = true, Effect.failCause(registerWorkFailure === "defect" ? Cause.die(registerWorkError) : Cause.fail(registerWorkError))) : policyWork(...args);
      context.deps.residentReleaseCurrentWork = (...args) => {
        const revision = run(transaction.read).records.revision.current.get(args[0].subject);
        assert.equal(revision.token, args[0].token);
        return releaseRevision(...args).pipe(Effect.tap(() => Effect.sync(() => sourceEffects.push({
          kind: "release-revision",
          subject: args[0].subject,
          generation: args[0].generation,
          inputIdentity: revision.inputIdentity
        }))));
      };
      if (registerWorkFailure === "multi") {
        const releaseClaim = context.deps.residentReleaseReuseClaim;
        context.deps.residentReleaseReuseClaim = (key, ...args) => {
          const held = run(transaction.read).records.reuse.pending.has(key);
          return releaseClaim(key, ...args).pipe(Effect.tap(() => Effect.sync(() => {
            if (held && !run(transaction.read).records.reuse.pending.has(key)) {
              sourceEffects.push({
                kind: "release-claim",
                key
              });
              if (++claimsReleased === 2 && !cleanupFailed) {
                cleanupFailed = true;
                throw cleanupError;
              }
            }
          })));
        };
      }
      context.deps.residentLedger.release = reservation => {
        const retained = run(transaction.read).reservations.get(reservation.id),
          unit = retained?.purpose === "reviewUnit";
        return release(reservation).pipe(Effect.tap(released => Effect.sync(() => {
          if (unit && released) {
            sourceEffects.push({
              kind: "release-unit",
              id: reservation.id
            });
            if (registerWorkFailure !== "multi" && workFailed && !cleanupFailed) {
              cleanupFailed = true;
              throw cleanupError;
            }
          }
        })));
      };
    }
    const sourceGraphLimits = mode.startsWith("full-") ? effectiveGraphLimits(context.job.settings.configuration.policy) : GRAPH_LIMIT_CEILINGS;
    const bendLimits = {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      version: 1n,
      ...Object.fromEntries(Object.entries(sourceGraphLimits).map(([key, value]) => [{
        sourceBytes: "source_bytes",
        treeBytes: "tree_bytes",
        readBytes: "read_bytes",
        outgoingEdges: "outgoing_edges"
      }[key] ?? key, BigInt(value)]))
    };
    const invocation = driver.allocateSourceInvocation({
      $: "SourceScope",
      partition: BigInt(partition),
      lifetime: 1n,
      round: BigInt(round),
      observation: BigInt(observationId),
      permission: {
        $: "SourceNew"
      }
    });
    const source = createSourcePreparationProvider(BigInt(invocation), context, {
      owner,
      bridge,
      driver,
      candidates,
      entry: fullEntry ? "full" : "after-gates",
      buildPreparationSession: async (invocation, candidate, preparation) => {
        preparationIds.push(preparation.operation);
        const cache = new Map();
        caches.push(cache);
        const preparationContext = {
          root,
          rootIdentity,
          policy: DEFAULT_DIRECT_FILE_POLICY,
          branch: "type",
          limits: sourceGraphLimits,
          now: () => 0,
          captureCache: cache,
          captureSource: mode.startsWith("full-") ? (root, selected, ...args) => (mode === "full-capture-failure" ? Effect.sync(() => sourceEffects.push({
            kind: "capture-failure",
            path: selected.relativePath
          })).pipe(Effect.andThen(Effect.fail(injectedPreparationError))) : captureStable(root, selected, ...args)).pipe(Effect.tap(value => Effect.sync(() => sourceEffects.push({
            kind: "capture",
            path: selected.relativePath,
            status: value.status,
            ...(value.status === "captured" ? {
              contentHash: value.capture.contentHash,
              bytes: value.capture.byteLength
            } : {
              diagnostic: value.diagnostic
            })
          })))) : captureStable
        };
        const foreign = createPreparationForeign({
          connection: {
            ...connection,
            preparation
          },
          owner,
          driver,
          registry,
          root,
          rootIdentity,
          context: preparationContext,
          cache,
          ...(mode.startsWith("full-") ? {
            settings: context.job.settings,
            graphLimits: sourceGraphLimits,
            residentContext: context,
            compareRoots: false,
            onMaterialization: event => sourceEffects.push(event)
          } : {})
        });
        return {
          invocation,
          revoke() {},
          close() {},
          perform: foreign,
          input: {
            invocation: BigInt(invocation),
            preparation: {
              $: "Input",
              candidates: list([{
                $: "Candidate",
                path: candidate.path,
                operation: {
                  $: candidate.operation === "update" ? "CandidateUpdate" : "CandidateAdd"
                },
                added_lines: list(candidate.addedLines ?? [])
              }]),
              contracts: list([{
                $: "PreparationSelection.TypeContract"
              }, ...(mode.startsWith("full-") ? [{
                $: "PreparationSelection.FunctionContract"
              }] : [])]),
              limits: bendLimits,
              frozen: {
                $: "None"
              },
              line: {
                $: "None"
              },
              verified: {
                $: "None"
              },
              native_patch: nativePatchCommand === undefined ? {
                $: "None"
              } : {
                $: "Some",
                value: nativePatchCommand
              },
              advicee_host: "codex",
              before_analyze: true
            }
          }
        };
      }
    });
    try {
      let result;
      const activity = mode.startsWith("full-") ? captureActivityPublications(context.job.dispatch.activityPath, sourceEffects) : undefined;
      try {
        result = await driver.drive(source, source.input, {
          signal: context.preparationSignal
        });
      } catch (error) {
        if (mode !== "source-cleanup-pending") throw error;
        assert.ok(error instanceof AggregateError);
        assert.strictEqual(error.cause, injectedAdmissionError);
        assert.equal(claimReleased, true, "other exact obligations attempted despite failed workspace release");
        assert.equal(context.unassignedClaims.size, 0);
        assert.equal(context.activeWorkspaces.size, 1);
        assert.equal(registry.pendingCleanup, 1);
        await assert.rejects(registry.retryCleanup(), /cleanup obligations remain pending/);
        assert.equal(registry.pendingCleanup, 1);
        cleanupFails = false;
        await registry.retryCleanup();
        assert.equal(registry.pendingCleanup, 0);
        assert.equal(context.activeWorkspaces.size, 0);
        result = {
          completed: false,
          reason: {
            $: "DefectFailure",
            token: 1n
          }
        };
      } finally {
        activity?.close();
      }
      if (mode === "post-finalizer-cause") {
        assert.equal(finalizerAckLost, true);
        assert.equal(finalizerFailed, true);
        assert.equal(registry.pendingCleanup, 1);
        await registry.retryCleanup();
        assert.equal(registry.pendingCleanup, 0);
      }
      if (mode === "completion-ack-loss") {
        assert.equal(commands.filter(item => item.invocation === BigInt(invocation)).at(-1).command, "CompleteObservation");
      }
      if (mode === "after-prepare-failure") assert.deepEqual(commands.filter(item => item.invocation === BigInt(invocation)).slice(-4).map(item => item.command), ["RecordPreparationFailureAnalytics", "ReleaseJobReservation", "ReadRuntimeActive", "RecordUnavailableActivity"]);
      const recovery = commands.filter(item => item.invocation === BigInt(invocation)).map(item => item.command);
      const recoveryStart = recovery.indexOf("RecordPreparationFailureAnalytics");
      if (mode === "after-prepare-analytics-failure") assert.deepEqual(recovery.slice(recoveryStart), ["RecordPreparationFailureAnalytics"]);
      if (mode === "after-prepare-release-ack-loss") assert.deepEqual(recovery.slice(recoveryStart), ["RecordPreparationFailureAnalytics", "ReleaseJobReservation"]);
      if (mode === "after-prepare-runtime-inactive") assert.deepEqual(recovery.slice(recoveryStart), ["RecordPreparationFailureAnalytics", "ReleaseJobReservation", "ReadRuntimeActive"]);
      const snapshot = run(transaction.read),
        units = [...snapshot.records.dispatch.entries.values()].map(entry => entry.value);
      const interrupted = outputs.filter(output => output.$ === "../../../packages/agent-flow-bend/Canonical.EventEstablished" && output.event.$ === "../../../packages/agent-flow-bend/Canonical.ObservationInterrupted");
      const completed = outputs.filter(output => output.$ === "Canonical.EventEstablished" && output.event.$ === "Canonical.ObservationCompleted");
      const expectedCount = gateRefusal || backendCause || credentialCause || mode === "post-finalizer-cause" || mode === "first-preparation-failure" || mode === "full-owner-barrier-failure" || mode === "full-capture-failure" || mode.startsWith("full-inspection-") || mode === "full-mixed-cause" || registerWorkFailure || ["full-no-ready", "full-comment-update"].includes(mode) ? 0 : ["refused-second", "full-refused-second", "admission-ack-loss", "cancel-between-candidates", "repeat-candidate", "full-repeat", "second-preparation-failure", "source-cleanup-pending"].includes(mode) ? 1 : 2;
      assert.equal(units.length, expectedCount, mode + " retains transferred units");
      assert.equal(snapshot.records.revision.current.size, expectedCount);
      assert.equal(snapshot.records.reuse.pending.size, expectedCount);
      assert.equal(snapshot.reservations.size, expectedCount, "source workspaces released, independent unit reservations retained");
      assert.equal(context.activeWorkspaces.size, 0);
      assert.equal(context.unassignedClaims.size, 0);
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
      if (mode === "full-comment-update" && result.reason?.$ === "TechnicalFailure") throw source.error(result.reason.token);
      assert.equal(caches.length, gateRefusal || backendCause || credentialCause ? 0 : mode === "post-finalizer-cause" || ["refused-second", "full-refused-second"].includes(mode) || mode === "admission-ack-loss" || mode === "source-cleanup-pending" || mode === "cancel-between-candidates" || mode === "first-preparation-failure" || mode === "full-owner-barrier-failure" || mode === "full-capture-failure" || mode.startsWith("full-inspection-") || mode === "full-mixed-cause" || registerWorkFailure ? 1 : 2);
      if (caches.length === 2) {
        assert.notStrictEqual(caches[0], caches[1]);
        assert.notEqual(preparationIds[0], preparationIds[1]);
      }
      if (gateRefusal) {
        assert.equal(result.completed, false);
        assert.equal(result.continued, false);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
        if (mode === "gates-backend-failure" || mode === "gates-start-ack") {
          assert.equal(result.reason.$, mode === "gates-start-ack" ? "DefectFailure" : "TechnicalFailure");
          assert.strictEqual(source.error(result.reason.token), injectedPreparationError);
        } else assert.equal(result.reason.$, mode === "gates-start-policy" || mode === "gates-start-observation" ? "StartRefused" : mode === "gates-runtime-first" || mode === "gates-runtime-second" || mode === "gates-job-inactive" ? "SourceInactive" : "SettingsRefused");
        const gates = commands.filter(item => item.invocation === BigInt(invocation)).map(item => item.command);
        const prefix = ["StartPolicySource", "StartObservation", "AwaitBackendGate"];
        const common = ["ReadRuntimeActive", "DecodeControlled"];
        const checks = {
          "gates-controlled": [],
          "gates-shape": ["ReadCredentialRequired", "CheckCredentialShape"],
          "gates-root": ["ReadCredentialRequired", "CheckCredentialShape", "VerifyObservationRoot"],
          "gates-generation": ["ReadCredentialRequired", "CheckCredentialShape", "VerifyObservationRoot", "CheckCredentialGeneration"]
        };
        if (mode === "gates-start-ack") assert.deepEqual(gates, ["StartPolicySource", "StartObservation"]);else if (mode === "gates-start-observation") assert.deepEqual(gates, ["StartPolicySource", "StartObservation", "ReleaseJobReservation"]);else if (mode === "gates-start-policy") assert.deepEqual(gates, ["StartPolicySource", "ReleaseJobReservation"]);else if (mode === "gates-runtime-first") assert.deepEqual(gates, [...prefix, "ReadRuntimeActive", "ReleaseJobReservation"]);else if (mode === "gates-runtime-second" || mode === "gates-job-inactive") assert.deepEqual(gates, [...prefix, ...common, "ReadCredentialRequired", "CheckCredentialShape", "VerifyObservationRoot", "CheckCredentialGeneration", "ReleaseJobReservation", "ReadRuntimeActive", ...(mode === "gates-job-inactive" ? ["CheckJobActive"] : []), "RecordPreparationFailureAnalytics", "RecordUnavailableActivity"]);else assert.deepEqual(gates, mode === "gates-backend-failure" ? [...prefix, "RecordPreparationFailureAnalytics", "ReleaseJobReservation", "ReadRuntimeActive", "RecordUnavailableActivity"] : [...prefix, ...common, ...checks[mode], "ReleaseJobReservation", "RecordPreparationFailureAnalytics", "RecordUnavailableActivity"]);
      } else if (credentialCause) {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, "DefectFailure");
        assert.strictEqual(Cause.squash(source.cause(result.reason.token)), injectedPreparationError);
        assert.equal(recoveryStart, -1);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
      } else if (afterPrepareCause) {
        assert.equal(result.completed, true);
        assert.equal(result.reason.$, "InvocationCancelled");
        assert.equal(Cause.hasInterrupts(source.cause(result.reason.token)), true);
        assert.equal(recoveryStart, -1);
        assert.equal(interrupted.length, 0);
        assert.equal(completed.length, 1);
      } else if (backendCause) {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, Cause.hasFails(backendRecoveryCause ?? backendCause) ? "TechnicalFailure" : Cause.hasDies(backendRecoveryCause ?? backendCause) ? "DefectFailure" : "InvocationCancelled");
        assert.equal(recoveryStart >= 0, Cause.hasFails(backendCause));
        assert.deepEqual(source.cause(result.reason.token).reasons.map(reason => ({
          kind: reason._tag,
          error: reason.defect ?? reason.error,
          fiberId: reason.fiberId
        })), (backendRecoveryCause ?? backendCause).reasons.map(reason => ({
          kind: reason._tag,
          error: reason.defect ?? reason.error,
          fiberId: reason.fiberId
        })));
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
      } else if (mode === "post-finalizer-cause") {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, "DefectFailure");
        assert.equal(recoveryStart, -1);
        assert.equal(interrupted.length, 1);
        assert.deepEqual(source.cause(result.reason.token).reasons.map(reason => reason.defect), [injectedPreparationError, injectedDiagnosticError]);
      } else if (registerWorkFailure) {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, registerWorkFailure === "defect" ? "DefectFailure" : "TechnicalFailure");
        assert.equal(Cause.hasDies(source.cause(result.reason.token)), true);
        assert.equal(Cause.hasFails(source.cause(result.reason.token)), registerWorkFailure !== "defect");
        assert.equal(source.cause(result.reason.token).reasons.length, 2);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
        assert.equal(recoveryStart >= 0, registerWorkFailure !== "defect");
      } else if (mode === "full-mixed-cause") {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, "TechnicalFailure");
        assert.equal(Cause.hasDies(source.cause(result.reason.token)), true);
        assert.equal(Cause.hasFails(source.cause(result.reason.token)), true);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
        assert.ok(recoveryStart >= 0);
      } else if (mode === "full-owner-barrier-failure") {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, "TechnicalFailure");
        assert.equal(source.error(result.reason.token).operation, "owner claim barrier");
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
      } else if (mode.startsWith("full-inspection-")) {
        if (result.reason.$ === "TechnicalFailure") throw source.error(result.reason.token);
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, "DefectFailure");
        if (mode === "full-inspection-failure") assert.strictEqual(source.error(result.reason.token), injectedPreparationError);
        assert.equal(Cause.hasDies(source.cause(result.reason.token)), true);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
        assert.equal(recoveryStart, -1);
      } else if (mode.endsWith("preparation-failure") || mode === "full-capture-failure") {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, "TechnicalFailure");
        assert.strictEqual(source.error(result.reason.token), injectedPreparationError);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
      } else if (mode === "admission-ack-loss" || mode === "source-cleanup-pending") {
        assert.equal(result.completed, false);
        assert.equal(result.reason.$, "DefectFailure");
        assert.match(String(source.error(result.reason.token)), /admission acknowledgement loss/);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
      } else if (mode === "cancel-between-candidates") {
        assert.ok(result.failure);
        assert.equal(context.job.completed, undefined);
        assert.equal(interrupted.length, 1);
        assert.equal(completed.length, 0);
      } else {
        assert.equal(context.job.completed, true);
        assert.equal(result.completed, true);
        assert.equal(completed.length, 1);
        assert.equal(interrupted.length, 0);
        assert.equal(result.continued, mode !== "completion-ack-loss" && !mode.startsWith("after-prepare-"));
        if (mode === "completion-ack-loss") assert.match(String(source.error(result.reason.token)), /completion acknowledgement loss/);
        if (mode === "after-prepare-analytics-failure") assert.match(String(source.error(result.reason.token)), /secondary recovery analytics/);else if (mode === "after-prepare-release-ack-loss") assert.match(String(source.error(result.reason.token)), /secondary source release acknowledgement/);else if (mode.startsWith("after-prepare-")) assert.equal(source.error(result.reason.token).operation, "preparation barrier", `${mode}: ${String(source.error(result.reason.token))}`);
      }
      if (mode.startsWith("full-")) {
        const native = await nativeSourceReference({
          owner,
          root,
          rootIdentity,
          candidates,
          nativePatchCommand,
          settings: context.job.settings,
          limits,
          refuseSecond: mode === "full-refused-second",
          ownerBarrierFailure: mode === "full-owner-barrier-failure",
          captureFailure: mode === "full-capture-failure" ? injectedPreparationError : undefined,
          inspectionFailure: mode.startsWith("full-inspection-") ? injectedPreparationError : undefined,
          diagnosticFailure: mode === "full-inspection-diagnostic-failure" ? injectedDiagnosticError : undefined,
          analyticsCause,
          backendCause,
          backendRecoveryCause,
          credentialCause,
          credentialError: injectedPreparationError,
          afterPrepareCause,
          registerWorkFailure,
          registerWorkError,
          cleanupError,
          activityRefused: mode === "full-activity-refused"
        });
        assert.equal(native.completed, result.completed);
        if (credentialCause || afterPrepareCause || backendRecoveryCause || backendCause && !Cause.hasFails(backendCause)) {
          assert.ok(native.exitCause);
          assert.deepEqual(native.exitCause.reasons.map(reason => ({
            kind: reason._tag,
            error: reason.defect ?? reason.error,
            fiberId: reason.fiberId
          })), source.cause(result.reason.token).reasons.map(reason => ({
            kind: reason._tag,
            error: reason.defect ?? reason.error,
            fiberId: reason.fiberId
          })));
        } else if (mode.startsWith("full-inspection-") || registerWorkFailure === "defect") {
          assert.ok(native.exitCause);
          assert.equal(Cause.hasDies(native.exitCause), true);
          if (mode === "full-inspection-failure") assert.strictEqual(Cause.squash(native.exitCause), injectedPreparationError);
          assert.deepEqual(native.exitCause.reasons.map(reason => ({
            kind: reason._tag,
            error: reason.defect ?? reason.error
          })), source.cause(result.reason.token).reasons.map(reason => ({
            kind: reason._tag,
            error: reason.defect ?? reason.error
          })));
          assert.equal(native.exitCause.reasons.length, mode === "full-inspection-diagnostic-failure" || registerWorkFailure === "defect" ? 2 : 1);
        } else assert.equal(native.exitCause, undefined);
        assert.deepEqual(native.canonical, projectCanonical(snapshot.canonical));
        assert.deepEqual(native.trace, sourceEffects);
        const publications = sourceEffects.filter(event => event.kind === "activity");
        if (credentialCause || backendRecoveryCause || backendCause && !Cause.hasFails(backendCause) || mode === "full-activity-refused" || mode.startsWith("full-inspection-") || registerWorkFailure === "defect") assert.equal(publications.length, 0);else {
          assert.ok(publications.length > 0, "whole activity observer must be nonvacuous");
          assert.ok(publications.every(event => event.marker.observedAt === 1000));
        }
        if (mode === "full-comment-update") {
          assert.ok(sourceEffects.some(event => event.kind === "analytics" && event.event === "incomplete-candidate"));
          assert.equal(sourceEffects.find(event => event.kind === "prepared").value.observation.status, "incomplete");
        }
        assert.deepEqual(native.units, units.map(unit => ({
          prepared: unit.prepared,
          evaluationKey: unit.evaluationKey,
          sourceHash: unit.sourceHash,
          path: unit.observation.candidates[0].path
        })));
        assert.deepEqual(native.ownership, snapshotSourceOwnership(snapshot));
        nativeWholeCases++;
      }
      for (const unit of units) {
        const expected = await Effect.runPromise(prepareObservation(unit.observation, {
          settings: mode.startsWith("full-") ? context.job.settings : {
            rules: configuredRules
          },
          policy: DEFAULT_DIRECT_FILE_POLICY,
          inputContract: TYPE_INPUT_CONTRACT
        }));
        assert.equal(expected.observation.status, "complete");
        assert.deepEqual(unit.prepared, expected.outcomes.find(outcome => outcome.status === "ready").prepared);
        assert.equal(run(ledger.revision.current(unit.revision, unit.prepared)), true);
      }
      if (["refused-second", "full-refused-second"].includes(mode)) assert.ok(commands.some(item => item.command === "ObserveCandidateDiagnostic"));
      cases++;
    } finally {
      run(hold.open);
      await Effect.runPromise(Scope.close(scope, Exit.void));
      for (const unit of [...run(transaction.read).records.reuse.pending.values()].filter(Boolean)) {
        await Effect.runPromise(lifecycle.residentReleaseUnit(unit));
        await Effect.runPromise(lifecycle.residentReleaseReuseClaim(unit.evaluationKey));
      }
      const terminal = run(transaction.read);
      assert.equal(terminal.reservations.size, 0);
      assert.equal(terminal.records.revision.current.size, 0);
      assert.equal(terminal.records.reuse.pending.size, 0);
      assert.equal(terminal.records.dispatch.entries.size, 0);
      assert.equal(projectCanonical(terminal.canonical).global.bytes, 0);
    }
    const rootFds = await Promise.all((await readdir("/proc/self/fd")).map(fd => readlink("/proc/self/fd/" + fd).catch(() => "")));
    assert.equal(rootFds.filter(path => path === root || path.startsWith(root + "/")).length, 0);
  }
  console.log(JSON.stringify({
    passed: true,
    cases,
    requests: totalRequests,
    nativeWholeCases,
    nativeWholeScope: "actual makeResidentPreparation in an independent resident context: ordered admission/capture/resize/diagnostic/analytics effects and full physical activity marker publications with an explicit wall-clock sample, complete prepared inputs, evaluation/source identities, Canonical projection and pre-teardown transferred ownership; full error/cancellation differential and universal correspondence remain open",
    scope: "whole source workflow including pre-loop gates and post-gates cursor over actual physical candidates, fresh Preparation/cache and shared resident context, Canonical Source -> Preparation -> split resolvers -> Retaining -> dispatcher, atomic source completion/interruption and workspace receipt cleanup; finite consumer, universal proofs and production adoption remain open"
  }));
} finally {
  await rm(temp, {
    recursive: true,
    force: true
  });
}
