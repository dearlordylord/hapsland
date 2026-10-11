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
export const rulesCommand = (model: RulesModel): RulesCommand | undefined => {
  if (model.phase === "Previewing" && model.scope)
    return { kind: "preview", id: model.revision, action: model.action, scope: model.scope }
  if (model.phase === "Applying" && model.plan) return { kind: "apply", id: model.revision, plan: model.plan }
}
type Action = RulesEvent["action"]
const back = (model: RulesModel): RulesModel => {
  if (["Preview", "Previewing"].includes(model.phase))
    return move(model, "Scope", { plan: undefined, outcome: undefined })
  return model.phase === "Approval" ? move(model, "Preview") : model
}
const previewed = (model: RulesModel, action: Action): RulesModel => {
  if (action.kind !== "previewed" || action.plan.scope !== model.scope || action.plan.action !== model.action)
    return model
  return move(model, "Preview", { plan: action.plan })
}
const approved = (model: RulesModel, action: Action): RulesModel => {
  if (action.kind !== "approve" || action.digest !== model.plan?.digest) return model
  return move(model, action.yes ? "Applying" : "Done", action.yes ? {} : { outcome: "declined" })
}
const observed = (model: RulesModel, action: Action): RulesModel => {
  if (action.kind !== "observed") return model
  return action.outcome === "stale"
    ? move(model, "Previewing", { plan: undefined, outcome: "stale" })
    : move(model, "Done", { outcome: action.outcome })
}
const terminal = (model: RulesModel) => model
const transitions: Record<RulesModel["phase"], (model: RulesModel, action: Action) => RulesModel> = {
  Scope: (model, action) =>
    action.kind === "scope"
      ? move(model, "Previewing", { scope: action.scope, plan: undefined, outcome: undefined })
      : model,
  Previewing: previewed,
  Preview: (model, action) => (action.kind === "continue" ? move(model, "Approval") : model),
  Approval: approved,
  Applying: observed,
  Done: terminal,
  Cancelled: terminal
}
export function reduceRules(model: RulesModel, event: RulesEvent): RulesModel {
  const action = event.action
  if (
    event.revision !== model.revision ||
    ["Done", "Cancelled"].includes(model.phase) ||
    ("commandId" in action && action.commandId !== model.revision)
  )
    return model
  if (action.kind === "exit") return model.phase === "Applying" ? model : move(model, "Cancelled", { plan: undefined })
  return action.kind === "back" ? back(model) : transitions[model.phase](model, action)
}
export const rulesPreview = (plan: RulePlan): string =>
  `Rule change preview\nAction: ${plan.action}\nScope: ${plan.scope}\nConfiguration: ${plan.configuration}\nRule: ${plan.rule}\n${plan.action === "create" || plan.action === "connect" ? "This will connect the rule. " : ""}The rule will be ${plan.enabled ? "enabled" : "disabled"}.\nApproval digest: ${plan.digest}\nSelection and preview do not authorize writes.`
