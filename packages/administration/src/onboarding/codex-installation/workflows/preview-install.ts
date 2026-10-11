import { OWNERSHIP_VERSION } from "../ownership.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { packagedRuntimeEntrypoints, resolveInputs, compatibility } from "../runtime-inputs.ts"
import { commandFromEntrypoint } from "@hapsland/runtime-environment/runtime/package-runtime"
import { commandHooks } from "@hapsland/runtime-environment/runtime/hook-catalog"
import { ownedGroup, composedGroups } from "../hooks.ts"
import { type InstallationRequest, RESULT_VERSION } from "../request.ts"
import { type Journal, readJournal } from "../journal.ts"
import { validateJournalScope } from "../recovery/scope.ts"
import { Effect } from "effect"
import { unsupportedResult, conflictResult } from "../results.ts"
import { previewChanges } from "../proposal.ts"
import { makeInstallPlan } from "../plans/install.ts"

export const ownedChanges = (inputs: ReturnType<typeof buildInputs>) => ({
  runtime: {
    ...commandFromEntrypoint(inputs.executable, inputs.entrypoint),
    parser: commandFromEntrypoint(inputs.executable, packagedRuntimeEntrypoints(inputs.entrypoint).parser),
    resident: commandFromEntrypoint(inputs.executable, packagedRuntimeEntrypoints(inputs.entrypoint).resident),
    observed: inputs.runtimeProbe.observed
  },
  feature: { file: inputs.paths.config, table: "features", key: "hooks", value: true },
  hook: {
    file: inputs.paths.hooks,
    event: "PostToolUse",
    matcher: commandHooks.codex.afterEdit.matcher,
    handlers: ownedGroup(
      inputs.executable,
      inputs.entrypoint,
      inputs.codex.version,
      inputs.controlledReviewer,
      inputs.binding?.command
    ).hooks,
    groups: {
      PostToolUse: ownedGroup(
        inputs.executable,
        inputs.entrypoint,
        inputs.codex.version,
        inputs.controlledReviewer,
        inputs.binding?.command
      ),
      ...composedGroups(
        inputs.executable,
        inputs.entrypoint,
        inputs.codex.version,
        inputs.controlledReviewer,
        inputs.binding?.command
      )
    }
  },
  ownership: { file: inputs.paths.ownership, version: OWNERSHIP_VERSION, adapter: "codex" }
})

export const installationJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest
): Journal | undefined => {
  if (!request.reinstall) return readJournal(inputs.paths.journal)
  try {
    const journal = readJournal(inputs.paths.journal)
    if (journal?.reinstall !== true) return undefined
    validateJournalScope(journal, inputs)
    return journal
  } catch {
    return undefined
  }
}

export const previewCodexInstallation = Effect.fn("CodexInstallation.preview")(function* (
  request: InstallationRequest
) {
  const inputs = yield* resolveInputs(request)
  const home = inputs.home
  try {
    const host = compatibility(inputs)
    if (!host.supported) return unsupportedResult("install-preview", inputs, host)
    const pendingJournal = installationJournal(inputs, request)
    if (pendingJournal !== undefined) {
      validateJournalScope(pendingJournal, inputs)
      return {
        version: RESULT_VERSION,
        operation: "install-preview",
        status: "partial",
        host: { adapter: "codex", home: inputs.home, compatibility: host },
        proposal: {
          digest: pendingJournal.proposalDigest,
          changes: previewChanges(pendingJournal.mutations),
          ownedChanges: ownedChanges(inputs)
        },
        recovery: {
          required: true,
          operation: pendingJournal.operation,
          proposalDigest: pendingJournal.proposalDigest,
          completedFiles: pendingJournal.completed.length,
          totalFiles: pendingJournal.mutations.length
        },
        completed: pendingJournal.completed
          .map((index) => pendingJournal.mutations[index]?.description)
          .filter((value) => value !== undefined),
        pending: [`resume the journaled ${pendingJournal.operation} with its original proposal digest`]
      }
    }
    const plan = makeInstallPlan(request, inputs)
    return {
      version: RESULT_VERSION,
      operation: "install-preview",
      status: "preview",
      host: { adapter: "codex", home: plan.inputs.home, compatibility: host },
      proposal: {
        digest: plan.digest,
        changes: previewChanges(plan.mutations),
        ownedChanges: ownedChanges(plan.inputs),
        ...(plan.resetJournal?.exists
          ? {
              journalReplacement: {
                file: inputs.paths.journal,
                action: "back up the interrupted journal and rebuild from current settings"
              }
            }
          : {})
      },
      installed: plan.alreadyInstalled,
      recovery: { required: false },
      trust: {
        status: "native-confirmation-required",
        guidance:
          "Start Codex normally in the repository and approve its native repository and hook review prompts. No trust record or bypass flag was changed."
      },
      completed: [],
      pending: [
        "install using this proposal digest",
        "configure file includes/excludes if you want to narrow or turn off review"
      ]
    }
  } catch (cause) {
    return {
      ...conflictResult(
        "install-preview",
        cause instanceof Error ? cause.message : "installation preview failed",
        home
      ),
      host: { adapter: "codex", home, compatibility: compatibility(inputs) }
    }
  }
})
