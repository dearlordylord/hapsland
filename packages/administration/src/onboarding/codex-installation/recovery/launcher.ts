import { type Mutation, snapshot } from "../file-snapshots.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import type { recoveryPlan } from "./plan.ts"
import { isObject } from "../configuration-values.ts"
import { bindingDigest } from "../../hook-binding.ts"
import { type Journal } from "../journal.ts"

const validateRemovedRecoveryBinding = (
  change: Mutation,
  inputs: ReturnType<typeof buildInputs>,
  plan: ReturnType<typeof recoveryPlan>
): void => {
  const owned = Array.isArray(plan.priorOwnership?.owned) ? plan.priorOwnership.owned : []
  if (
    change.afterContent !== null ||
    change.description !== "remove the owned hook launcher" ||
    !owned.some(
      (entry: unknown) =>
        isObject(entry) &&
        entry.file === inputs.paths.binding &&
        entry.kind === "hook" &&
        entry.fingerprint === bindingDigest(change.beforeContent ?? "")
    )
  )
    throw new Error("recovery journal does not remove an owned hook launcher")
}

const validateMutatedRecoveryBinding = (
  journal: Journal,
  change: Mutation,
  inputs: ReturnType<typeof buildInputs>,
  plan: ReturnType<typeof recoveryPlan>
): void => {
  if (journal.operation === "uninstall") return validateRemovedRecoveryBinding(change, inputs, plan)
  if (inputs.binding === undefined || change.afterContent !== inputs.binding.content)
    throw new Error("recovery journal does not select the target hook launcher")
}

const validateUnchangedRecoveryBinding = (journal: Journal, inputs: ReturnType<typeof buildInputs>): void => {
  if (
    inputs.binding !== undefined &&
    journal.operation !== "uninstall" &&
    snapshot(inputs.paths.binding).content !== inputs.binding.content
  )
    throw new Error("target hook launcher changed during recovery")
}

export const validateRecoveryBinding = (
  journal: Journal,
  inputs: ReturnType<typeof buildInputs>,
  plan: ReturnType<typeof recoveryPlan>
): void => {
  const change = journal.mutations.find((entry) => entry.path === inputs.paths.binding)
  if (change === undefined) return validateUnchangedRecoveryBinding(journal, inputs)
  validateMutatedRecoveryBinding(journal, change, inputs, plan)
}
