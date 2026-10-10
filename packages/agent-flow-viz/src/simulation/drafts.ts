import { JEV_OUTCOME_ORDER } from "@hapsland/monkey-business"
import { type SimulationModel } from "./model"
import { weightField, appliedWeights, draftWeights } from "./outcome-mix"
import { finishSimulationAdvance, run, replaySource } from "./controller"
import { number, InputError } from "./input"

export const changeSimulation = (model: SimulationModel, field: string, raw: string): SimulationModel => {
  if (
    ![
      "seed",
      "pace",
      "editDuration",
      "variation",
      "editsPerTask",
      "taskPause",
      "adviceResponse",
      "repairDelay",
      "burst",
      "delay",
      "weightNeverSent",
      "weightFinding",
      "weightClear",
      "weightBackendFailure",
      "weightTimeout",
      "weightInterrupted",
      "bytes",
      "permitPerAdvicee",
      "permitResident",
      "permitDuration",
      "permitLifetime",
      "graphSourceBytes",
      "graphTreeBytes",
      "graphFiles",
      "graphReadBytes",
      "graphOutgoingEdges",
      "graphDepth",
      "graphWork",
      "treeMissingPercent",
      "treeUnsupportedPercent",
      "treeUnreadablePercent",
      "treeRepeatedPercent",
      "treeCyclicPercent",
      "treeDeadlineStep",
      "treeLocalWork",
      "treeMinFiles",
      "treeMaxFiles",
      "treeMaxImports",
      "treeMaxDepth",
      "treeDeniedPercent",
      "treeMinSourceBytes",
      "treeMaxSourceBytes",
      "treeMinTreeBytes",
      "treeMaxTreeBytes",

      "currentWork",
      "credentialReady",
      "credentialGeneration",
      "sourceReadable",
      "outputOutcome",
      "outputDelay",
      "outputLease",
      "speed",
      "replay",
      "stage",
      "resourceScenario",
      "resourceGroup",
      "resourceRound"
    ].includes(field)
  )
    return model
  if (field === "delay" || JEV_OUTCOME_ORDER.some((outcome) => weightField(outcome) === field))
    model = finishSimulationAdvance(model)
  const draft = { ...model, [field]: raw }
  if (!run || (field !== "delay" && !JEV_OUTCOME_ORDER.some((outcome) => weightField(outcome) === field))) return draft
  if (replaySource)
    return { ...draft, feedback: "Cannot update: finish recorded replay before changing live Jev settings." }
  try {
    const active = run.appliedSettings
    const profile = [...active.controls].reverse().find((entry) => entry.control.kind === "jevProfile")?.control
    run.applyControl({
      kind: "jevProfile",
      delayMs:
        field === "delay"
          ? number(raw, "Jev delay", 0, 1_000_000)
          : profile?.kind === "jevProfile"
            ? profile.delayMs
            : (active.config.jevDelay ?? 5),
      outcomeWeights: field === "delay" ? appliedWeights(active) : draftWeights(draft)
    })
    return { ...draft, revision: model.revision + 1, feedback: "Jev settings updated for new requests." }
  } catch (error) {
    return {
      ...draft,
      playing: error instanceof InputError ? model.playing : false,
      feedback: `${error instanceof InputError ? "Cannot update" : "Run error"}: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
