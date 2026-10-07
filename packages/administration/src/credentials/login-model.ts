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
export const reduceLogin = (model: LoginModel, event: LoginEvent): LoginModel => {
  const action = event.action
  if (
    model.phase === "Done" ||
    model.phase === "Cancelled" ||
    event.revision !== model.revision ||
    ("commandId" in action && action.commandId !== model.revision)
  )
    return model
  if (action.kind === "exit")
    return model.phase === "SavingKey" || model.phase === "CheckingActive" ? model : move(model, "Cancelled")
  if (action.kind === "back")
    return model.phase === "EnteringKey" || model.phase === "ConfirmingSave" ? restart(model) : model
  if (model.phase === "SelectingDestination" && action.kind === "selected")
    return move(model, "PreparingTarget", { destination: action.destination })
  if (model.phase === "PreparingTarget" && action.kind === "prepared")
    return action.proposal.availability === "blocked"
      ? restart(model)
      : move(model, "EnteringKey", { proposal: action.proposal })
  if (model.phase === "EnteringKey" && action.kind === "entered" && action.proposalId === model.proposal?.id)
    return move(model, "ConfirmingSave")
  if (model.phase === "ConfirmingSave" && action.kind === "approved" && action.proposalId === model.proposal?.id)
    return move(model, action.yes ? "SavingKey" : "Cancelled")
  if (model.phase === "SavingKey" && action.kind === "observed")
    return action.storage.status === "stale"
      ? move(model, "PreparingTarget")
      : move(model, "CheckingActive", { storage: action.storage })
  if (model.phase === "CheckingActive" && action.kind === "active")
    return move(model, "Done", { active: action.active })
  return model
}
