import type { CredentialProposal, SaveDestination } from "@hapsland/runtime-inputs/credentials/policy"
import type { ActiveCredentialObservation, CredentialSaveResult } from "@hapsland/credential-storage/credentials/owner"

export type LoginModel = {
  phase:
    | "SelectingDestination"
    | "PreparingTarget"
    | "EnteringKey"
    | "ConfirmingSave"
    | "SavingKey"
    | "CheckingActive"
    | "Done"
    | "Cancelled"
  revision: number
  destination?: SaveDestination
  proposal?: CredentialProposal
  storage?: CredentialSaveResult
  active?: ActiveCredentialObservation
}
export type LoginAction =
  | { kind: "selected"; destination: SaveDestination }
  | { kind: "prepared"; commandId: number; proposal: CredentialProposal }
  | { kind: "entered"; commandId: number; proposalId: string }
  | { kind: "approved"; proposalId: string; yes: boolean }
  | { kind: "observed"; commandId: number; storage: CredentialSaveResult }
  | { kind: "active"; commandId: number; active: ActiveCredentialObservation }
  | { kind: "back" | "exit" }
export type LoginEvent = { revision: number; action: LoginAction }
export type LoginCommand = { kind: "choose" | "prepare" | "input" | "confirm" | "save" | "active"; id: number }
export const initialLogin = (): LoginModel => ({ phase: "SelectingDestination", revision: 0 })
export const loginCommand = (model: LoginModel): LoginCommand | undefined => {
  const commands = {
    SelectingDestination: "choose",
    PreparingTarget: "prepare",
    EnteringKey: "input",
    ConfirmingSave: "confirm",
    SavingKey: "save",
    CheckingActive: "active"
  } as const
  return model.phase === "Done" || model.phase === "Cancelled"
    ? undefined
    : { kind: commands[model.phase], id: model.revision }
}
const move = (model: LoginModel, phase: LoginModel["phase"], patch: Partial<LoginModel> = {}): LoginModel => ({
  ...model,
  ...patch,
  phase,
  revision: model.revision + 1
})
const restart = (model: LoginModel): LoginModel => ({ phase: "SelectingDestination", revision: model.revision + 1 })
const phaseTransitions: Record<LoginModel["phase"], (model: LoginModel, action: LoginAction) => LoginModel> = {
  SelectingDestination: (model, action) =>
    action.kind === "selected" ? move(model, "PreparingTarget", { destination: action.destination }) : model,
  PreparingTarget: (model, action) =>
    action.kind === "prepared"
      ? action.proposal.availability === "blocked"
        ? restart(model)
        : move(model, "EnteringKey", { proposal: action.proposal })
      : model,
  EnteringKey: (model, action) =>
    action.kind === "entered" && action.proposalId === model.proposal?.id ? move(model, "ConfirmingSave") : model,
  ConfirmingSave: (model, action) =>
    action.kind === "approved" && action.proposalId === model.proposal?.id
      ? move(model, action.yes ? "SavingKey" : "Cancelled")
      : model,
  SavingKey: (model, action) =>
    action.kind === "observed"
      ? action.storage.status === "stale"
        ? move(model, "PreparingTarget")
        : move(model, "CheckingActive", { storage: action.storage })
      : model,
  CheckingActive: (model, action) =>
    action.kind === "active" ? move(model, "Done", { active: action.active }) : model,
  Done: (model) => model,
  Cancelled: (model) => model
}
const currentLoginEvent = (model: LoginModel, event: LoginEvent): boolean =>
  model.phase !== "Done" &&
  model.phase !== "Cancelled" &&
  event.revision === model.revision &&
  (!("commandId" in event.action) || event.action.commandId === model.revision)
const navigateLogin = (model: LoginModel, action: LoginAction): LoginModel => {
  if (action.kind === "exit")
    return model.phase === "SavingKey" || model.phase === "CheckingActive" ? model : move(model, "Cancelled")
  return model.phase === "EnteringKey" || model.phase === "ConfirmingSave" ? restart(model) : model
}
export const reduceLogin = (model: LoginModel, event: LoginEvent): LoginModel => {
  if (!currentLoginEvent(model, event)) return model
  if (event.action.kind === "exit" || event.action.kind === "back") return navigateLogin(model, event.action)
  return phaseTransitions[model.phase](model, event.action)
}
