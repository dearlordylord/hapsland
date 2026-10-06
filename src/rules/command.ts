import { Config, Effect, Option } from "effect"
import type { RulesOptions } from "./cli-definition.ts"
import { discoverWorkingTreeRoot } from "../repository/root.ts"
import { askConfirmation } from "../onboarding/confirmation.ts"
import { loadRuleInventory, formatRuleInventory, formatRule, explainRule } from "./inventory.ts"
import { applyRuleChange, previewRuleChange, type RuleChange } from "./management.ts"

export const formatRuleChangePreview = (plan: Effect.Success<ReturnType<typeof previewRuleChange>>): string =>
  `Scope: ${plan.change.scope}\nConfiguration: ${plan.configurationPath}\n${plan.path === undefined ? "" : `Rule file: ${plan.path}\n`}${plan.change.action === "create" || plan.change.action === "connect" ? `This will connect the rule in ${plan.configurationPath}. The rule will be ${plan.enabled ? "enabled" : "disabled"}.\n` : `The rule will be ${plan.enabled ? "enabled" : "disabled"}.\n`}`

type RuleInspectionAction = "list" | "show" | "explain"
const inspectionAction = (action: RuleInspectionAction | RuleChange["action"]): action is RuleInspectionAction =>
  action === "list" || action === "show" || action === "explain"
const inspectionOutput = (
  action: "show" | "explain",
  options: RulesOptions,
  rule: Parameters<typeof formatRule>[0],
  explanation: ReturnType<typeof explainRule>
): string => {
  if (action === "explain")
    return options.json ? JSON.stringify(explanation) + "\n" : explanation.reasons.join("\n") + "\n"
  return options.json ? JSON.stringify(rule) + "\n" : formatRule(rule)
}
const inspectRules = Effect.fn("Rules.inspectCommand")(function* (
  action: RuleInspectionAction,
  options: RulesOptions,
  root: string,
  configuration: Parameters<typeof loadRuleInventory>[1]
) {
  const inventory = yield* loadRuleInventory(root, configuration)
  if (action === "list")
    process.stdout.write(options.json ? JSON.stringify(inventory) + "\n" : formatRuleInventory(inventory))
  else {
    const rule = inventory.rules.find((candidate) => candidate.id === options.id)
    if (rule === undefined)
      return yield* Effect.fail(
        new Error(`Unknown rule identity '${options.id}'. Run hapsland rules list to find connected identities.`)
      )
    const explanation = explainRule(rule, inventory, options.path)
    process.stdout.write(inspectionOutput(action, options, rule, explanation))
  }
})
const changeScope = Effect.fn("Rules.changeScope")(function* (scope: RulesOptions["scope"], terminal: boolean) {
  if (scope === undefined && !terminal)
    return yield* Effect.fail(new Error("Unattended rule changes require --scope project or --scope personal."))
  return (
    scope ??
    ((yield* askConfirmation("Use personal scope instead of the default project scope?"))
      ? ("personal" as const)
      : ("project" as const))
  )
})
const requestedRuleChange = Effect.fn("Rules.requestedChange")(function* (
  action: RuleChange["action"],
  scope: RuleChange["scope"],
  options: RulesOptions
): Effect.fn.Return<RuleChange, Error> {
  if (action === "connect") {
    if (options.path === undefined)
      return yield* Effect.fail(new Error("rules connect requires --path to an existing JSON rule."))
    return { action, scope, path: options.path }
  }
  if (options.id === undefined)
    return yield* Effect.fail(new Error(`rules ${action} requires --id with a rule identity.`))
  return { action, scope, id: options.id }
})
const confirmRuleChange = Effect.fn("Rules.confirmChange")(function* (
  plan: Effect.Success<ReturnType<typeof previewRuleChange>>,
  terminal: boolean
) {
  if (!terminal) return true
  process.stderr.write(formatRuleChangePreview(plan))
  return yield* askConfirmation("Apply these rule changes?")
})
const ruleChangeOutput = (
  result: Effect.Success<ReturnType<typeof applyRuleChange>>,
  change: RuleChange,
  json: boolean
): string => {
  if (json) return JSON.stringify(result) + "\n"
  const activation =
    change.action === "create" || change.action === "connect"
      ? ` Rule is connected and ${result.enabled ? "enabled" : "disabled"}.`
      : ""
  const file = "path" in result ? `Rule file: ${result.path}\n` : ""
  return `${change.action} completed in ${change.scope} scope.${activation}\nConfiguration: ${result.configurationPath}\n${file}Local structural validation only; classifier quality was not validated.\n`
}
export const runRulesCommand = Effect.fn("Rules.command")(function* (options: RulesOptions) {
  const root = yield* discoverWorkingTreeRoot(process.cwd())
  const configured = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  const configuration = configured === undefined ? {} : { userConfigPath: configured }
  const action = options.action
  const terminal = Boolean(process.stdin.isTTY && process.stderr.isTTY)
  if (inspectionAction(action)) return yield* inspectRules(action, options, root, configuration)
  const scope = yield* changeScope(options.scope, terminal)
  const change = yield* requestedRuleChange(action, scope, options)
  const plan = yield* previewRuleChange(root, change, configuration)
  if (!(yield* confirmRuleChange(plan, terminal))) return
  const result = yield* applyRuleChange(root, change, plan.digest, configuration)
  process.stdout.write(ruleChangeOutput(result, change, options.json))
})
