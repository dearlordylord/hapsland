import {
  getSetupCommand,
  getSetupInstallationCanProceed,
  getSetupInstallationWasWritten,
  getSetupReadiness,
  bindSetupReducer
} from "@hapsland/canonical-policy/canonical/setup-adapter"
import type { SetupProgressObservation } from "./setup.ts"
import type { VerificationOutcome } from "./verification-conversation.ts"

// Only safe owner observations enter the model. Credential values and raw owner
// records stay inside the interpreter and the existing setup/credential owners.
type ObservedStage = Pick<SetupProgressObservation["stages"][number], "stage" | "status">
export type SetupObservation = {
  status: string
  stages: readonly ObservedStage[]
  credential?: { status: string; generation?: number }
  installDigest?: string
  rulesDigest?: string
}
export type SetupModel = {
  phase:
    | "Previewing"
    | "HookApproval"
    | "RulesApproval"
    | "Applying"
    | "Activating"
    | "Verifying"
    | "Diagnosing"
    | "Done"
    | "Cancelled"
    | "Back"
    | "Failed"
  revision: number
  progressSequence: number
  observations: readonly SetupObservation[]
  proposal?: SetupObservation
  installApproved?: string | undefined
  rulesApproved?: string | undefined
  activation: "not-attempted" | "completed" | "failed"
  verification?: VerificationOutcome
  readiness?: string
  exitCode: number
}
export type SetupAction =
  | { kind: "progressed"; commandId: number; sequence: number; observation: SetupObservation }
  | { kind: "previewed" | "applied"; commandId: number; observation: SetupObservation }
  | { kind: "approveHooks" | "approveRules"; digest: string; yes: boolean }
  | { kind: "activated" | "stale" | "failed"; commandId: number }
  | { kind: "verified"; commandId: number; outcome: VerificationOutcome }
  | { kind: "diagnosed"; commandId: number; status: string; succeeded: boolean }
  | { kind: "back" | "exit" }
export type SetupEvent = { revision: number; action: SetupAction }
export type SetupCommand = { kind: "preview" | "apply" | "activate" | "verify" | "diagnose"; id: number }
export const initialSetup = (): SetupModel => ({
  phase: "Previewing",
  revision: 0,
  progressSequence: 0,
  observations: [],
  activation: "not-attempted",
  exitCode: 0
})
export const setupCommand: (model: SetupModel) => SetupCommand | undefined = getSetupCommand
export const setupStageStatus = (
  observation: SetupObservation | undefined,
  stage: ObservedStage["stage"]
): ObservedStage["status"] | undefined => observation?.stages.find((item) => item.stage === stage)?.status
export const setupObservationReady = (observation: SetupObservation | undefined): boolean =>
  getSetupReadiness(setupStageStatus, observation)
const observationFor = (model: SetupModel, action: SetupAction): SetupObservation | undefined =>
  "observation" in action ? action.observation : model.observations.at(-1)
