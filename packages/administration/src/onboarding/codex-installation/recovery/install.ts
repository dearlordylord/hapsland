import { type Mutation, mutationBeforeFile } from "../file-snapshots.ts"
import { type Journal } from "../journal.ts"
import { type RecoveryPlan, recoveryHookGroups } from "./plan.ts"
import { parseJsonObject, encodeJson } from "../configuration-values.ts"
import { removeMarkedHandlers } from "../../hook-reconciliation.ts"
import { OWNED_MARKER, COMPOSED_MARKER } from "../hook-identity.ts"
import { postToolUseGroups, isOwnedPostGroup, replaceOwnedHook, addOwnedHook, withComposedGroups } from "../hooks.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { makeOwnershipRecord } from "../target-ownership.ts"
import { validateRecoveryFeatureChange, validateCurrentRecoveryHooks } from "./hooks.ts"

const validateInstalledRecoveryHooks = (hooksChange: Mutation, journal: Journal, plan: RecoveryPlan) => {
  const { targetGroup, targetComposed, priorComposed } = plan
  const originalRoot = parseJsonObject(mutationBeforeFile(hooksChange))
  const beforeRoot = journal.reinstall
    ? removeMarkedHandlers(originalRoot, [OWNED_MARKER, COMPOSED_MARKER])
    : originalRoot
  const expectedRoot = postToolUseGroups(beforeRoot).some(isOwnedPostGroup)
    ? replaceOwnedHook(beforeRoot, targetGroup)
    : addOwnedHook(beforeRoot, targetGroup)
  if (
    hooksChange.description !== "append the owned PostToolUse adapter hook" ||
    hooksChange.afterContent !==
      encodeJson(
        withComposedGroups(
          expectedRoot,
          targetComposed,
          journal.reinstall ? undefined : priorComposed,
          true,
          recoveryHookGroups(plan)
        )
      )
  ) {
    throw new Error("recovery journal install hook does not preserve unrelated hooks")
  }
}

const validateInstalledOwnership = (
  ownershipChange: Mutation,
  inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan
) => {
  const { priorFeatureOwned, configChange, targetFingerprint } = plan
  const featureOwned = priorFeatureOwned || configChange !== undefined
  if (
    ownershipChange.description !== "write the versioned ownership record" ||
    ownershipChange.afterContent !== encodeJson(makeOwnershipRecord(inputs, targetFingerprint, featureOwned))
  ) {
    throw new Error("recovery journal contains an unexpected installation ownership record")
  }
}

export const validateInstallRecoveryPlan = (
  journal: Journal,
  inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan
) => {
  if (plan.ownershipChange === undefined)
    throw new Error("recovery journal install plan is missing its owned installation record")
  validateRecoveryFeatureChange(plan.configChange)
  if (plan.hooksChange !== undefined) validateInstalledRecoveryHooks(plan.hooksChange, journal, plan)
  else validateCurrentRecoveryHooks(inputs, plan, "recovery journal install plan does not bind the exact owned hook")
  validateInstalledOwnership(plan.ownershipChange, inputs, plan)
}
