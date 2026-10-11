import { isObject } from "../configuration-values.ts"
import { HOOKS_FEATURE_FINGERPRINT } from "../hooks-feature.ts"
import { type Journal } from "../journal.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { ownedGroup, composedGroups } from "../hooks.ts"
import { hookFingerprint } from "../hook-identity.ts"

const decodedOwnershipContent = (content: string | null) => {
  if (content === null) return undefined
  try {
    const value: unknown = JSON.parse(content)
    return isObject(value) ? value : undefined
  } catch {
    return undefined
  }
}

const recoveryComposedFingerprints = (priorOwnership: Record<string, unknown> | undefined) => {
  const priorComposed =
    isObject(priorOwnership?.composedFingerprints) && typeof priorOwnership.composedFingerprints.stop === "string"
      ? {
          stop: priorOwnership.composedFingerprints.stop,
          ...(typeof priorOwnership.composedFingerprints.preToolUse === "string"
            ? { preToolUse: priorOwnership.composedFingerprints.preToolUse }
            : {}),
          ...(typeof priorOwnership.composedFingerprints.subagentStop === "string"
            ? { subagentStop: priorOwnership.composedFingerprints.subagentStop }
            : {})
        }
      : undefined
  return priorComposed
}

const recoveryFeatureOwned = (priorOwnership: Record<string, unknown> | undefined, configPath: string) => {
  const priorOwned = Array.isArray(priorOwnership?.owned) ? priorOwnership.owned : []
  const priorFeatureOwned = priorOwned.some(
    (entry) =>
      isObject(entry) &&
      entry.kind === "feature" &&
      entry.file === configPath &&
      entry.fingerprint === HOOKS_FEATURE_FINGERPRINT
  )

  return priorFeatureOwned
}

export const recoveryPlan = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  const byPath = new Map(journal.mutations.map((change) => [change.path, change]))
  const configChange = byPath.get(inputs.paths.config)
  const hooksChange = byPath.get(inputs.paths.hooks)
  const ownershipChange = byPath.get(inputs.paths.ownership)
  const targetGroup = ownedGroup(
    inputs.executable,
    inputs.entrypoint,
    inputs.codex.version,
    inputs.controlledReviewer,
    inputs.binding?.command
  )
  const targetFingerprint = hookFingerprint(targetGroup)
  const priorOwnership = decodedOwnershipContent(ownershipChange?.beforeContent ?? null)
  const priorComposed = recoveryComposedFingerprints(priorOwnership)
  const targetComposed = composedGroups(
    inputs.executable,
    inputs.entrypoint,
    inputs.codex.version,
    inputs.controlledReviewer,
    inputs.binding?.command
  )
  const priorFeatureOwned = recoveryFeatureOwned(priorOwnership, inputs.paths.config)
  return {
    configChange,
    hooksChange,
    ownershipChange,
    targetGroup,
    targetFingerprint,
    priorOwnership,
    priorComposed,
    targetComposed,
    priorFeatureOwned
  }
}

export type RecoveryPlan = ReturnType<typeof recoveryPlan>

export const recoveryHookGroups = (plan: RecoveryPlan) =>
  isObject(plan.priorOwnership?.hookGroups) ? plan.priorOwnership.hookGroups : undefined