const actionObservation = (action: SetupAction): SetupObservation => {
  if (!("observation" in action)) throw new TypeError("Setup observation materializer requires an observation")
  return action.observation
}
const move = (
  model: SetupModel,
  phase: SetupModel["phase"],
  exit: number | undefined,
  patch: Partial<SetupModel> = {}
): SetupModel => ({
  ...model,
  ...patch,
  ...(exit === undefined ? {} : { exitCode: exit }),
  progressSequence: 0,
  phase,
  revision: model.revision + 1
})
const preview = (
  model: SetupModel,
  action: SetupAction,
  phase: SetupModel["phase"],
  exit: number | undefined
): SetupModel => {
  const observation = actionObservation(action)
  return move(model, phase, exit, {
    proposal: observation,
    observations: [...model.observations, observation],
    installApproved: undefined,
    rulesApproved: undefined
  })
}
export const reduceSetup: (model: SetupModel, event: SetupEvent) => SetupModel = bindSetupReducer(
  {
    compatOk: (model: SetupModel, action: SetupAction) =>
      setupStageStatus(observationFor(model, action), "compatibility") === "complete",
    proceed: (model: SetupModel, action: SetupAction) =>
      getSetupInstallationCanProceed(setupStageStatus(observationFor(model, action), "installation")),
    written: (model: SetupModel, action: SetupAction) =>
      getSetupInstallationWasWritten(setupStageStatus(observationFor(model, action), "installation")),
    pending: (model: SetupModel, action: SetupAction) =>
      setupStageStatus(observationFor(model, action), "installation") === "pending",
    installDigest: (model: SetupModel, action: SetupAction) => Boolean(observationFor(model, action)?.installDigest),
    installPresent: (model: SetupModel, action: SetupAction) =>
      observationFor(model, action)?.installDigest !== undefined,
    rulesDigest: (model: SetupModel, action: SetupAction) =>
      Boolean(
        action.kind === "approveHooks" ? model.proposal?.rulesDigest : observationFor(model, action)?.rulesDigest
      ),
    digestMatch: (model: SetupModel, action: SetupAction) =>
      action.kind === "approveHooks"
        ? action.digest === model.proposal?.installDigest
        : action.kind === "approveRules" && action.digest === model.proposal?.rulesDigest,
    yes: (_model: SetupModel, action: SetupAction) => "yes" in action && action.yes,
    ready: (model: SetupModel, action: SetupAction) => setupObservationReady(observationFor(model, action)),
    cancelled: (model: SetupModel, action: SetupAction) =>
      action.kind === "verified"
        ? action.outcome.kind === "cancelled"
        : observationFor(model, action)?.credential?.status === "cancelled",
    partial: (model: SetupModel, action: SetupAction) => observationFor(model, action)?.status === "partial",
    sequenceNext: (model: SetupModel, action: SetupAction) =>
      action.kind === "progressed" && action.sequence === model.progressSequence + 1,
    succeeded: (_model: SetupModel, action: SetupAction) => action.kind === "diagnosed" && action.succeeded
  },
  {
    no: (model: SetupModel, _action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) =>
      move(model, phase, exit),
    preview,
    freshProposal: preview,
    append: (model: SetupModel, action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) =>
      move(model, phase, exit, { observations: [...model.observations, actionObservation(action)] }),
    installApproval: (model: SetupModel, action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) => {
      if (action.kind !== "approveHooks") throw new TypeError("Setup install approval requires its matching action")
      return move(model, phase, exit, { installApproved: action.digest })
    },
    rulesApproval: (model: SetupModel, action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) => {
      if (action.kind !== "approveRules") throw new TypeError("Setup rules approval requires its matching action")
      return move(model, phase, exit, { rulesApproved: action.digest })
    },
    clearApprovals: (model: SetupModel, _action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) =>
      move(model, phase, exit, { installApproved: undefined, rulesApproved: undefined }),
    activated: (model: SetupModel, _action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) =>
      move(model, phase, exit, { activation: "completed" }),
    verification: (model: SetupModel, action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) => {
      if (action.kind !== "verified")
        throw new TypeError("Setup verification materializer requires its matching action")
      return move(model, phase, exit, { verification: action.outcome })
    },
    diagnosis: (model: SetupModel, action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) => {
      if (action.kind !== "diagnosed") throw new TypeError("Setup diagnosis materializer requires its matching action")
      return move(model, phase, exit, { readiness: action.status })
    },
    failedActivation: (model: SetupModel, _action: SetupAction, phase: SetupModel["phase"], exit: number | undefined) =>
      move(model, phase, exit, { activation: "failed" }),
    progress: (model: SetupModel, action: SetupAction) => {
      if (action.kind !== "progressed") throw new TypeError("Setup progress materializer requires its matching action")
      return { ...model, progressSequence: action.sequence, observations: [...model.observations, action.observation] }
    }
  }
)
