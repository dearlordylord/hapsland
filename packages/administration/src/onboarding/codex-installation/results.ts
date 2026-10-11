import type { buildInputs, compatibility } from "./runtime-inputs.ts"
import { RESULT_VERSION } from "./request.ts"
import type { TargetPackageMetadataInvalid } from "./package-metadata.ts"
import { type Journal, readJournal } from "./journal.ts"

export const unsupportedResult = (
  operation: "install" | "install-preview" | "update" | "update-preview",
  inputs: ReturnType<typeof buildInputs>,
  host: ReturnType<typeof compatibility>
) => ({
  version: RESULT_VERSION,
  operation,
  status: "unsupported",
  host: { adapter: "codex", home: inputs.home, compatibility: host },
  completed: [],
  pending: [
    "restore the selected Codex executable with lifecycle hooks and a complete Hapsland package before mutation"
  ]
})

export const conflictResult = (operation: string, reason: string, home?: string) => ({
  version: RESULT_VERSION,
  operation,
  status: "conflict",
  ...(home === undefined ? {} : { host: { adapter: "codex", home } }),
  error: { code: "configuration_conflict", message: reason },
  completed: [],
  pending: ["resolve the reported conflict and preview again"]
})

export const packageMetadataConflictResult = (
  operation: "update-preview" | "update",
  cause: TargetPackageMetadataInvalid,
  home: string
) => ({
  version: RESULT_VERSION,
  operation,
  status: "conflict",
  host: { adapter: "codex", home },
  error: { code: "target_package_metadata_invalid", message: cause.message },
  completed: [],
  pending: ["use a packaged target with a declared package version and version-1 runtime metadata"]
})

export const recoveryConflictResult = (
  operation: "install" | "update" | "uninstall",
  inputs: ReturnType<typeof buildInputs>,
  journal: Journal,
  cause: unknown
) => {
  const current = readJournal(inputs.paths.journal)
  const completedIndexes = current?.completed ?? journal.completed
  return {
    version: RESULT_VERSION,
    operation,
    status: "partial",
    host: { adapter: "codex", home: inputs.home },
    error: {
      code: "recovery_conflict",
      message: cause instanceof Error ? cause.message : "journal recovery prerequisites no longer match"
    },
    recovery: {
      proposalDigest: journal.proposalDigest,
      completedFiles: completedIndexes.length,
      totalFiles: journal.mutations.length,
      command: {
        executable: "hapsland",
        arguments: [`--${journal.operation}`],
        request: {
          version: 1,
          operation: journal.operation,
          codexHome: inputs.home,
          proposalDigest: journal.proposalDigest
        }
      }
    },
    completed: completedIndexes
      .map((index) => journal.mutations[index]?.description)
      .filter((value) => value !== undefined),
    pending: [
      "preserve the current files, resolve the reported prerequisite conflict, then rerun with the same proposal digest"
    ]
  }
}
