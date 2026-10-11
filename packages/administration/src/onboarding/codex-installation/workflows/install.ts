import type { buildInputs } from "../runtime-inputs.ts"
import { resolveInputs, compatibility, probeRuntime } from "../runtime-inputs.ts"
import {
  type InstallationRequest,
  type InstallationResult,
  RESULT_VERSION,
  CodexInstallationError
} from "../request.ts"
import { type Journal, readJournal } from "../journal.ts"
import { validateJournalScope } from "../recovery/scope.ts"
import { recoveryConflictResult, unsupportedResult, conflictResult } from "../results.ts"
import { applyJournal } from "../journal-application.ts"
import { makeInstallPlan } from "../plans/install.ts"
import { atomicWrite } from "../file-writes.ts"
import { randomUUID } from "node:crypto"
import { Effect } from "effect"
import { withInstallationLock } from "../../installation-lock.ts"
import { installationJournal } from "./preview-install.ts"

const resumeInstallJournal = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  existingJournal: Journal
): InstallationResult => {
  try {
    validateJournalScope(existingJournal, inputs)
  } catch (cause) {
    return recoveryConflictResult("install", inputs, existingJournal, cause)
  }
  if (request.proposalDigest !== existingJournal.proposalDigest || existingJournal.operation !== "install") {
    return {
      version: RESULT_VERSION,
      operation: "install",
      status: "partial",
      host: { adapter: "codex", home: inputs.home },
      error: {
        code: "recovery_required",
        message: "a prior installation is incomplete; rerun install with its original proposal digest"
      },
      recovery: {
        proposalDigest: existingJournal.proposalDigest,
        completedFiles: existingJournal.completed.length,
        totalFiles: existingJournal.mutations.length
      },
      completed: existingJournal.completed
        .map((index) => existingJournal.mutations[index]?.description)
        .filter((value) => value !== undefined),
      pending: ["resume the journaled installation"]
    }
  }
  try {
    applyJournal(inputs.paths.journal, existingJournal, inputs.failAfterWrites)
  } catch (cause) {
    return recoveryConflictResult("install", inputs, existingJournal, cause)
  }
  return {
    version: RESULT_VERSION,
    operation: "install",
    status: "installed",
    host: { adapter: "codex", home: inputs.home },
    resumed: true,
    completed: existingJournal.mutations.map((change) => change.description),
    pending: [
      "make Jev credentials available and configure file settings if desired",
      "approve native Codex trust prompts when shown"
    ]
  }
}

const partialInstallResult = (
  cause: unknown,
  plan: ReturnType<typeof makeInstallPlan>,
  inputs: ReturnType<typeof buildInputs>
): InstallationResult => {
  const current = readJournal(inputs.paths.journal)
  return {
    version: RESULT_VERSION,
    operation: "install",
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "partial_completion",
      message: cause instanceof Error ? cause.message : "installation stopped after partial completion"
    },
    recovery: {
      proposalDigest: plan.digest,
      completedFiles: current?.completed.length ?? 0,
      totalFiles: plan.mutations.length
    },
    completed: (current?.completed ?? [])
      .map((index) => plan.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: ["rerun install with the same proposal digest to resume safely"]
  }
}

const applyInstallPlan = (
  inputs: ReturnType<typeof buildInputs>,
  request: InstallationRequest,
  plan: ReturnType<typeof makeInstallPlan>
): InstallationResult => {
  const journal: Journal = {
    version: 1,
    operation: "install",
    ...(request.reinstall ? { reinstall: true } : {}),
    ...(plan.resetJournal?.exists ? { replacedJournalDigest: plan.resetJournal.digest } : {}),
    proposalDigest: plan.digest,
    completed: [],
    mutations: plan.mutations
  }
  try {
    if (plan.resetJournal?.exists)
      atomicWrite(`${inputs.paths.journal}.reinstall-backup.${randomUUID()}`, plan.resetJournal.content)
    applyJournal(inputs.paths.journal, journal, inputs.failAfterWrites)
  } catch (cause) {
    return partialInstallResult(cause, plan, inputs)
  }
  return {
    version: RESULT_VERSION,
    operation: "install",
    status: "installed",
    host: { adapter: "codex", home: inputs.home },
    completed: plan.mutations.map((change) => change.description),
    pending: [
      "make Jev credentials available and configure file settings if desired",
      "approve native Codex trust prompts when shown"
    ],
    trust: { modified: false, bypassUsed: false }
  }
}

export const installCodexIntegration = Effect.fn("CodexInstallation.install")(function* (request: InstallationRequest) {
  const inputs = yield* resolveInputs(request)
  const initialCompatibility = compatibility(inputs)
  if (!initialCompatibility.supported) return unsupportedResult("install", inputs, initialCompatibility)
  try {
    return yield* withInstallationLock(
      inputs.paths.lock,
      Effect.gen(function* () {
        const runtimeProbe = yield* probeRuntime(inputs.executable)
        return yield* Effect.try<InstallationResult, CodexInstallationError>({
          try: () => {
            const currentCompatibility = compatibility({ ...inputs, runtimeProbe })
            if (!currentCompatibility.supported) return unsupportedResult("install", inputs, currentCompatibility)
            const existingJournal = installationJournal(inputs, request)
            if (existingJournal !== undefined) {
              return resumeInstallJournal(inputs, request, existingJournal)
            }
            const plan = makeInstallPlan(request, inputs)
            const host = compatibility(plan.inputs)
            if (!host.supported) {
              return unsupportedResult("install", inputs, host)
            }
            if (request.proposalDigest === undefined || request.proposalDigest !== plan.digest) {
              return {
                version: RESULT_VERSION,
                operation: "install",
                status: "proposal-mismatch",
                host: { adapter: "codex", home: inputs.home },
                currentProposalDigest: plan.digest,
                completed: [],
                pending: ["preview again and approve the matching digest"]
              }
            }
            if (plan.alreadyInstalled) {
              return {
                version: RESULT_VERSION,
                operation: "install",
                status: "already-installed",
                host: { adapter: "codex", home: inputs.home },
                completed: [],
                pending: ["make Jev credentials available and configure file settings if desired"]
              }
            }
            return applyInstallPlan(inputs, request, plan)
          },
          catch: (cause) =>
            new CodexInstallationError({
              reason: cause instanceof Error && cause.message.length > 0 ? cause.message : "installation failed"
            })
        })
      })
    ).pipe(Effect.catch((error) => Effect.succeed(conflictResult("install", error.message, inputs.home))))
  } catch (cause) {
    return conflictResult("install", cause instanceof Error ? cause.message : "installation failed", inputs.home)
  }
})
