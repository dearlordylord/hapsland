import { type Journal } from "../journal.ts"
import { isObject } from "../configuration-values.ts"
import { markerCount } from "../hooks.ts"
import type { buildInputs } from "../runtime-inputs.ts"
import { commandFromEntrypoint } from "@hapsland/runtime-environment/runtime/package-runtime"
import { type Mutation } from "../file-snapshots.ts"
import { assertHooksSemanticState } from "../hooks-feature.ts"

const parseRecoveryContent = (content: string, message: string): unknown => {
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(message)
  }
}

const validateRecoveryHookContent = (content: string, operation: Journal["operation"]) => {
  const decoded = parseRecoveryContent(content, "recovery journal contains malformed hooks configuration")
  if (!isObject(decoded) || markerCount(decoded) !== (operation === "uninstall" ? 0 : 1)) {
    throw new Error("recovery journal does not contain the required owned-hook state")
  }
}

const requireRecoveryRuntimeIdentity = (decoded: unknown, inputs: ReturnType<typeof buildInputs>) => {
  if (
    !isObject(decoded) ||
    decoded.version !== 1 ||
    decoded.adapter !== "codex" ||
    decoded.executable !== commandFromEntrypoint(inputs.executable, inputs.entrypoint).executable ||
    JSON.stringify(decoded.args) !== JSON.stringify(commandFromEntrypoint(inputs.executable, inputs.entrypoint).args)
  ) {
    throw new Error("recovery journal ownership does not match the current packaged runtime")
  }
  return decoded
}

const validateRecoveryOwnershipContent = (
  content: string,
  operation: Journal["operation"],
  inputs: ReturnType<typeof buildInputs>
) => {
  const decoded = requireRecoveryRuntimeIdentity(
    parseRecoveryContent(content, "recovery journal contains a malformed ownership record"),
    inputs
  )
  if (
    operation === "update" &&
    (decoded.residentProtocol !== inputs.residentProtocol || decoded.packageVersion !== inputs.packageVersion)
  ) {
    throw new Error("recovery journal ownership does not match the current packaged runtime")
  }
}

const validateSelectedRecoveryBinding = (change: Mutation, inputs: ReturnType<typeof buildInputs>): void => {
  if (
    inputs.binding === undefined ||
    change.afterContent !== inputs.binding.content ||
    change.description !== "select the scoped hook implementation"
  )
    throw new Error("recovery journal hook launcher does not match the selected package")
}

export const validateRecoveryMutation = (
  change: Mutation,
  operation: Journal["operation"],
  inputs: ReturnType<typeof buildInputs>
) => {
  if (change.afterContent === null) return
  if (change.path === inputs.paths.binding) {
    validateSelectedRecoveryBinding(change, inputs)
  } else if (change.path === inputs.paths.config) {
    assertHooksSemanticState(change.afterContent, operation === "uninstall" ? "absent" : true)
  } else if (change.path === inputs.paths.hooks) {
    validateRecoveryHookContent(change.afterContent, operation)
  } else if (change.path === inputs.paths.ownership) {
    validateRecoveryOwnershipContent(change.afterContent, operation, inputs)
  }
}
