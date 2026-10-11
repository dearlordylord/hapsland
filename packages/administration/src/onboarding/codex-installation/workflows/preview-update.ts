import type { buildInputs } from "../runtime-inputs.ts"
import { compatibility, resolveInputs, requireTargetPackageMetadata } from "../runtime-inputs.ts"
import { makeUpdatePlan } from "../plans/update.ts"
import { RESULT_VERSION, type InstallationRequest } from "../request.ts"
import { previewChanges } from "../proposal.ts"
import { expectedRuntimeVersion, commandFromEntrypoint } from "@hapsland/runtime-environment/runtime/package-runtime"
import { ownedChanges } from "./preview-install.ts"
import { Effect } from "effect"
import { unsupportedResult, packageMetadataConflictResult, conflictResult } from "../results.ts"
import { readJournal } from "../journal.ts"
import { validateJournalScope } from "../recovery/scope.ts"
import { TargetPackageMetadataInvalid } from "../package-metadata.ts"

export const updateRecoveryCommand = (inputs: ReturnType<typeof buildInputs>, proposalDigest: string) => ({
  executable: "hapsland",
  arguments: ["--update"],
  request: { version: 1, operation: "update", codexHome: inputs.home, proposalDigest }
})

export const updateChangesNativeHooks = (
  plan: ReturnType<typeof makeUpdatePlan>,
  inputs: ReturnType<typeof buildInputs>
) => plan.mutations.some((change) => change.path === inputs.paths.hooks || change.path === inputs.paths.config)

const updatePreviewResult = (
  plan: ReturnType<typeof makeUpdatePlan>,
  host: ReturnType<typeof compatibility>,
  inputs: ReturnType<typeof buildInputs>
) => {
  return {
    version: RESULT_VERSION,
    operation: "update-preview",
    status: "preview",
    host: { adapter: "codex", home: inputs.home, compatibility: host },
    proposal: {
      digest: plan.digest,
      changes: previewChanges(plan.mutations),
      current: {
        packageVersion: plan.record.packageVersion,
        runtimeVersion: plan.record.runtimeVersion,
        executable: plan.record.executable,
        args: plan.record.args,
        residentProtocol: plan.record.residentProtocol
      },
      target: {
        packageVersion: inputs.packageVersion,
        runtimeVersion: expectedRuntimeVersion(inputs.entrypoint),
        ...commandFromEntrypoint(inputs.executable, inputs.entrypoint),
        residentProtocol: inputs.residentProtocol,
        hook: ownedChanges(inputs).hook
      }
    },
    alreadyCurrent: plan.alreadyCurrent,
    automaticUpdate: false,
    preserved: ["old grant files", "credentials", "user rules", "independent hooks"],
    trust: {
      modified: false,
      status: !updateChangesNativeHooks(plan, inputs) ? "unchanged" : "renewal-required",
      guidance: !updateChangesNativeHooks(plan, inputs)
        ? "The native hook definitions are unchanged; renewed hook trust is not required."
        : "After current work completes, restart Codex normally and approve renewed native hook trust if prompted. No trust record or bypass flag was changed."
    },
    restart: { required: updateChangesNativeHooks(plan, inputs), processesStopped: false },
    completed: [],
    pending: plan.alreadyCurrent
      ? []
      : [
          "update using this proposal digest",
          ...(updateChangesNativeHooks(plan, inputs) ? ["restart Codex after current work completes"] : [])
        ]
  }
}

export const previewCodexUpdate = Effect.fn("CodexInstallation.previewUpdate")(function* (
  request: InstallationRequest
) {
  const inputs = yield* resolveInputs(request)
  const home = inputs.home
  try {
    requireTargetPackageMetadata(inputs)
    const host = compatibility(inputs)
    if (!host.supported) return unsupportedResult("update-preview", inputs, host)
    const pendingJournal = readJournal(inputs.paths.journal)
    if (pendingJournal !== undefined) {
      validateJournalScope(pendingJournal, inputs)
      if (pendingJournal.operation !== "update") {
        throw new Error(`a journaled ${pendingJournal.operation} must be recovered before update`)
      }
      return {
        version: RESULT_VERSION,
        operation: "update-preview",
        status: "partial",
        host: { adapter: "codex", home: inputs.home, compatibility: host },
        proposal: { digest: pendingJournal.proposalDigest, changes: previewChanges(pendingJournal.mutations) },
        recovery: {
          required: true,
          proposalDigest: pendingJournal.proposalDigest,
          completedFiles: pendingJournal.completed.length,
          totalFiles: pendingJournal.mutations.length,
          command: updateRecoveryCommand(inputs, pendingJournal.proposalDigest)
        },
        preserved: ["old grant files", "credentials", "user rules", "independent hooks"],
        completed: pendingJournal.completed
          .map((index) => pendingJournal.mutations[index]?.description)
          .filter((value) => value !== undefined),
        pending: ["resume the journaled update with its original proposal digest"]
      }
    }
    const plan = makeUpdatePlan(request, inputs)
    return updatePreviewResult(plan, host, inputs)
  } catch (cause) {
    if (cause instanceof TargetPackageMetadataInvalid) {
      return packageMetadataConflictResult("update-preview", cause, home)
    }
    return conflictResult("update-preview", cause instanceof Error ? cause.message : "update preview failed", home)
  }
})
