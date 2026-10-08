import {
  getDirectLoginCommand,
  bindDirectLoginReducer
} from "@hapsland/canonical-policy/canonical/direct-login-adapter"
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
export const loginCommand: (model: LoginModel) => LoginCommand | undefined = getDirectLoginCommand
const move = (model: LoginModel, phase: LoginModel["phase"], patch: Partial<LoginModel> = {}): LoginModel => ({
  ...model,
  ...patch,
  phase,
  revision: model.revision + 1
})
export const reduceLogin: (model: LoginModel, event: LoginEvent) => LoginModel = bindDirectLoginReducer(
  { available: (action: LoginAction) => (action as Extract<LoginAction, { kind: "checked" }>).status === "available" },
  {
    no: (model: LoginModel, _action: LoginAction, phase: LoginModel["phase"]) => move(model, phase),
    availability: (model: LoginModel, action: LoginAction, phase: LoginModel["phase"]) =>
      move(model, phase, { availability: (action as Extract<LoginAction, { kind: "checked" }>).status }),
    storage: (model: LoginModel, action: LoginAction, phase: LoginModel["phase"]) =>
      move(model, phase, { storage: (action as Extract<LoginAction, { kind: "observed" }>).storage })
  }
)
