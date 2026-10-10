import { type SimulationModel } from "./model"

import { speedValue } from "./input"

import type { SimulationRun } from "./run-model"
export const navigateSimulation = (
  model: SimulationModel,
  action: string,
  run: Pick<SimulationRun, "observations"> | undefined
): SimulationModel | undefined => {
  if (action.startsWith("item:")) return { ...model, item: action.slice(5) }
  if (action === "focus-stage") return { ...model, focus: model.focus === model.stage ? "" : model.stage, item: "" }
  if (action === "speed")
    return {
      ...model,
      appliedSpeed: speedValue(model.speed),
      feedback: "Playback speed applied. Draft edits do not change playback."
    }
  if (action === "filter") return { ...model, filter: model.filter === "all" ? "failures" : "all" }
  if (action.startsWith("focus:"))
    return { ...model, focus: model.focus === action.slice(6) ? "" : action.slice(6), item: "" }
  if (action === "bookmark")
    return {
      ...model,
      bookmark: model.selected < 0 ? (run?.observations.at(-1)?.sequence ?? -1) : model.selected,
      feedback: "Observation bookmarked for this run."
    }
}
