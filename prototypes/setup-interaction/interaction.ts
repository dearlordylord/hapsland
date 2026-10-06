// THROWAWAY: shared Effect interaction seam; it owns no workflow or mutation policy.
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Deferred, Effect, Terminal, type Redacted } from "effect"
import * as Prompt from "effect/cli/Prompt"
import { makeTerminal, terminal } from "./terminal.ts"
export type Navigation<A> = { kind: "selected"; value: A } | { kind: "back" } | { kind: "exit" }
export type Confirmation = { kind: "confirmed"; yes: boolean } | { kind: "back" } | { kind: "exit" }
export type ChoiceView<A> = { message: string; choices: { title: string; value: A }[]; back: boolean }
export type ApprovalView = { message: string; preview: string; back: boolean }
export interface Interaction {
  choose: <A>(view: ChoiceView<A>) => Effect.Effect<Navigation<A>, Terminal.QuitError>
  confirm: (view: ApprovalView) => Effect.Effect<Confirmation, Terminal.QuitError>
  hidden: (message: string) => Effect.Effect<Redacted.Redacted<string>, Terminal.QuitError>
  present: (text: string) => Effect.Effect<void>
}
const theme = process.env.NO_COLOR
  ? { primaryColor: "", mutedColor: "", successColor: "", errorColor: "", submittedColor: "" }
  : {}
export const runPrompt = <A>(prompt: Prompt.Prompt<A>) =>
  Effect.scoped(
    Prompt.run(prompt).pipe(Effect.provideService(Terminal.Terminal, terminal), Effect.provide(NodeServices.layer))
  )
// Navigation cancels only this prompt's input scope through a public Effect race.
export const runNavigable = <A>(prompt: Prompt.Prompt<A>, escape: A) =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = yield* Deferred.make<A>()
      const input = makeTerminal(() => Deferred.doneUnsafe(navigation, Effect.succeed(escape)))
      return yield* Effect.raceFirst(
        Prompt.run(prompt).pipe(Effect.provideService(Terminal.Terminal, input), Effect.provide(NodeServices.layer)),
        Deferred.await(navigation)
      )
    })
  )
export const liveInteraction: Interaction = {
  present: (text) =>
    Effect.sync(() => {
      process.stderr.write(text)
    }),
  choose: <A>(view: ChoiceView<A>) =>
    Effect.gen(function* () {
      const choices: { title: string; value: Navigation<A> }[] = view.choices.map((choice) => ({
        title: choice.title,
        value: { kind: "selected", value: choice.value }
      }))
      if (view.back) choices.push({ title: "Back", value: { kind: "back" } })
      choices.push({ title: "Exit", value: { kind: "exit" } })
      yield* liveInteraction.present(
        `Esc: ${view.back ? "Back" : "Exit"} | Enter: selected option | Ctrl+C/Ctrl+D: Exit\n`
      )
      return yield* runNavigable(
        Prompt.Select({ message: view.message, choices, theme }),
        view.back ? { kind: "back" } : { kind: "exit" }
      )
    }),
  confirm: (view) =>
    Effect.gen(function* () {
      yield* liveInteraction.present(`${view.preview}\nEsc: ${view.back ? "Back" : "Exit"} | Ctrl+C/Ctrl+D: Exit\n`)
      const prompt = Prompt.String({ message: `${view.message} [y/N]`, theme }).pipe(
        Prompt.map((line): Confirmation => ({ kind: "confirmed", yes: line.trim().toLowerCase() === "y" }))
      )
      return yield* runNavigable<Confirmation>(prompt, view.back ? { kind: "back" } : { kind: "exit" })
    }),
  hidden: (message) => runPrompt(Prompt.Hidden({ message, theme }))
}
