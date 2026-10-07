import type { SUPPORTED_CLIENTS } from "@hapsland/runtime-environment/runtime/agent-clients"
import { Effect } from "effect"
import { InteractionService } from "../interaction/interaction.ts"

export type SetupClient = (typeof SUPPORTED_CLIENTS)[number]
export type ClientChoice = {
  readonly host: SetupClient
  readonly name: string
  readonly status: "installed" | "not installed" | "needs attention" | "unavailable"
}

/** Selection controls setup targets; unchecking never removes registrations. */
export const selectSetupClients = Effect.fn("ClientSelection.select")(function* (
  choices: ReadonlyArray<ClientChoice>,
  selected?: ReadonlyArray<SetupClient>
) {
  const interaction = yield* InteractionService
  yield* interaction.present("Unchecking an agent keeps its existing installation.\n")
  const answer = yield* interaction
    .chooseMany({
      message: "Select agents",
      choices: choices.map((choice) => ({
        id: choice.host,
        title: `${choice.name} — ${choice.status}`,
        value: choice.host,
        selected: selected === undefined ? choice.status === "installed" : selected.includes(choice.host)
      })),
      back: false
    })
    .pipe(Effect.catchTag("QuitError", () => Effect.succeed({ kind: "exit" as const })))
  return answer.kind === "selected" ? answer.value : []
})
