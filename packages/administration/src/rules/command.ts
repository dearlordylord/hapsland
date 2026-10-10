import { Config, Effect, Option } from "effect"
import type { RulesOptions } from "./cli-definition.ts"
import { discoverWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { RULE_CHECK_EXIT_CODES } from "./cli-definition.ts"
import { InteractionService } from "../interaction/interaction.ts"
import { withInteractionSession } from "../interaction/interaction-session.ts"
import { runRuleConversation } from "./conversation.ts"
import type { RulePlan } from "./interaction-model.ts"
import { loadRuleInventory, formatRuleInventory, formatRule, explainRule } from "./inventory.ts"
import { applyRuleChange, previewRuleChange, type RuleChange } from "./management.ts"

type RuleInspectionAction = "list" | "show" | "explain"
const inspectionAction = (action: RulesOptions["action"]): action is RuleInspectionAction =>
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
        new Error(`Unknown rule identity '${options.id}'. Run hapsland rules list to find rule identities.`)
      )
    const explanation = explainRule(rule, inventory, options.path)
    process.stdout.write(inspectionOutput(action, options, rule, explanation))
  }
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
export const makeRuleChangeOwner = (
  root: string,
  action: RuleChange["action"],
  options: RulesOptions,
  configuration: Parameters<typeof loadRuleInventory>[1]
) => ({
  preview: (scope: RuleChange["scope"]) =>
    Effect.gen(function* () {
      const change = yield* requestedRuleChange(action, scope, options)
      const plan = yield* previewRuleChange(root, change, configuration)
      const safe: RulePlan = {
        action,
        scope,
        digest: plan.digest,
        configuration: plan.configurationPath,
        rule: plan.path ?? options.id ?? "authored rule",
        enabled: plan.enabled === true
      }
      return safe
    }),
  apply: (approved: RulePlan) =>
    Effect.gen(function* () {
      const change = yield* requestedRuleChange(action, approved.scope, options)
      return yield* applyRuleChange(root, change, approved.digest, configuration).pipe(
        Effect.map((result) => ({ kind: "applied" as const, result })),
        Effect.catchTag("ConfigurationError", (error) =>
          error.field === "digest" ? Effect.succeed({ kind: "stale" as const }) : Effect.fail(error)
        )
      )
    })
})
const ruleChangeOutput = (
  result: Effect.Success<ReturnType<typeof applyRuleChange>>,
  change: RuleChange,
  json: boolean
): string => {
  if (json) return JSON.stringify(result) + "\n"
  const activation =
    change.action === "create" || change.action === "connect"
      ? ` Rule is ${result.enabled ? "enabled" : "disabled"}.`
      : ""
  const file = "path" in result ? `Rule file: ${result.path}\n` : ""
  return `${change.action} completed in ${change.scope} scope.${activation}\nConfiguration: ${result.configurationPath}\n${file}Local structural validation only; classifier quality was not validated.\n`
}
const checkRules = Effect.fn("Rules.checkCommand")(function* (options: RulesOptions) {
  if (options.path === undefined || options.line === undefined)
    return yield* Effect.fail(new Error("rules check requires --path and --line."))
  const { checkRuleAtLine, formatRuleCheck } = yield* Effect.promise(() => import("./check.ts"))
  const result = yield* checkRuleAtLine({ path: options.path, line: options.line, id: options.id })
  process.stdout.write(options.json ? JSON.stringify(result) + "\n" : formatRuleCheck(result))
  if (result.status !== "evaluated") process.exitCode = RULE_CHECK_EXIT_CODES.unavailable
  return
})
export const runRulesCommand = Effect.fn("Rules.command")(function* (options: RulesOptions) {
  if (options.action === "check") return yield* checkRules(options)
  const root = yield* discoverWorkingTreeRoot(process.cwd())
  const configured = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")))
  const configuration = configured === undefined ? {} : { userConfigPath: configured }
  const action = options.action
  const terminal = Boolean(process.stdin.isTTY && process.stderr.isTTY)
  if (inspectionAction(action)) return yield* inspectRules(action, options, root, configuration)
  if (terminal) {
    const owner = makeRuleChangeOwner(root, action, options, configuration)
    yield* withInteractionSession(
      (input) =>
        Effect.gen(function* () {
          const conversation = yield* runRuleConversation(
            action,
            owner,
            options.scope === undefined ? {} : { scope: options.scope }
          ).pipe(Effect.provideService(InteractionService, input))
          const result = conversation.result
          if (result !== undefined && conversation.model.scope !== undefined) {
            const change = yield* requestedRuleChange(action, conversation.model.scope, options)
            yield* Effect.sync(() => process.stdout.write(ruleChangeOutput(result, change, options.json)))
          }
        }),
      Effect.sync(() => {
        process.exitCode = 130
      })
    )
    return
  }
  if (options.scope === undefined)
    return yield* Effect.fail(new Error("Unattended rule changes require --scope project or --scope personal."))
  const change = yield* requestedRuleChange(action, options.scope, options)
  const plan = yield* previewRuleChange(root, change, configuration)
  const result = yield* applyRuleChange(root, change, plan.digest, configuration)
  yield* Effect.sync(() => process.stdout.write(ruleChangeOutput(result, change, options.json)))
})
