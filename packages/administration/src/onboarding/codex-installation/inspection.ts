import { type InstallationRequest, RESULT_VERSION } from "./request.ts"
import { pathsFor } from "./paths.ts"
import { resolve, join } from "node:path"
import { homedir } from "node:os"
import { snapshot } from "./file-snapshots.ts"
import { OWNED_MARKER, COMPOSED_MARKER, hookFingerprint } from "./hook-identity.ts"
import { type JsonObject, isObject, parseJsonObject } from "./configuration-values.ts"
import { type OwnershipRecord, readOwnership } from "./ownership.ts"
import type { buildInputs } from "./runtime-inputs.ts"
import { resolveInputs, probeRuntime, compatibility } from "./runtime-inputs.ts"
import { validateToml } from "./hooks-feature.ts"
import { markerCount, postToolUseGroups, isOwnedPostGroup, withComposedGroups } from "./hooks.ts"
import { Effect } from "effect"
import { readJournal } from "./journal.ts"
import { validateJournalScope } from "./recovery/scope.ts"
import { commandEntrypoint, expectedRuntimeVersion } from "@hapsland/runtime-environment/runtime/package-runtime"
import { conflictResult } from "./results.ts"

/** Read-only ownership/configuration inspection independent of host compatibility. */
/** Discover owned registration state without requiring this package or host version to be current. */
export const hasCodexRegistration = (request: InstallationRequest): boolean => {
  const paths = pathsFor(resolve(request.codexHome ?? join(homedir(), ".codex")))
  if (snapshot(paths.ownership).exists || snapshot(paths.journal).exists) return true
  const hooks = snapshot(paths.hooks).content
  return hooks.includes(OWNED_MARKER) || hooks.includes(COMPOSED_MARKER)
}

const requireEnabledHooksFeature = (config: JsonObject) => {
  if (!isObject(config.features) || config.features.hooks !== true)
    throw new Error("Codex hooks feature is missing or disabled")
}

const validateInspectedOwnership = (ownership: OwnershipRecord, inputs: ReturnType<typeof buildInputs>) => {
  if (ownership.codexHome !== inputs.home) throw new Error("ownership record targets another Codex home")
  const config = validateToml(snapshot(inputs.paths.config))
  requireEnabledHooksFeature(config)
  const hooks = parseJsonObject(snapshot(inputs.paths.hooks))
  if (markerCount(hooks) !== 1 || postToolUseGroups(hooks).filter(isOwnedPostGroup).length !== 1)
    throw new Error("owned Codex hook is missing or duplicated")
  const group = postToolUseGroups(hooks).find(isOwnedPostGroup)
  if (hookFingerprint(group) !== ownership.hookFingerprint) {
    throw new Error("owned Codex hook was locally modified")
  }
  if (ownership.composedFingerprints !== undefined) {
    withComposedGroups(hooks, undefined, ownership.composedFingerprints)
  }
}

export const inspectCodexInstallation = Effect.fn("CodexInstallation.inspect")(function* (
  request: InstallationRequest
) {
  const inputs = yield* resolveInputs(request)
  try {
    const pendingJournal = readJournal(inputs.paths.journal)
    if (pendingJournal !== undefined) {
      validateJournalScope(pendingJournal, inputs)
      return {
        version: RESULT_VERSION,
        operation: "inspect-installation",
        status: "partial",
        installed: false,
        host: { adapter: "codex", home: inputs.home },
        recovery: {
          operation: pendingJournal.operation,
          proposalDigest: pendingJournal.proposalDigest,
          completedFiles: pendingJournal.completed.length,
          totalFiles: pendingJournal.mutations.length
        }
      }
    }
    const ownership = readOwnership(inputs.paths.ownership)
    let installed = false
    if (ownership !== undefined) {
      validateInspectedOwnership(ownership, inputs)
      const pinnedInputs = { ...inputs }
      pinnedInputs.executable = ownership.executable
      pinnedInputs.entrypoint = commandEntrypoint(ownership)
      pinnedInputs.runtimeProbe = yield* probeRuntime(ownership.executable)
      installed =
        compatibility(pinnedInputs).supported &&
        ownership.runtimeVersion === expectedRuntimeVersion(pinnedInputs.entrypoint)
    }
    return {
      version: RESULT_VERSION,
      operation: "inspect-installation",
      status: installed ? "installed" : "missing",
      installed,
      host: { adapter: "codex", home: inputs.home }
    }
  } catch (cause) {
    return conflictResult(
      "inspect-installation",
      cause instanceof Error ? cause.message : "installation inspection failed",
      inputs.home
    )
  }
})
