import { Effect, Exit, Terminal } from "effect"
import { InteractionService, type Interaction } from "../interaction/interaction.ts"
import {
  initialRules,
  reduceRules,
  rulesCommand,
  rulesPreview,
  type RuleAction,
  type RulePlan,
  type RulesEvent,
  type RulesModel,
  type RuleScope
} from "./interaction-model.ts"

export interface RuleConversationOwner<A> {
  readonly preview: (scope: RuleScope) => Effect.Effect<RulePlan, unknown>
  readonly apply: (plan: RulePlan) => Effect.Effect<{ kind: "applied"; result: A } | { kind: "stale" }, unknown>
}
const chooseScope = Effect.fn("Rules.scope")(function* (
  interaction: Interaction,
  action: RuleAction
): Effect.fn.Return<RulesEvent["action"], Terminal.QuitError> {
  const answer = yield* interaction.choose({
    message: `Choose scope for rule ${action}`,
    choices: [
      { title: "Project", value: "project" as const },
      { title: "Personal", value: "personal" as const }
    ],
    back: false
  })
  return answer.kind === "selected" ? { kind: "scope", scope: answer.value } : { kind: answer.kind }
})
const reviewPlan = Effect.fn("Rules.review")(function* (
  interaction: Interaction,
  plan: RulePlan,
  stale: boolean,
  back: boolean
): Effect.fn.Return<RulesEvent["action"], Terminal.QuitError> {
  if (stale)
    yield* interaction.present("Proposal changed. No write was made; review the fresh preview and approve again.\n")
  yield* interaction.present(rulesPreview(plan) + "\n")
  const answer = yield* interaction.choose({
    message: "Review rule changes",
    choices: [{ title: "Continue to approval", value: "continue" }],
    back
  })
  return answer.kind === "selected" ? { kind: "continue" } : { kind: answer.kind }
})
const approvePlan = Effect.fn("Rules.approval")(function* (
  interaction: Interaction,
  plan: RulePlan
): Effect.fn.Return<RulesEvent["action"], Terminal.QuitError> {
  const answer = yield* interaction.confirm({
    message: "Apply these rule changes?",
    preview: rulesPreview(plan),
    back: true
  })
  return answer.kind === "confirmed" ? { kind: "approve", yes: answer.yes, digest: plan.digest } : { kind: answer.kind }
})
const readDialog = (
  interaction: Interaction,
  model: RulesModel,
  fixedScope: boolean
): Effect.Effect<RulesEvent["action"], Terminal.QuitError> => {
  if (model.phase === "Scope") return chooseScope(interaction, model.action)
  if (model.phase === "Preview" && model.plan)
    return reviewPlan(interaction, model.plan, model.outcome === "stale", !fixedScope)
  if (model.phase === "Approval" && model.plan) return approvePlan(interaction, model.plan)
  return Effect.succeed({ kind: "exit" })
}
export type RulesTransition = { before: RulesModel; event: RulesEvent; after: RulesModel }
export const runRuleConversation = Effect.fn("Rules.conversation")(function* <A>(
  action: RuleAction,
  owner: RuleConversationOwner<A>,
  options: { scope?: RuleScope; observe?: (transition: RulesTransition) => Effect.Effect<void> } = {}
) {
  const interaction = yield* InteractionService
  let model = initialRules(action)
  let result: A | undefined
  const dispatch = (event: RulesEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const input = { revision: before.revision, action: event }
      model = reduceRules(before, input)
      yield* options.observe?.({ before, event: input, after: model }) ?? Effect.void
    })
  return yield* Effect.gen(function* () {
    if (options.scope !== undefined) yield* dispatch({ kind: "scope", scope: options.scope })
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      const command = rulesCommand(model)
      const next = Effect.gen(function* (): Effect.fn.Return<RulesEvent["action"], unknown> {
        if (command?.kind === "preview")
          return { kind: "previewed", commandId: command.id, plan: yield* owner.preview(command.scope) }
        if (command?.kind === "apply") {
          const applied = yield* owner.apply(command.plan)
          if (applied.kind === "applied") result = applied.result
          return { kind: "observed", commandId: command.id, outcome: applied.kind }
        }
        return yield* readDialog(interaction, model, options.scope !== undefined)
      })
      const event = yield* next.pipe(
        Effect.catchIf(
          (error): error is Terminal.QuitError => error instanceof Terminal.QuitError,
          () => Effect.succeed<RulesEvent["action"]>({ kind: "exit" })
        )
      )
      yield* dispatch(event)
    }
    if (model.outcome !== "applied")
      yield* interaction.present(
        `Rules: ${model.phase === "Cancelled" ? "cancelled" : model.outcome}. No rule write was approved.\n`
      )
    return { model, result }
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit)
        ? interaction.present(
            `Rules stopped. Last observed phase: ${model.phase}; outcome: ${model.outcome ?? "not observed"}. No rollback is implied.\n`
          )
        : Effect.void
    )
  )
})
