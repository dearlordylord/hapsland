// Test adapter: scripted adapter at the same interaction seam as the console.
import { Effect, Redacted, Terminal } from "effect"
import type {
  ChoiceView,
  Confirmation,
  Interaction,
  MultipleChoiceView,
  Navigation
} from "@hapsland/administration/interaction/interaction"
export type ScriptStep =
  | { kind: "choose"; index: number }
  | { kind: "chooseMany"; ids: string[] }
  | { kind: "confirm"; line: string }
  | { kind: "hidden"; value: string }
  | { kind: "back" | "exit" | "eof" }
export function scriptedInteraction(steps: readonly ScriptStep[]) {
  let offset = 0
  const transcript: string[] = []
  const take = () => steps[offset++]
  const interaction: Interaction = {
    present: (text) =>
      Effect.sync(() => {
        transcript.push(text)
      }),
    chooseMany: <A>(view: MultipleChoiceView<A>) =>
      Effect.suspend((): Effect.Effect<Navigation<A[]>, Terminal.QuitError> => {
        const step = take()
        if (step?.kind === "eof") return Effect.fail(new Terminal.QuitError({}))
        if (step?.kind === "exit") return Effect.succeed({ kind: "exit" as const })
        if (step?.kind === "back" && view.back) return Effect.succeed({ kind: "back" as const })
        if (
          step?.kind !== "chooseMany" ||
          !step.ids.length ||
          new Set(step.ids).size !== step.ids.length ||
          step.ids.some((id) => !view.choices.some((choice) => choice.id === id))
        )
          return Effect.die(new Error("Script does not match multiple choices"))
        return Effect.succeed({
          kind: "selected" as const,
          value: view.choices.filter((choice) => step.ids.includes(choice.id)).map((choice) => choice.value)
        })
      }),
    choose: <A>(view: ChoiceView<A>) =>
      Effect.suspend((): Effect.Effect<Navigation<A>, Terminal.QuitError> => {
        const step = take()
        if (step?.kind === "eof") return Effect.fail(new Terminal.QuitError({}))
        if (step?.kind === "back" && view.back) return Effect.succeed({ kind: "back" })
        if (step?.kind === "exit") return Effect.succeed({ kind: "exit" })
        if (step?.kind !== "choose" || !view.choices[step.index])
          return Effect.die(new Error("Script does not match the choice view"))
        return Effect.succeed({ kind: "selected", value: view.choices[step.index]!.value })
      }),
    confirm: (view) =>
      Effect.suspend((): Effect.Effect<Confirmation, Terminal.QuitError> => {
        transcript.push(view.preview)
        const step = take()
        if (step?.kind === "eof") return Effect.fail(new Terminal.QuitError({}))
        if (step?.kind === "back" && view.back) return Effect.succeed({ kind: "back" as const })
        if (step?.kind === "exit") return Effect.succeed({ kind: "exit" as const })
        if (step?.kind !== "confirm") return Effect.die(new Error("Script does not match the approval view"))
        return Effect.succeed({ kind: "confirmed" as const, yes: step.line.trim().toLowerCase() === "y" })
      }),
    hidden: () =>
      Effect.suspend(() => {
        const step = take()
        if (step?.kind === "eof" || step?.kind === "exit") return Effect.fail(new Terminal.QuitError({}))
        if (step?.kind !== "hidden") return Effect.die(new Error("Script does not match hidden input"))
        return Effect.succeed(Redacted.make(step.value))
      })
  }
  return { interaction, transcript, consumed: () => offset, remaining: () => steps.length - offset }
}
