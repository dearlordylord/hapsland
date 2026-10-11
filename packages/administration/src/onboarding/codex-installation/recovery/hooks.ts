import type { buildInputs } from "../runtime-inputs.ts"
import { type RecoveryPlan } from "./plan.ts"
import { parseJsonObject } from "../configuration-values.ts"
import { snapshot, type Mutation, mutationBeforeFile } from "../file-snapshots.ts"
import { postToolUseGroups, isOwnedPostGroup, markerCount, withComposedGroups } from "../hooks.ts"
import { canonicalJson as stableJson } from "../../hook-reconciliation.ts"
import { hookFingerprint } from "../hook-identity.ts"
import { enableHooksFeature } from "../hooks-feature.ts"

export const validateCurrentRecoveryHooks = (
  inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan,
  message: string
) => {
  const { targetGroup, targetComposed } = plan
  const currentRoot = parseJsonObject(snapshot(inputs.paths.hooks))
  const currentGroup = postToolUseGroups(currentRoot).find(isOwnedPostGroup)
  if (markerCount(currentRoot) !== 1 || stableJson(currentGroup) !== stableJson(targetGroup)) {
    throw new Error(message)
  }
  withComposedGroups(currentRoot, targetComposed, {
    preToolUse: hookFingerprint(targetComposed.PreToolUse),
    stop: hookFingerprint(targetComposed.Stop),
    subagentStop: hookFingerprint(targetComposed.SubagentStop)
  })
}

export const validateRecoveryFeatureChange = (change: Mutation | undefined) => {
  if (
    change !== undefined &&
    (change.description !== "enable Codex's native hooks feature" ||
      change.afterContent !== enableHooksFeature(mutationBeforeFile(change)))
  ) {
    throw new Error("recovery journal contains an unexpected Codex feature change")
  }
}
