import type {
  CredentialLifecycleResult,
  CredentialStateLockStatus,
  SecretServiceStatus
} from "@hapsland/credential-storage/credentials/owner"

export type LoginStorageObservation = {
  status: CredentialLifecycleResult["status"]
  generation: number
  stateLock: CredentialStateLockStatus
  savedUse: "active" | "suspended"
}
export type LoginModel = {
  phase: "CheckingStore" | "EnteringKey" | "SavingKey" | "Done" | "Cancelled"
  revision: number
  inputKind: "stdin"
  availability?: SecretServiceStatus
  storage?: LoginStorageObservation
}
export type LoginAction =
  | { kind: "checked"; commandId: number; status: SecretServiceStatus }
  | { kind: "entered" | "input-ended"; commandId: number }
  | { kind: "observed"; commandId: number; storage: LoginStorageObservation }
  | { kind: "exit" }
export type LoginEvent = { revision: number; action: LoginAction }
export type LoginCommand = { kind: "probe" | "input" | "save"; id: number }
export const initialLogin = (inputKind: LoginModel["inputKind"]): LoginModel => ({
  phase: "CheckingStore",
  revision: 0,
  inputKind
})
export const loginCommand = (model: LoginModel): LoginCommand | undefined => {
  if (model.phase === "CheckingStore") return { kind: "probe", id: model.revision }
  if (model.phase === "EnteringKey") return { kind: "input", id: model.revision }
  if (model.phase === "SavingKey") return { kind: "save", id: model.revision }
  return undefined
}
const move = (model: LoginModel, phase: LoginModel["phase"], patch: Partial<LoginModel> = {}): LoginModel => ({
  ...model,
  ...patch,
  phase,
  revision: model.revision + 1
})
const terminal = (model: LoginModel) => model
const transitions: Record<LoginModel["phase"], (model: LoginModel, action: LoginAction) => LoginModel> = {
  CheckingStore: (model, action) =>
    action.kind === "checked"
      ? move(model, action.status === "available" ? "EnteringKey" : "Done", { availability: action.status })
      : model,
  EnteringKey: (model, action) =>
    action.kind === "entered"
      ? move(model, "SavingKey")
      : action.kind === "input-ended"
        ? move(model, "Cancelled")
        : model,
  SavingKey: (model, action) => (action.kind === "observed" ? move(model, "Done", { storage: action.storage }) : model),
  Done: terminal,
  Cancelled: terminal
}
export function reduceLogin(model: LoginModel, event: LoginEvent): LoginModel {
  const action = event.action
  if (
    event.revision !== model.revision ||
    ["Done", "Cancelled"].includes(model.phase) ||
    ("commandId" in action && action.commandId !== model.revision)
  )
    return model
  if (action.kind === "exit") return model.phase === "SavingKey" ? model : move(model, "Cancelled")
  return transitions[model.phase](model, action)
}
