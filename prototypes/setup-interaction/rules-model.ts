// THROWAWAY: workflow-specific pure model; previews and mutation belong to the fake owner.
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
  plan?: RulePlan
  outcome?: RuleOutcome
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
export function reduceRules(model: RulesModel, event: RulesEvent): RulesModel {
  if (event.revision !== model.revision || model.phase === "Done" || model.phase === "Cancelled") return model
  const action = event.action
  if (action.kind === "exit") return model.phase === "Applying" ? model : move(model, "Cancelled", { plan: undefined })
  if (action.kind === "back") {
    if (model.phase === "Preview" || model.phase === "Previewing")
      return move(model, "Scope", { plan: undefined, outcome: undefined })
    if (model.phase === "Approval") return move(model, "Preview")
    return model
  }
  if (model.phase === "Scope" && action.kind === "scope")
    return move(model, "Previewing", { scope: action.scope, plan: undefined, outcome: undefined })
  if (
    model.phase === "Previewing" &&
    action.kind === "previewed" &&
    action.commandId === model.revision &&
    action.plan.scope === model.scope &&
    action.plan.action === model.action
  )
    return move(model, "Preview", { plan: action.plan })
  if (model.phase === "Preview" && action.kind === "continue") return move(model, "Approval")
  if (model.phase === "Approval" && action.kind === "approve" && action.digest === model.plan?.digest)
    return move(model, action.yes ? "Applying" : "Done", action.yes ? {} : { outcome: "declined" })
  if (model.phase === "Applying" && action.kind === "observed" && action.commandId === model.revision) {
    if (action.outcome === "stale") return move(model, "Previewing", { plan: undefined, outcome: "stale" })
    return move(model, "Done", { outcome: action.outcome })
  }
  return model
}
export const rulesPreview = (plan: RulePlan): string =>
  `Rule change preview (simulated)\nAction: ${plan.action}\nScope: ${plan.scope}\nConfiguration: ${plan.configuration}\nRule: ${plan.rule}\n${plan.action === "create" || plan.action === "connect" ? "This will connect the rule. " : ""}The rule will be ${plan.enabled ? "enabled" : "disabled"}.\nApproval digest: ${plan.digest}\nNo real files are changed.`
