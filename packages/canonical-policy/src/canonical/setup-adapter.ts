import {
  setupNativeCommand,
  setupBindReducer,
  setupInstallationCanProceed,
  setupInstallationWasWritten,
  setupReadiness,
  type SetupFact,
  type SetupPatch,
  type SetupPhase
} from "@hapsland/agent-flow-bend/setup-policy"
export const getSetupCommand = setupNativeCommand
export const getSetupInstallationCanProceed = setupInstallationCanProceed
export const getSetupInstallationWasWritten = setupInstallationWasWritten
export const getSetupReadiness = setupReadiness
const factNames: readonly SetupFact[] = [
  "compatOk",
  "proceed",
  "written",
  "pending",
  "installDigest",
  "installPresent",
  "rulesDigest",
  "digestMatch",
  "yes",
  "ready",
  "cancelled",
  "partial",
  "sequenceNext",
  "succeeded"
]
const patchNames: readonly (SetupPatch | "progress")[] = [
  "no",
  "preview",
  "append",
  "freshProposal",
  "installApproval",
  "rulesApproval",
  "clearApprovals",
  "activated",
  "verification",
  "diagnosis",
  "failedActivation",
  "progress"
]
export const bindSetupReducer = <
  Model extends { readonly phase: SetupPhase; readonly revision: number },
  Action extends { readonly kind: string; readonly commandId?: number }
>(
  facts: Readonly<Record<SetupFact, (model: Model, action: Action) => boolean>>,
  patches: Readonly<
    Record<SetupPatch, (model: Model, action: Action, phase: SetupPhase, exit: number | undefined) => Model>
  > & { readonly progress: (model: Model, action: Action) => Model }
) => {
  for (const name of factNames)
    if (typeof facts[name] !== "function") throw new TypeError("Missing setup fact: " + name)
  for (const name of patchNames)
    if (typeof patches[name] !== "function") throw new TypeError("Missing setup materializer: " + name)
  return Object.freeze(setupBindReducer(Object.freeze({ ...facts }), Object.freeze({ ...patches })))
}
