import { validateInstallRecoveryPlan } from "./install.ts"
import { validateUpdateRecoveryPlan } from "./update.ts"
import { validateUninstallRecoveryPlan } from "./uninstall.ts"
import { type Journal } from "../journal.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { validateMutationContent, validateMutationCurrent, snapshot } from "../file-snapshots.ts"
import { reinstallDigest, installationDigest } from "../proposal.ts"
import { recoveryPlan } from "./plan.ts"
import { validateRecoveryBinding } from "./launcher.ts"
import { validateToml } from "../hooks-feature.ts"
import { isObject } from "../configuration-values.ts"
import { validateRecoveryMutation } from "./content.ts"

const recoveryValidators = {
  install: validateInstallRecoveryPlan,
  update: validateUpdateRecoveryPlan,
  uninstall: validateUninstallRecoveryPlan
}

const validateJournalIntegrity = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  if (new Set(journal.completed).size !== journal.completed.length) {
    throw new Error("recovery journal repeats a completed step")
  }
  for (let index = 0; index < journal.mutations.length; index += 1) {
    const change = journal.mutations[index]
    if (change === undefined) continue
    validateMutationContent(change)
    validateMutationCurrent(change, journal.completed.includes(index))
  }
  if (
    reinstallDigest(
      installationDigest(journal.operation, inputs.home, journal.mutations),
      journal.replacedJournalDigest
    ) !== journal.proposalDigest
  ) {
    throw new Error("recovery journal proposal digest does not match its declared changes")
  }

  const plan = recoveryPlan(journal, inputs)
  validateRecoveryBinding(journal, inputs, plan)
  recoveryValidators[journal.operation](journal, inputs, plan)
}

const validateUnchangedRecoveryFeature = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  if (journal.operation === "uninstall") return
  if (journal.mutations.some((change) => change.path === inputs.paths.config)) return
  const config = validateToml(snapshot(inputs.paths.config))
  if (!isObject(config.features) || config.features.hooks !== true) {
    throw new Error(
      journal.operation === "install"
        ? "preexisting Codex hooks feature changed during recovery; the current config was preserved"
        : "Codex hooks feature changed during update recovery; the current config was preserved"
    )
  }
}

export const validateJournalScope = (journal: Journal, inputs: ReturnType<typeof buildInputs>) => {
  const allowed = new Set([inputs.paths.config, inputs.paths.hooks, inputs.paths.ownership, inputs.paths.binding])
  if (
    journal.mutations.some((change) => !allowed.has(change.path)) ||
    new Set(journal.mutations.map((change) => change.path)).size !== journal.mutations.length
  ) {
    throw new Error("recovery journal contains an unexpected or duplicate configuration target")
  }
  validateJournalIntegrity(journal, inputs)
  validateUnchangedRecoveryFeature(journal, inputs)
  for (const change of journal.mutations) validateRecoveryMutation(change, journal.operation, inputs)
}
