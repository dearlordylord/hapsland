// THROWAWAY: shared Effect interaction seam; it owns no workflow or mutation policy.
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Deferred, Effect, Terminal, type Redacted } from "effect"
import * as Prompt from "effect/cli/Prompt"
import { acquireControllingInput } from "./controlling-input.ts"
import { makeTerminal, terminal, type TerminalInput } from "./terminal.ts"
import { selectionPrompt } from "./selection.ts"
export type Navigation<A> = { kind: "selected"; value: A } | { kind: "back" } | { kind: "exit" }
export type Confirmation = { kind: "confirmed"; yes: boolean } | { kind: "back" } | { kind: "exit" }
export type ChoiceView<A> = { message: string; choices: { title: string; value: A }[]; back: boolean }
export type ApprovalView = { message: string; preview: string; back: boolean }
export type MultipleChoiceView<A> = {
  message: string
  choices: { id: string; title: string; value: A; selected?: boolean }[]
  back: boolean
}
export interface Interaction {
  choose: <A>(view: ChoiceView<A>) => Effect.Effect<Navigation<A>, Terminal.QuitError>
  chooseMany: <A>(view: MultipleChoiceView<A>) => Effect.Effect<Navigation<A[]>, Terminal.QuitError>
  confirm: (view: ApprovalView) => Effect.Effect<Confirmation, Terminal.QuitError>
  hidden: (message: string) => Effect.Effect<Redacted.Redacted<string>, Terminal.QuitError>
  present: (text: string) => Effect.Effect<void>
}
const theme = process.env.NO_COLOR
  ? { primaryColor: "", mutedColor: "", successColor: "", errorColor: "", submittedColor: "" }
  : {}
export const runPrompt = <A>(prompt: Prompt.Prompt<A>, input = terminal) =>
  Effect.scoped(
    Prompt.run(prompt).pipe(Effect.provideService(Terminal.Terminal, input), Effect.provide(NodeServices.layer))
  )
// Navigation cancels only this prompt's input scope through a public Effect race.
export const runNavigable = <A>(prompt: Prompt.Prompt<A>, escape: A, stdin: TerminalInput = process.stdin) =>
  Effect.scoped(
    Effect.gen(function* () {
      const navigation = yield* Deferred.make<A>()
      const input = makeTerminal(() => Deferred.doneUnsafe(navigation, Effect.succeed(escape)), stdin)
      return yield* Effect.raceFirst(
        Prompt.run(prompt).pipe(Effect.provideService(Terminal.Terminal, input), Effect.provide(NodeServices.layer)),
        Deferred.await(navigation)
      )
    })
  )
const present = (text: string) =>
  Effect.sync(() => {
    process.stderr.write(text)
  })
const interactionFor = (stdin: TerminalInput = process.stdin): Interaction => ({
  present,
  chooseMany: <A>(view: MultipleChoiceView<A>) =>
    Effect.gen(function* () {
      if (!view.choices.length || new Set(view.choices.map((choice) => choice.id)).size !== view.choices.length)
        return yield* Effect.die(new Error("Multiple choices require nonempty, unique identities"))
      const selected = yield* runNavigable(
        selectionPrompt(
          view.choices.filter((choice) => choice.selected).map((choice) => choice.id),
          view
        ),
        { kind: view.back ? "back" : "cancel" },
        stdin
      )
      if (selected.kind === "back") return { kind: "back" }
      if (selected.kind !== "select") return { kind: "exit" }
      return {
        kind: "selected",
        value: view.choices.filter((choice) => selected.hosts.includes(choice.id)).map((choice) => choice.value)
      }
    }),
  choose: <A>(view: ChoiceView<A>) =>
    Effect.gen(function* () {
      const choices: { title: string; value: Navigation<A> }[] = view.choices.map((choice) => ({
        title: choice.title,
        value: { kind: "selected", value: choice.value }
      }))
      if (view.back) choices.push({ title: "Back", value: { kind: "back" } })
      choices.push({ title: "Exit", value: { kind: "exit" } })
      yield* present(`Esc: ${view.back ? "Back" : "Exit"} | Enter: selected option | Ctrl+C/Ctrl+D: Exit\n`)
      return yield* runNavigable(
        Prompt.Select({ message: view.message, choices, theme }),
        view.back ? { kind: "back" } : { kind: "exit" },
        stdin
      )
    }),
  confirm: (view) =>
    Effect.gen(function* () {
      yield* present(`${view.preview}\nEsc: ${view.back ? "Back" : "Exit"} | Ctrl+C/Ctrl+D: Exit\n`)
      const prompt = Prompt.String({ message: `${view.message} [y/N]`, theme }).pipe(
        Prompt.map((line): Confirmation => ({ kind: "confirmed", yes: line.trim().toLowerCase() === "y" }))
      )
      return yield* runNavigable<Confirmation>(prompt, view.back ? { kind: "back" } : { kind: "exit" }, stdin)
    }),
  hidden: (message) => runPrompt(Prompt.Hidden({ message, theme }), makeTerminal(undefined, stdin))
})
export const liveInteraction = interactionFor()

// Only an explicitly authorized caller may select the controlling terminal.
// Acquisition is scoped outside Prompt.Hidden; no custom secret prompt is involved.
export const acquireInteraction = (source: "stdin" | "controlling-terminal" = "stdin") =>
  Effect.gen(function* () {
    if (!process.stderr.isTTY || process.env.TERM === "dumb") return yield* Effect.fail(new Terminal.QuitError({}))
    if (source === "stdin") {
      if (!process.stdin.isTTY) return yield* Effect.fail(new Terminal.QuitError({}))
      return liveInteraction
    }
    const stdin = yield* acquireControllingInput
    return interactionFor(stdin)
  })
