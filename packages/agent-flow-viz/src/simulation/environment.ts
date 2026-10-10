import { type SimulationModel } from "./model"
import { InputError, number } from "./input"

export const environmentFacts = (model: SimulationModel) => {
  if (!["current", "stale"].includes(model.currentWork) || !["ready", "unavailable"].includes(model.credentialReady))
    throw new InputError("Choose supported freshness and credential facts.")
  if (!["readable", "unreadable"].includes(model.sourceReadable))
    throw new InputError("Choose a supported source readability fact.")
  return {
    currentWork: model.currentWork === "current",
    credentialReady: model.credentialReady === "ready",
    credentialGeneration: number(model.credentialGeneration, "Credential generation", 1, 1_000_000),
    sourceReadable: model.sourceReadable === "readable"
  }
}
export const outputProfile = (model: SimulationModel) => {
  if (!["certain", "uncertain", "failed"].includes(model.outputOutcome))
    throw new InputError("Choose a supported host output outcome.")
  return {
    outcome: model.outputOutcome as "certain" | "uncertain" | "failed",
    delayMs: number(model.outputDelay, "Host output delay", 0, 1_000_000),
    leaseMs: number(model.outputLease, "Delivery lease lifetime", 1, 1_000_000)
  }
}
export const adviceResponse = (model: SimulationModel): "ignore" | "noAction" | "promptRepair" | "delayedRepair" => {
  switch (model.adviceResponse) {
    case "ignore":
    case "noAction":
    case "promptRepair":
    case "delayedRepair":
      return model.adviceResponse
    default:
      throw new InputError("Choose a supported advice response.")
  }
}
