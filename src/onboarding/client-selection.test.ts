import { it, expect } from "@effect/vitest"
import { Effect } from "effect"
import { selectSetupClients } from "@hapsland/administration/onboarding/client-selection"
import { InteractionService, type MultipleChoiceView } from "@hapsland/administration/interaction/interaction"
import { scriptedInteraction } from "@hapsland/build-tooling/test-support/scripted-interaction"

const choices = [
  { host: "claude", name: "Claude Code", status: "installed" },
  { host: "codex", name: "Codex", status: "not installed" }
] as const

it.effect("selection presents installed defaults and status while preserving the adapter's selection", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([{ kind: "chooseMany", ids: ["claude", "codex"] }])
    let seen: MultipleChoiceView<unknown> | undefined
    const interaction = {
      ...script.interaction,
      chooseMany: <A>(view: MultipleChoiceView<A>) => {
        seen = view
        return script.interaction.chooseMany(view)
      }
    }
    const selected = yield* selectSetupClients(choices).pipe(Effect.provideService(InteractionService, interaction))
    expect(selected).toEqual(["claude", "codex"])
    expect(seen?.choices).toEqual([
      { id: "claude", title: "Claude Code — installed", value: "claude", selected: true },
      { id: "codex", title: "Codex — not installed", value: "codex", selected: false }
    ])
    expect(seen?.back).toBe(false)
    expect(script.transcript.join("\n")).toContain("Unchecking an agent keeps its existing installation.")
  })
)

it.effect("unchecking an installed agent changes only the selected setup targets", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([{ kind: "chooseMany", ids: ["codex"] }])
    const selected = yield* selectSetupClients(choices).pipe(
      Effect.provideService(InteractionService, script.interaction)
    )
    expect(selected).toEqual(["codex"])
    expect(script.remaining()).toBe(0)
  })
)

it.effect.each(["exit", "eof"] as const)("%s exits without setup targets or consuming further answers", (kind) =>
  Effect.gen(function* () {
    const script = scriptedInteraction([{ kind }, { kind: "chooseMany", ids: ["codex"] }])
    const selected = yield* selectSetupClients(choices).pipe(
      Effect.provideService(InteractionService, script.interaction)
    )
    expect(selected).toEqual([])
    expect(script.remaining()).toBe(1)
  })
)

it.effect.each([{ selected: [] }, { selected: ["codex"] }] as const)(
  "Back preserves explicit selection %j instead of restoring installed defaults",
  ({ selected }) =>
    Effect.gen(function* () {
      const script = scriptedInteraction([{ kind: "exit" }])
      let seen: MultipleChoiceView<unknown> | undefined
      yield* selectSetupClients(choices, selected).pipe(
        Effect.provideService(InteractionService, {
          ...script.interaction,
          chooseMany: <A>(view: MultipleChoiceView<A>) => {
            seen = view
            return script.interaction.chooseMany(view)
          }
        })
      )
      expect(seen?.choices.map((choice) => [choice.id, choice.selected])).toEqual([
        ["claude", false],
        ["codex", selected.some((host) => host === "codex")]
      ])
    })
)
