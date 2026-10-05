import { Config, Effect, Option } from "effect"
import type { RulesOptions } from "../cli-command.ts"
import { discoverWorkingTreeRoot } from "../repository/root.ts"
import { askConfirmation } from "../onboarding/confirmation.ts"
import { loadRuleInventory, formatRuleInventory, formatRule, explainRule } from "./inventory.ts"
import { applyRuleChange, previewRuleChange, type RuleChange } from "./management.ts"

export const formatRuleChangePreview = (plan: Effect.Success<ReturnType<typeof previewRuleChange>>): string =>
  `Scope: ${plan.change.scope}\nConfiguration: ${plan.configurationPath}\n${plan.path === undefined ? "" : `Rule file: ${plan.path}\n`}${plan.change.action === "create" || plan.change.action === "connect" ? `This will connect the rule in ${plan.configurationPath}. The rule will be ${plan.enabled ? "enabled" : "disabled"}.\n` : `The rule will be ${plan.enabled ? "enabled" : "disabled"}.\n`}`

export const runRulesCommand = Effect.fn("Rules.command")(function* (options: RulesOptions) {
  const root = yield* discoverWorkingTreeRoot(process.cwd())
  const configured = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  const configuration = configured === undefined ? {} : { userConfigPath: configured }
  const action = Option.getOrElse(options.action, () => "list" as const)
  const terminal = Boolean(process.stdin.isTTY && process.stderr.isTTY)
  if (action === "list" || action === "show" || action === "explain") {
    const inventory = yield* loadRuleInventory(root, configuration)
    if (action === "list")
      process.stdout.write(options.json ? JSON.stringify(inventory) + "\n" : formatRuleInventory(inventory))
    else {
      const rule = inventory.rules.find((candidate) => candidate.id === options.id)
      if (rule === undefined)
        return yield* Effect.fail(new Error("Use rules show --id with an identity from rules list."))
      const explanation = explainRule(rule, inventory, options.path)
      process.stdout.write(
        action === "explain"
          ? options.json
            ? JSON.stringify(explanation) + "\n"
            : explanation.reasons.join("\n") + "\n"
          : options.json
            ? JSON.stringify(rule) + "\n"
            : formatRule(rule)
      )
    }
    return
  }
  if (options.scope === undefined && !terminal)
    return yield* Effect.fail(new Error("Unattended rule changes require --scope project or --scope personal."))
  const scope =
    options.scope ??
    ((yield* askConfirmation("Use personal scope instead of the default project scope?")) ? "personal" : "project")
  let change: RuleChange
  if (action === "connect") {
    if (options.path === undefined)
      return yield* Effect.fail(new Error("rules connect requires --path to an existing JSON rule."))
    change = { action, scope, path: options.path }
  } else {
    if (options.id === undefined)
      return yield* Effect.fail(
        new Error(
          `rules ${action} requires --id ${action === "create" ? "with a rule identity" : "with a rule identity"}.`
        )
      )
    change = { action, scope, id: options.id }
  }
  const plan = yield* previewRuleChange(root, change, configuration)
  if (terminal) {
    process.stderr.write(formatRuleChangePreview(plan))
    if (!(yield* askConfirmation("Apply these rule changes?"))) return
  }
  const result = yield* applyRuleChange(root, change, plan.digest, configuration)
  process.stdout.write(
    options.json
      ? JSON.stringify(result) + "\n"
      : `${action} completed in ${scope} scope.${action === "create" || action === "connect" ? ` Rule is connected and ${result.enabled ? "enabled" : "disabled"}.` : ""}\nConfiguration: ${result.configurationPath}\n${"path" in result ? `Rule file: ${result.path}\n` : ""}Local structural validation only; classifier quality was not validated.\n`
  )
})
