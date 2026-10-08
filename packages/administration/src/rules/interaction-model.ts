import { getRulesCommand, bindRulesReducer } from "@hapsland/canonical-policy/canonical/rules-adapter"
// Rules conversation policy; existing rule owners govern plans and writes.
export type RuleAction = "create" | "connect" | "enable" | "disable"
export type RuleScope = "project" | "personal"
export type RulePlan = {
  digest: string
  action: RuleAction
  scope: RuleScope
  configuration: string
  rule: string
  enabled: boolean
}
export type RuleOutcome = "applied" | "declined" | "failed" | "partial" | "stale"
export type RulesModel = {
  phase: "Scope" | "Previewing" | "Preview" | "Approval" | "Applying" | "Done" | "Cancelled"
  revision: number
  action: RuleAction
  scope?: RuleScope
  plan?: RulePlan | undefined
  outcome?: RuleOutcome | undefined
}
export type RulesEvent = {
  revision: number
  action:
    | { kind: "scope"; scope: RuleScope }
    | { kind: "continue" }
    | { kind: "approve"; yes: boolean; digest: string }
    | { kind: "back" | "exit" }
    | { kind: "previewed"; commandId: number; plan: RulePlan }
    | { kind: "observed"; commandId: number; outcome: Exclude<RuleOutcome, "declined"> }
}
export type RulesCommand =
  | { kind: "preview"; id: number; action: RuleAction; scope: RuleScope }
  | { kind: "apply"; id: number; plan: RulePlan }
export const initialRules = (action: RuleAction = "create"): RulesModel => ({ phase: "Scope", revision: 0, action })
const move = (model: RulesModel, phase: RulesModel["phase"], patch: Partial<RulesModel> = {}): RulesModel => ({
  ...model,
  ...patch,
  phase,
  revision: model.revision + 1
})
export const rulesCommand: (model: RulesModel) => RulesCommand | undefined = getRulesCommand
type Action = RulesEvent["action"]
const requireAction = <Kind extends Action["kind"]>(action: Action, kind: Kind): Extract<Action, { kind: Kind }> => {
  if (action.kind !== kind) throw new TypeError("Rules materializer requires " + kind)
  return action as Extract<Action, { kind: Kind }>
}
export const reduceRules: (model: RulesModel, event: RulesEvent) => RulesModel = bindRulesReducer<RulesModel, Action>(
  (model, event) =>
    event.revision === model.revision && (!("commandId" in event.action) || event.action.commandId === model.revision),
  {
    planMatches: (model, action) =>
      action.kind === "previewed" && action.plan.scope === model.scope && action.plan.action === model.action,
    digestMatches: (model, action) => action.kind === "approve" && action.digest === model.plan?.digest,
    yes: (_model, action) => action.kind === "approve" && action.yes,
    stale: (_model, action) => action.kind === "observed" && action.outcome === "stale"
  },
  {
    no: (model, _action, phase) => move(model, phase),
    scope: (model, action, phase) =>
      move(model, phase, { scope: requireAction(action, "scope").scope, plan: undefined, outcome: undefined }),
    clearPlanOutcome: (model, _action, phase) => move(model, phase, { plan: undefined, outcome: undefined }),
    preview: (model, action, phase) => move(model, phase, { plan: requireAction(action, "previewed").plan }),
    declined: (model, _action, phase) => move(model, phase, { outcome: "declined" }),
    stale: (model, _action, phase) => move(model, phase, { plan: undefined, outcome: "stale" }),
    outcome: (model, action, phase) => move(model, phase, { outcome: requireAction(action, "observed").outcome }),
    clearPlan: (model, _action, phase) => move(model, phase, { plan: undefined })
  }
)
export const rulesPreview = (plan: RulePlan): string =>
  `Rule change preview\nAction: ${plan.action}\nScope: ${plan.scope}\nConfiguration: ${plan.configuration}\nRule: ${plan.rule}\n${plan.action === "create" || plan.action === "connect" ? "This will connect the rule. " : ""}The rule will be ${plan.enabled ? "enabled" : "disabled"}.\nApproval digest: ${plan.digest}\nSelection and preview do not authorize writes.`
