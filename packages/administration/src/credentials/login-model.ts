import type {
  CredentialLifecycleResult,
  CredentialStateLockStatus,
  SecretServiceStatus
} from "@hapsland/credential-storage/credentials/secret-service"

export type LoginStorageObservation = {
  status: CredentialLifecycleResult["status"]
  generation: number
  stateLock: CredentialStateLockStatus
  savedUse: "active" | "suspended"
}
export type LoginModel = {
  phase: "CheckingStore" | "EnteringKey" | "SavingKey" | "Done" | "Cancelled"
  revision: number
  inputKind: "terminal" | "stdin"
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
export function reduceLogin(model: LoginModel, event: LoginEvent): LoginModel {
  const action = event.action
  if (
    event.revision !== model.revision ||
    model.phase === "Done" ||
    model.phase === "Cancelled" ||
    ("commandId" in action && action.commandId !== model.revision)
  )
    return model
  const move = (phase: LoginModel["phase"], patch: Partial<LoginModel> = {}): LoginModel => ({
    ...model,
    ...patch,
    phase,
    revision: model.revision + 1
  })
  if (action.kind === "exit") return model.phase === "SavingKey" ? model : move("Cancelled")
  if (model.phase === "CheckingStore" && action.kind === "checked")
    return move(action.status === "available" ? "EnteringKey" : "Done", { availability: action.status })
  if (model.phase === "EnteringKey" && action.kind === "input-ended") return move("Cancelled")
  if (model.phase === "EnteringKey" && action.kind === "entered") return move("SavingKey")
  if (model.phase === "SavingKey" && action.kind === "observed") return move("Done", { storage: action.storage })
  return model
}
