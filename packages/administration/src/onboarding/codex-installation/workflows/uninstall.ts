import type { buildInputs } from "../runtime-inputs.ts"
import { resolveInputs } from "../runtime-inputs.ts"
import {
  type InstallationRequest,
  type InstallationResult,
  RESULT_VERSION,
  CodexInstallationError
} from "../request.ts"
import { type Journal, readJournal } from "../journal.ts"
import { validateJournalScope } from "../recovery/scope.ts"
import { recoveryConflictResult, conflictResult } from "../results.ts"
import { applyJournal } from "../journal-application.ts"
import { previewChanges } from "../proposal.ts"
import { makeUninstallPlan } from "../plans/uninstall.ts"
import { Effect } from "effect"
import { withInstallationLock } from "../../installation-lock.ts"
import { readOwnership } from "../ownership.ts"

const resumeUninstallJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  existingJournal: Journal
): InstallationResult => {
  try {
    validateJournalScope(existingJournal, inputs)
  } catch (cause) {
    return recoveryConflictResult("uninstall", inputs, existingJournal, cause)
  }
  if (request.proposalDigest === existingJournal.proposalDigest && existingJournal.operation === "uninstall") {
    try {
      applyJournal(inputs.paths.journal, existingJournal, inputs.failAfterWrites)
    } catch (cause) {
      return recoveryConflictResult("uninstall", inputs, existingJournal, cause)
    }
    return {
      version: RESULT_VERSION,
      operation: "uninstall",
      status: "uninstalled",
      host: { adapter: "codex", home: inputs.home },
      resumed: true,
      completed: existingJournal.mutations.map((change) => change.description),
      pending: [],
      remaining: ["old grant files", "credentials", "user rules", "already dispatched requests cannot be recalled"]
    }
  }
  if (existingJournal.operation === "uninstall" && request.proposalDigest === undefined)
    return {
      version: RESULT_VERSION,
      operation: "uninstall",
      status: "partial",
      host: { adapter: "codex", home: inputs.home },
      proposal: { digest: existingJournal.proposalDigest, changes: previewChanges(existingJournal.mutations) },
      recovery: { operation: "uninstall", proposalDigest: existingJournal.proposalDigest }
    }
  throw new Error("another journaled operation requires recovery before uninstall")
}

const partialUninstallResult = (
  cause: unknown,
  plan: ReturnType<typeof makeUninstallPlan>,
  inputs: ReturnType<typeof buildInputs>
): InstallationResult => {
  const current = readJournal(inputs.paths.journal)
  return {
    version: RESULT_VERSION,
    operation: "uninstall",
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "partial_completion",
      message: cause instanceof Error ? cause.message : "uninstall stopped after partial completion"
    },
    recovery: {
      proposalDigest: plan.digest,
      completedFiles: current?.completed.length ?? 0,
      totalFiles: plan.mutations.length
    },
    completed: (current?.completed ?? [])
      .map((index) => plan.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: ["rerun uninstall with the same proposal digest to resume safely"]
  }
}

const applyUninstallPlan = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  plan: ReturnType<typeof makeUninstallPlan>
): InstallationResult => {
  const journal: Journal = {
    version: 1,
    operation: "uninstall",
    proposalDigest: plan.digest,
    completed: [],
    mutations: plan.mutations
  }
  try {
    applyJournal(inputs.paths.journal, journal, inputs.failAfterWrites)
  } catch (cause) {
    return partialUninstallResult(cause, plan, inputs)
  }
  return {
    version: RESULT_VERSION,
    operation: "uninstall",
    status: "uninstalled",
    host: { adapter: "codex", home: inputs.home },
    completed: plan.mutations.map((change) => change.description),
    pending: [],
    remaining: ["old grant files", "credentials", "user rules", "already dispatched requests cannot be recalled"]
  }
}

export const uninstallCodexIntegration = Effect.fn("CodexInstallation.uninstall")(function* (
  request: InstallationRequest
) {
  const inputs = yield* resolveInputs(request)
  try {
    return yield* withInstallationLock(
      inputs.paths.lock,
      Effect.try<InstallationResult, CodexInstallationError>({
        try: () => {
          const existingJournal = readJournal(inputs.paths.journal)
          if (existingJournal !== undefined) {
            return resumeUninstallJournal(inputs, request, existingJournal)
          }
          const plan = makeUninstallPlan(request, inputs)
          if (plan.alreadyRemoved) {
            return {
              version: RESULT_VERSION,
              operation: "uninstall",
              status: "already-uninstalled",
              host: { adapter: "codex", home: inputs.home },
              proposal: { digest: plan.digest, changes: [] },
              completed: [],
              pending: [],
              remaining: [
                "old grant files",
                "credentials",
                "user rules",
                "already dispatched requests cannot be recalled"
              ]
            }
          }
          if (request.proposalDigest === undefined) {
            return {
              version: RESULT_VERSION,
              operation: "uninstall",
              status: "preview",
              host: { adapter: "codex", home: inputs.home },
              proposal: {
                digest: plan.digest,
                changes: previewChanges(plan.mutations),
                ownedChanges: {
                  hooks: { file: inputs.paths.hooks, groups: readOwnership(inputs.paths.ownership)?.hookGroups ?? {} }
                }
              },
              completed: [],
              pending: ["rerun uninstall with this proposal digest"],
              remaining: [
                "old grant files",
                "credentials",
                "user rules",
                "already dispatched requests cannot be recalled"
              ]
            }
          }
          if (request.proposalDigest !== plan.digest) {
            return {
              version: RESULT_VERSION,
              operation: "uninstall",
              status: "proposal-mismatch",
              host: { adapter: "codex", home: inputs.home },
              currentProposalDigest: plan.digest,
              completed: [],
              pending: ["preview uninstall again and approve the matching digest"]
            }
          }
          return applyUninstallPlan(inputs, request, plan)
        },
        catch: (cause) =>
          new CodexInstallationError({
            reason: cause instanceof Error && cause.message.length > 0 ? cause.message : "installation failed"
          })
      })
    ).pipe(Effect.catch((error) => Effect.succeed(conflictResult("uninstall", error.message, inputs.home))))
  } catch (cause) {
    return conflictResult("uninstall", cause instanceof Error ? cause.message : "uninstall failed", inputs.home)
  }
})
