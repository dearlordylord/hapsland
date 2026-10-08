import {
  loginCommandKind,
  loginNavigationPlans,
  loginNavigationIndex,
  type LoginPlan
} from "@hapsland/canonical-policy/canonical/login-adapter"
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
  const kind = loginCommandKind(model.phase)
  return kind === undefined ? undefined : { kind, id: model.revision }
}

const move = (model: LoginModel, phase: LoginModel["phase"], patch: Partial<LoginModel> = {}): LoginModel => ({
  ...model,
  ...patch,
  phase,
  revision: model.revision + 1
})
const restart = (model: LoginModel): LoginModel => ({ phase: "SelectingDestination", revision: model.revision + 1 })
type Materialize = (model: LoginModel, action: LoginAction) => LoginModel
const materialize = (plan: LoginPlan): Materialize | undefined => {
  if (plan.kind === "hold") return undefined
  if (plan.kind === "reset") return (model) => restart(model)
  if (plan.kind !== "advance") throw new TypeError("Unknown login navigation plan")
  const phase = plan.phase
  switch (plan.patch) {
    case "none":
      return (model) => move(model, phase)
    case "destination":
      return (model, action) => {
        if (action.kind !== "selected") throw new TypeError("Login destination patch requires selection")
        return move(model, phase, { destination: action.destination })
      }
    case "proposal":
      return (model, action) => {
        if (action.kind !== "prepared") throw new TypeError("Login proposal patch requires preparation")
        return move(model, phase, { proposal: action.proposal })
      }
    case "storage":
      return (model, action) => {
        if (action.kind !== "observed") throw new TypeError("Login storage patch requires observation")
        return move(model, phase, { storage: action.storage })
      }
    case "active":
      return (model, action) => {
        if (action.kind !== "active") throw new TypeError("Login active patch requires observation")
        return move(model, phase, { active: action.active })
      }
  }
}
// Bind native patch application once to the checked source-free Bend plans.
const reducers = loginNavigationPlans.map((plans) => plans.map((plan) => ({ apply: materialize(plan) })))
export const reduceLogin = (model: LoginModel, event: LoginEvent): LoginModel => {
  const action = event.action
  if (event.revision !== model.revision || ("commandId" in action && action.commandId !== model.revision)) return model
  const options = reducers[loginNavigationIndex(model.phase, action.kind)]!
  let index = 0
  if (options.length !== 1) {
    switch (action.kind) {
      case "entered":
        index = Number(model.proposal !== undefined && action.proposalId === model.proposal.id)
        break
      case "approved":
        index =
          Number(model.proposal !== undefined && action.proposalId === model.proposal.id) | (Number(action.yes) << 2)
        break
      case "prepared":
        index = Number(action.proposal.availability === "blocked") << 1
        break
      case "observed":
        index = Number(action.storage.status === "stale") << 3
        break
    }
  }
  const apply = options[index]!.apply
  return apply === undefined ? model : apply(model, action)
}
