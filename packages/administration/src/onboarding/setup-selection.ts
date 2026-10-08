import { Effect } from "effect"
import { childFlow, flowInteraction } from "../interaction/flow-input.ts"
import { selectSetupClients, type ClientChoice, type SetupClient } from "./client-selection.ts"

export type SelectionModel = {
  phase: "SelectingAgents" | "RunningAgents" | "Done" | "Cancelled"
  selected: readonly SetupClient[]
  index: number
  revision: number
}
export type SelectionAction =
  | { kind: "selected"; hosts: readonly SetupClient[] }
  | { kind: "ended" }
  | { kind: "observed"; outcome: "completed" | "back" | "cancelled" }
export type SelectionTransition = { before: SelectionModel; action: SelectionAction; after: SelectionModel }
export const reduceSelection = (model: SelectionModel, action: SelectionAction): SelectionModel => {
  if (model.phase === "SelectingAgents") {
    if (action.kind === "ended") return { ...model, phase: "Done", revision: model.revision + 1 }
    if (action.kind === "selected" && action.hosts.length > 0)
      return { phase: "RunningAgents", selected: [...action.hosts], index: 0, revision: model.revision + 1 }
  }
  if (model.phase === "RunningAgents" && action.kind === "observed") {
    const phase =
      action.outcome === "back"
        ? "SelectingAgents"
        : action.outcome === "cancelled"
          ? "Cancelled"
          : model.index + 1 < model.selected.length
            ? "RunningAgents"
            : "Done"
    return { ...model, phase, index: model.index + 1, revision: model.revision + 1 }
  }
  return model
}

/** Outer production navigation. Per-agent setup retains its own policy and consent. */
export const runSetupSelection = Effect.fn("SetupSelection.run")(function* <R>(
  choices: readonly ClientChoice[],
  runHost: (host: SetupClient) => Effect.Effect<"completed" | "back" | "cancelled", unknown, R>,
  observe?: (transition: SelectionTransition) => Effect.Effect<void>
) {
  const interaction = yield* flowInteraction("setup-selection")
  let model: SelectionModel = { phase: "SelectingAgents", selected: [], index: 0, revision: 0 }
  let selected: SetupClient[] | undefined
  const dispatch = (action: SelectionAction) =>
    Effect.gen(function* () {
      const before = model
      model = reduceSelection(model, action)
      if (observe) yield* observe({ before, action, after: model })
    })
  while (model.phase === "SelectingAgents" || model.phase === "RunningAgents") {
    if (model.phase === "SelectingAgents") {
      const hosts = yield* selectSetupClients(choices, selected)
      if (hosts.length === 0) {
        yield* interaction.present(
          selected === undefined
            ? "No clients selected. No changes made.\n"
            : "No agents selected. Previously reported results remain.\n"
        )
        yield* dispatch({ kind: "ended" })
      } else {
        selected = hosts
        yield* dispatch({ kind: "selected", hosts })
      }
    } else {
      const host = model.selected[model.index]!
      yield* dispatch({ kind: "observed", outcome: yield* childFlow("setup-selection", "setup", runHost(host)) })
    }
  }
  return model
})
