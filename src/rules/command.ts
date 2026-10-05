import { Config, Effect, Option } from "effect"
import type { RulesOptions } from "../cli-command.ts"
import { discoverWorkingTreeRoot } from "../repository/root.ts"
import { askConfirmation } from "../onboarding/confirmation.ts"
import { loadRuleInventory, formatRuleInventory } from "./inventory.ts"
import { applyRuleChange, previewRuleChange, type RuleChange } from "./management.ts"

export const runRulesCommand = Effect.fn("Rules.command")(function* (options: RulesOptions) {
  const root = yield* discoverWorkingTreeRoot(process.cwd())
  const configured = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  const configuration = configured === undefined ? {} : { userConfigPath: configured }
  const action = Option.getOrElse(options.action, () => "list" as const)
  const terminal = Boolean(process.stdin.isTTY && process.stderr.isTTY)
  if (action === "list" || action === "show") {
    const inventory = yield* loadRuleInventory(root, configuration)
    if (action === "list")
      process.stdout.write(options.json ? JSON.stringify(inventory) + "\n" : formatRuleInventory(inventory))
    else {
      const rule = inventory.rules.find((candidate) => candidate.qualifiedId === options.id)
      if (rule === undefined)
        return yield* Effect.fail(new Error("Use rules show --id with a qualified identity from rules list."))
      process.stdout.write(JSON.stringify(rule, null, options.json ? undefined : 2) + "\n")
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
      return yield* Effect.fail(new Error("rules connect requires --path to an existing JSON pack."))
    change = { action, scope, path: options.path }
  } else {
    if (options.id === undefined)
      return yield* Effect.fail(
        new Error(
          `rules ${action} requires --id ${action === "create" ? "with a pack identity" : "with a qualified rule identity"}.`
        )
      )
    change = { action, scope, id: options.id }
  }
  const plan = yield* previewRuleChange(root, change, configuration)
  if (terminal) {
    process.stderr.write(
      `Scope: ${scope}\nConfiguration: ${plan.configurationPath}\n${plan.path === undefined ? "" : `Pack: ${plan.path}\n`}`
    )
    if (!(yield* askConfirmation("Apply these rule changes?"))) return
  }
  const result = yield* applyRuleChange(root, change, plan.digest, configuration)
  process.stdout.write(
    options.json
      ? JSON.stringify(result) + "\n"
      : `${action} completed in ${scope} scope.\nConfiguration: ${result.configurationPath}\n${"path" in result ? `Pack: ${result.path}\n` : ""}Local structural validation only; classifier quality was not validated.\n`
  )
})
