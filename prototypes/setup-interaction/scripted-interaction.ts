// THROWAWAY: scripted adapter at the same interaction seam as the console.
import { Effect, Redacted, Terminal } from "effect"
import type { ChoiceView, Confirmation, Interaction, Navigation } from "./interaction.ts"
export type ScriptStep =
  | { kind: "choose"; index: number }
  | { kind: "confirm"; line: string }
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
    hidden: () => Effect.succeed(Redacted.make("SYNTHETIC_ONLY_DO_NOT_LOG"))
  }
  return { interaction, transcript, consumed: () => offset, remaining: () => steps.length - offset }
}
