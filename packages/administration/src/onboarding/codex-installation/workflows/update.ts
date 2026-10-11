import type { buildInputs } from "../runtime-inputs.ts"
import { resolveInputs, requireTargetPackageMetadata, compatibility, probeRuntime } from "../runtime-inputs.ts"
import { type Journal, readJournal } from "../journal.ts"
import {
  type InstallationResult,
  RESULT_VERSION,
  type InstallationRequest,
  CodexInstallationError
} from "../request.ts"
import { updateRecoveryCommand, updateChangesNativeHooks } from "./preview-update.ts"
import { validateJournalScope } from "../recovery/scope.ts"
import { recoveryConflictResult, packageMetadataConflictResult, conflictResult, unsupportedResult } from "../results.ts"
import { applyJournal } from "../journal-application.ts"
import { makeUpdatePlan } from "../plans/update.ts"
import { Effect } from "effect"
import { TargetPackageMetadataInvalid } from "../package-metadata.ts"
import { withInstallationLock } from "../../installation-lock.ts"

const recoveryRequiredResult = (
  inputs: ReturnType<typeof buildInputs>,
  existingJournal: Journal
): InstallationResult => ({
  version: RESULT_VERSION,
  operation: "update",
  status: "partial",
  host: { adapter: "codex", home: inputs.home },
  error: {
    code: "recovery_required",
    message: "a prior operation is incomplete; recover it with its original operation and proposal digest"
  },
  recovery: {
    proposalDigest: existingJournal.proposalDigest,
    completedFiles: existingJournal.completed.length,
    totalFiles: existingJournal.mutations.length,
    command:
      existingJournal.operation === "update"
        ? updateRecoveryCommand(inputs, existingJournal.proposalDigest)
        : {
            executable: "hapsland",
            arguments: [`--${existingJournal.operation}`],
            request: {
              version: 1,
              operation: existingJournal.operation,
              codexHome: inputs.home,
              proposalDigest: existingJournal.proposalDigest
            }
          }
  },
  completed: existingJournal.completed
    .map((index) => existingJournal.mutations[index]?.description)
    .filter((value) => value !== undefined),
  pending: [`resume the journaled ${existingJournal.operation}`]
})

const resumeUpdateJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  existingJournal: Journal
): InstallationResult => {
  try {
    validateJournalScope(existingJournal, inputs)
  } catch (cause) {
    return recoveryConflictResult("update", inputs, existingJournal, cause)
  }
  if (request.proposalDigest !== existingJournal.proposalDigest || existingJournal.operation !== "update") {
    return recoveryRequiredResult(inputs, existingJournal)
  }
  try {
    applyJournal(inputs.paths.journal, existingJournal, inputs.failAfterWrites)
  } catch (cause) {
    return recoveryConflictResult("update", inputs, existingJournal, cause)
  }
  return {
    version: RESULT_VERSION,
    operation: "update",
    status: "updated",
    host: { adapter: "codex", home: inputs.home },
    resumed: true,
    preserved: ["old grant files", "credentials", "user rules", "independent hooks"],
    trust: {
      modified: false,
      status: existingJournal.mutations.some(
        (change) => change.path === inputs.paths.hooks || change.path === inputs.paths.config
      )
        ? "renewal-required"
        : "unchanged",
      bypassUsed: false
    },
    restart: {
      required: existingJournal.mutations.some(
        (change) => change.path === inputs.paths.hooks || change.path === inputs.paths.config
      ),
      processesStopped: false
    },
    completed: existingJournal.mutations.map((change) => change.description),
    pending: existingJournal.mutations.some(
      (change) => change.path === inputs.paths.hooks || change.path === inputs.paths.config
    )
      ? ["restart Codex after current work completes and approve renewed hook trust if prompted"]
      : []
  }
}

