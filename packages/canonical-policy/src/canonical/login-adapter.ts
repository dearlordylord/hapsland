import {
  loginCommandName,
  loginRouteIndex,
  loginRoutePlans,
  type LoginPlan as BendPlan
} from "@hapsland/agent-flow-bend/login-policy"

const phases = [
  "SelectingDestination",
  "PreparingTarget",
  "EnteringKey",
  "ConfirmingSave",
  "SavingKey",
  "CheckingActive",
  "Done",
  "Cancelled"
] as const
const actions = ["selected", "prepared", "entered", "approved", "observed", "active", "back", "exit"] as const
export type LoginPhase = (typeof phases)[number]
export type LoginActionKind = (typeof actions)[number]
export type LoginCommandKind = "choose" | "prepare" | "input" | "confirm" | "save" | "active"
export type LoginPlan =
  | Readonly<{ kind: "hold" | "reset" }>
  | Readonly<{ kind: "advance"; phase: LoginPhase; patch: "none" | "destination" | "proposal" | "storage" | "active" }>
const phaseIds = Object.fromEntries(phases.map((phase, index) => [phase, index])) as Record<LoginPhase, number>
const patchNames = {
  LoginNoPatch: "none",
  LoginDestinationPatch: "destination",
  LoginProposalPatch: "proposal",
  LoginStoragePatch: "storage",
  LoginActivePatch: "active"
} as const
export const loginCommandKind: (phase: LoginPhase) => LoginCommandKind | undefined = loginCommandName
const decodePlan = (result: BendPlan): LoginPlan => {
  let plan: LoginPlan
  if (result.$ === "LoginHold") plan = { kind: "hold" }
  else if (result.$ === "LoginReset") plan = { kind: "reset" }
  else if (result.$ === "LoginAdvance") {
    const next = result.phase.$.slice(5) as LoginPhase
    if (typeof phaseIds[next] !== "number" || !Object.hasOwn(patchNames, result.patch.$))
      throw new TypeError("Unknown login transition payload")
    plan = { kind: "advance", phase: next, patch: patchNames[result.patch.$] }
  } else throw new TypeError("Unknown login transition")
  return Object.freeze(plan)
}
// The generator specializes the exhaustive Bend table; native payloads never enter it.
export const loginNavigationPlans: readonly (readonly LoginPlan[])[] = Object.freeze(
  loginRoutePlans.map((options) => Object.freeze(options.map(decodePlan)))
)
for (const phase of phases)
  for (const action of actions) {
    const index = loginRouteIndex(phase, action)
    if (!Number.isInteger(index) || loginNavigationPlans[index] === undefined)
      throw new TypeError("Unknown login route")
  }
export const loginNavigationIndex: (phase: LoginPhase, action: LoginActionKind) => number = loginRouteIndex
