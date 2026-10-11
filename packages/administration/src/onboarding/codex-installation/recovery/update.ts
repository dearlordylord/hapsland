import { type Journal } from "../journal.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { type RecoveryPlan, recoveryHookGroups } from "./plan.ts"
import { type Mutation, mutationBeforeFile } from "../file-snapshots.ts"
import { encodeJson, parseJsonObject } from "../configuration-values.ts"
import { makeOwnershipRecord } from "../target-ownership.ts"
import { withComposedGroups, replaceOwnedHook } from "../hooks.ts"
import { validateRecoveryFeatureChange, validateCurrentRecoveryHooks } from "./hooks.ts"

const requireUpdateOwnership = (journal: Journal, inputs: ReturnType<typeof buildInputs>, plan: RecoveryPlan) => {
  const { ownershipChange, hooksChange } = plan
  if (
    ownershipChange === undefined ||
    journal.mutations[0]?.path !== inputs.paths.ownership ||
    ownershipChange.description !== "record the target packaged runtime" ||
    (hooksChange !== undefined && hooksChange.description !== "replace only the owned PostToolUse adapter hook")
  ) {
    throw new Error("recovery journal is not an exact owned update plan")
  }
  return ownershipChange
}

const validateUpdateOwnership = (
  ownershipChange: Mutation,
  inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan
) => {
  const { targetFingerprint, priorFeatureOwned, configChange } = plan
  const expectedOwnership = encodeJson(
    makeOwnershipRecord(inputs, targetFingerprint, priorFeatureOwned || configChange !== undefined)
  )
  if (ownershipChange.afterContent !== expectedOwnership) {
    throw new Error("recovery journal ownership does not match the exact target package")
  }
}

const validateUpdatedRecoveryHooks = (hooksChange: Mutation, plan: RecoveryPlan) => {
  const { targetGroup, targetComposed, priorComposed } = plan
  const beforeRoot = parseJsonObject(mutationBeforeFile(hooksChange))
  const expectedHooks = encodeJson(
    withComposedGroups(
      replaceOwnedHook(beforeRoot, targetGroup),
      targetComposed,
      priorComposed,
      true,
      recoveryHookGroups(plan)
    )
  )
  if (hooksChange.afterContent !== expectedHooks) {
    throw new Error("recovery journal hook change does not preserve the exact unrelated hook state")
  }
}

export const validateUpdateRecoveryPlan = (
  journal: Journal,
  inputs: ReturnType<typeof buildInputs>,
  plan: RecoveryPlan
) => {
  const ownershipChange = requireUpdateOwnership(journal, inputs, plan)
  validateRecoveryFeatureChange(plan.configChange)
  validateUpdateOwnership(ownershipChange, inputs, plan)
  if (plan.hooksChange !== undefined) validateUpdatedRecoveryHooks(plan.hooksChange, plan)
  else validateCurrentRecoveryHooks(inputs, plan, "recovery journal does not bind the exact target owned hook")
}