const partialUpdateResult = (
  cause: unknown,
  plan: ReturnType<typeof makeUpdatePlan>,
  inputs: ReturnType<typeof buildInputs>
): InstallationResult => {
  const current = readJournal(inputs.paths.journal)
  return {
    version: RESULT_VERSION,
    operation: "update",
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "partial_completion",
      message: cause instanceof Error ? cause.message : "update stopped after partial completion"
    },
    recovery: {
      proposalDigest: plan.digest,
      completedFiles: current?.completed.length ?? 0,
      totalFiles: plan.mutations.length,
      command: updateRecoveryCommand(inputs, plan.digest)
    },
    preserved: ["old grant files", "credentials", "user rules", "independent hooks"],
    completed: (current?.completed ?? [])
      .map((index) => plan.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: ["rerun update with the same proposal digest to resume safely"]
  }
}

const applyUpdatePlan = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  plan: ReturnType<typeof makeUpdatePlan>
): InstallationResult => {
  const journal: Journal = {
    version: 1,
    operation: "update",
    proposalDigest: plan.digest,
    completed: [],
    mutations: plan.mutations
  }
  try {
    applyJournal(inputs.paths.journal, journal, inputs.failAfterWrites)
  } catch (cause) {
    return partialUpdateResult(cause, plan, inputs)
  }
  return {
    version: RESULT_VERSION,
    operation: "update",
    status: "updated",
    host: { adapter: "codex", home: inputs.home },
    preserved: ["old grant files", "credentials", "user rules", "independent hooks"],
    trust: {
      modified: false,
      status: updateChangesNativeHooks(plan, inputs) ? "renewal-required" : "unchanged",
      bypassUsed: false
    },
    restart: { required: updateChangesNativeHooks(plan, inputs), processesStopped: false },
    completed: plan.mutations.map((change) => change.description),
    pending: updateChangesNativeHooks(plan, inputs)
      ? ["restart Codex after current work completes and approve renewed hook trust if prompted"]
      : []
  }
}

export const updateCodexIntegration = Effect.fn("CodexInstallation.update")(function* (request: InstallationRequest) {
  const inputs = yield* resolveInputs(request)
  try {
    requireTargetPackageMetadata(inputs)
  } catch (cause) {
    if (cause instanceof TargetPackageMetadataInvalid) {
      return packageMetadataConflictResult("update", cause, inputs.home)
    }
    return conflictResult("update", "target package metadata validation failed", inputs.home)
  }
  const initialCompatibility = compatibility(inputs)
  if (!initialCompatibility.supported) return unsupportedResult("update", inputs, initialCompatibility)
  try {
    return yield* withInstallationLock(
      inputs.paths.lock,
      Effect.gen(function* () {
        const runtimeProbe = yield* probeRuntime(inputs.executable)
        return yield* Effect.try<InstallationResult, CodexInstallationError>({
          try: () => {
            const currentCompatibility = compatibility({ ...inputs, runtimeProbe })
            if (!currentCompatibility.supported) return unsupportedResult("update", inputs, currentCompatibility)
            const existingJournal = readJournal(inputs.paths.journal)
            if (existingJournal !== undefined) {
              return resumeUpdateJournal(inputs, request, existingJournal)
            }
            const plan = makeUpdatePlan(request, inputs)
            if (request.proposalDigest === undefined || request.proposalDigest !== plan.digest) {
              return {
                version: RESULT_VERSION,
                operation: "update",
                status: "proposal-mismatch",
                host: { adapter: "codex", home: inputs.home },
                currentProposalDigest: plan.digest,
                completed: [],
                pending: ["preview the update again and approve the matching digest"]
              }
            }
            if (plan.alreadyCurrent) {
              return {
                version: RESULT_VERSION,
                operation: "update",
                status: "already-current",
                host: { adapter: "codex", home: inputs.home },
                preserved: ["old grant files", "credentials", "user rules", "independent hooks"],
                trust: { modified: false, status: "unchanged", bypassUsed: false },
                restart: { required: false, processesStopped: false },
                completed: [],
                pending: []
              }
            }
            return applyUpdatePlan(inputs, request, plan)
          },
          catch: (cause) =>
            new CodexInstallationError({
              reason: cause instanceof Error && cause.message.length > 0 ? cause.message : "installation failed"
            })
        })
      })
    ).pipe(Effect.catch((error) => Effect.succeed(conflictResult("update", error.message, inputs.home))))
  } catch (cause) {
    return conflictResult("update", cause instanceof Error ? cause.message : "update failed", inputs.home)
  }
})
