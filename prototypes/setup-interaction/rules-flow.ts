// THROWAWAY: one Effect workflow over shared interaction and injected owner seams.
import { Effect, Terminal } from "effect"
import type { Interaction } from "./interaction.ts"
import {
  initialRules,
  reduceRules,
  rulesCommand,
  rulesPreview,
  type RuleAction,
  type RulesEvent
} from "./rules-model.ts"
import type { RulesOwner } from "./rules-owner.ts"
const navigation = (kind: "back" | "exit") => ({ kind })
export function runRules(interaction: Interaction, owner: RulesOwner, action: RuleAction = "create") {
  return Effect.gen(function* () {
    let model = initialRules(action)
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      yield* interaction.present(`STATE ${JSON.stringify(model)}\n`)
      const command = rulesCommand(model)
      const prompt = Effect.gen(function* (): Effect.fn.Return<RulesEvent["action"], Terminal.QuitError> {
        if (command?.kind === "preview") {
          const plan = yield* owner.preview(command.action, command.scope)
          return { kind: "previewed", commandId: command.id, plan }
        }
        if (command?.kind === "apply")
          return { kind: "observed", commandId: command.id, outcome: yield* owner.apply(command.plan) }
        if (model.phase === "Scope") {
          const selected = yield* interaction.choose({
            message: `Choose scope for rule ${model.action}`,
            choices: [
              { title: "Project", value: "project" as const },
              { title: "Personal", value: "personal" as const }
            ],
            back: false
          })
          return selected.kind === "selected" ? { kind: "scope", scope: selected.value } : navigation(selected.kind)
        }
        if (model.phase === "Preview" && model.plan) {
          if (model.outcome === "stale")
            yield* interaction.present(
              "Proposal changed. No write was made; review the fresh preview and approve again.\n"
            )
          yield* interaction.present(rulesPreview(model.plan) + "\n")
          const selected = yield* interaction.choose({
            message: "Review rule changes",
            choices: [{ title: "Continue to approval", value: "continue" as const }],
            back: true
          })
          return selected.kind === "selected" ? { kind: "continue" } : navigation(selected.kind)
        }
        if (model.phase === "Approval" && model.plan) {
          const answer = yield* interaction.confirm({
            message: "Apply these rule changes?",
            preview: rulesPreview(model.plan),
            back: true
          })
          return answer.kind === "confirmed"
            ? { kind: "approve", yes: answer.yes, digest: model.plan.digest }
            : navigation(answer.kind)
        }
        return { kind: "exit" }
      })
      // Only terminal termination becomes Exit. Owner defects remain failures.
      const event = yield* prompt.pipe(
        Effect.catchTag("QuitError", () => Effect.succeed<RulesEvent["action"]>({ kind: "exit" }))
      )
      model = reduceRules(model, { revision: model.revision, action: event })
    }
    yield* interaction.present(
      `Rules: ${model.phase === "Cancelled" ? "cancelled" : model.outcome} (simulated).\nNext: ${model.outcome === "partial" ? "Inspect recovery before retrying; storage may have changed." : model.outcome === "failed" ? "Inspect the owner failure before retrying." : "No production rule changes were made."}\nRESULT ${JSON.stringify(model)}\n`
    )
    return model
  })
}
