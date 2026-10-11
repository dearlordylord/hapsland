import { type RecoveryPlan, recoveryHookGroups } from "./plan.ts"
import { encodeJson, parseJsonObject, isObject } from "../configuration-values.ts"
import { withComposedGroups, removeOwnedHook } from "../hooks.ts"
import { mutationBeforeFile, type Mutation } from "../file-snapshots.ts"
import { disableOwnedFeature } from "../hooks-feature.ts"
import { type Journal } from "../journal.ts"
import type { buildInputs } from "../runtime-inputs.ts"

const validateUninstalledRecoveryHooks = (plan: RecoveryPlan) => {
  const { priorOwnership, hooksChange, priorComposed } = plan
  const installedFingerprint =
    typeof priorOwnership?.hookFingerprint === "string" ? priorOwnership.hookFingerprint : undefined
  if (hooksChange !== undefined) {
    if (
      installedFingerprint === undefined ||
      hooksChange.description !== "remove only the owned PostToolUse adapter hook" ||
      hooksChange.afterContent !==
        encodeJson(
          withComposedGroups(
            removeOwnedHook(
              parseJsonObject(mutationBeforeFile(hooksChange)),
              installedFingerprint,
              recoveryHookGroups(plan)?.PostToolUse
            ),
            undefined,
            priorComposed,
            true,
            isObject(priorOwnership?.hookGroups) ? priorOwnership.hookGroups : undefined
          )
        )
    ) {
      throw new Error("recovery journal uninstall hook does not preserve unrelated hooks")
    }
  }
}

const validateRemovedRecoveryFeature = (configChange: Mutation | undefined) => {
  if (
    configChange !== undefined &&
    (configChange.description !== "remove the owned Codex hooks feature entry" ||
      configChange.afterContent !== disableOwnedFeature(mutationBeforeFile(configChange).content))
  ) {
    throw new Error("recovery journal contains an unexpected Codex feature removal")
  }
}

export const validateUninstallRecoveryPlan = (
  _journal: Journal,
  _inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan
) => {
  const { ownershipChange } = plan
  if (
    ownershipChange === undefined ||
    ownershipChange.afterContent !== null ||
    ownershipChange.description !== "remove the versioned ownership record"
  ) {
    throw new Error("recovery journal does not contain the exact owned uninstall record removal")
  }
  validateUninstalledRecoveryHooks(plan)
  validateRemovedRecoveryFeature(plan.configChange)
}
