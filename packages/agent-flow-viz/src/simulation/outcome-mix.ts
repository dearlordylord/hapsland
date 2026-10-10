import {
  type Replay,
  DEFAULT_OUTCOME_WEIGHTS,
  JEV_OUTCOME_ORDER,
  normalizeOutcomeWeights,
  type OutcomeWeights
} from "@hapsland/monkey-business"
import { type SimulationModel } from "./model"
import { InputError } from "./input"

export const weightField = (outcome: keyof OutcomeWeights) => `weight${outcome[0].toUpperCase()}${outcome.slice(1)}`
export const singleOutcomeWeights = (selected: keyof OutcomeWeights): OutcomeWeights =>
  Object.fromEntries(
    JEV_OUTCOME_ORDER.map((outcome) => [outcome, outcome === selected ? 100 : 0])
  ) as unknown as OutcomeWeights
export const weightDrafts = (weights: OutcomeWeights): Partial<SimulationModel> =>
  Object.fromEntries(JEV_OUTCOME_ORDER.map((outcome) => [weightField(outcome), String(weights[outcome])]))
export const rawWeights = (model: SimulationModel): OutcomeWeights =>
  Object.fromEntries(
    JEV_OUTCOME_ORDER.map((outcome) => [
      outcome,
      Number((model as unknown as Record<string, string>)[weightField(outcome)])
    ])
  ) as unknown as OutcomeWeights
export const draftWeights = (model: SimulationModel): OutcomeWeights => {
  const weights = rawWeights(model)
  try {
    normalizeOutcomeWeights(weights)
  } catch (error) {
    throw new InputError(error instanceof Error ? error.message : String(error))
  }
  return weights
}
export const appliedWeights = (replay: Pick<Replay, "config" | "controls">): OutcomeWeights => {
  let weights =
    replay.config.outcomeWeights ??
    (replay.config.outcome ? singleOutcomeWeights(replay.config.outcome) : DEFAULT_OUTCOME_WEIGHTS)
  for (const { control } of replay.controls)
    if (control.kind === "jevProfile") {
      if (control.outcomeWeights) weights = control.outcomeWeights
      else if (control.outcome) weights = singleOutcomeWeights(control.outcome)
    }
  return weights
}
export const outcomeNames: Record<keyof OutcomeWeights, string> = {
  neverSent: "Never sent",
  finding: "Finding",
  clear: "No finding (clear)",
  backendFailure: "Backend failure",
  timeout: "Timeout",
  interrupted: "Interrupted"
}
export const mixSummary = (weights: OutcomeWeights) => {
  const probabilities = normalizeOutcomeWeights(weights)
  return JEV_OUTCOME_ORDER.filter((outcome) => probabilities[outcome] > 0)
    .map((outcome) => `${outcomeNames[outcome]} ${(probabilities[outcome] * 100).toFixed(1)}%`)
    .join(" · ")
}
