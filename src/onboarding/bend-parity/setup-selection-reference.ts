import type { SetupClient } from "@hapsland/administration/onboarding/client-selection"

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
