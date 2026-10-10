import { graphLimitDrafts } from "../graph-limit-controls"
import { type Replay, type Control, DEFAULT_FILE_TREE_PROFILE } from "@hapsland/monkey-business"
import { type SimulationModel } from "./model"
import { treeDrafts, graphModelDrafts } from "./file-trees"

import { weightDrafts, appliedWeights } from "./outcome-mix"

import type { SimulationRun } from "./run-model"
export const replaySimulationDrafts = (model: SimulationModel, inputs: Replay, restored: SimulationRun) => {
  const latest = <Kind extends Control["kind"]>(kind: Kind) =>
    inputs.controls
      .map((entry) => entry.control)
      .findLast((control): control is Extract<Control, { kind: Kind }> => control.kind === kind)
  return {
    suspended: latest("suspendArrivals")?.suspended === true,
    fields: {
      draftEpoch: model.draftEpoch + 1,
      agentCount: String(Math.max(1, restored.agentScopes.length, restored.projection.partitions.length)),
      variation: String(inputs.config.sessions?.[0]?.variationMs ?? inputs.config.session?.variationMs ?? 15),
      editsPerTask: String(inputs.config.sessions?.[0]?.editsPerTask ?? inputs.config.session?.editsPerTask ?? 5),
      taskPause: String(inputs.config.sessions?.[0]?.taskPauseMs ?? inputs.config.session?.taskPauseMs ?? 500),
      adviceResponse: inputs.config.sessions?.[0]?.adviceResponse ?? inputs.config.session?.adviceResponse ?? "ignore",
      repairDelay: String(inputs.config.sessions?.[0]?.repairDelayMs ?? inputs.config.session?.repairDelayMs ?? 300),
      agentId: inputs.config.sessions?.[0]?.agent ?? inputs.config.session?.agent ?? "agent-1",
      ...treeDrafts(latest("fileTrees")?.profile ?? inputs.config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE),
      ...graphModelDrafts(graphLimitDrafts(latest("graphLimits")?.limits ?? inputs.config.graphLimits)),
      bookmark: (inputs as Replay & { dashboard?: { bookmark?: number } }).dashboard?.bookmark ?? -1,
      currentWork:
        (latest("environment")?.currentWork ?? inputs.config.environment?.currentWork ?? true) ? "current" : "stale",
      credentialReady:
        (latest("environment")?.credentialReady ?? inputs.config.environment?.credentialReady ?? true)
          ? "ready"
          : "unavailable",
      credentialGeneration: String(
        latest("environment")?.credentialGeneration ?? inputs.config.environment?.credentialGeneration ?? 1
      ),
      sourceReadable:
        (latest("environment")?.sourceReadable ?? inputs.config.environment?.sourceReadable ?? true)
          ? "readable"
          : "unreadable",
      outputOutcome: latest("outputProfile")?.outcome ?? inputs.config.outputProfile?.outcome ?? "certain",
      outputDelay: String(latest("outputProfile")?.delayMs ?? inputs.config.outputProfile?.delayMs ?? 0),
      outputLease: String(latest("outputProfile")?.leaseMs ?? inputs.config.outputProfile?.leaseMs ?? 30000),
      seed: String(inputs.config.seed ?? 1),
      editDuration: String(
        latest("editDuration")?.durationMs ??
          inputs.config.sessions?.[0]?.editDurationMs ??
          inputs.config.session?.editDurationMs ??
          inputs.config.permitProfile?.durationMs ??
          1
      ),
      pace: String(
        latest("editPace")?.intervalMs ??
          inputs.config.sessions?.[0]?.editIntervalMs ??
          inputs.config.session?.editIntervalMs ??
          100
      ),
      bytes: String(
        latest("sizes")?.reservationBytes ?? inputs.config.sessions?.[0]?.bytes ?? inputs.config.session?.bytes ?? 100
      ),
      delay: String(latest("jevProfile")?.delayMs ?? inputs.config.jevDelay ?? 5),
      ...weightDrafts(appliedWeights(inputs))
    }
  }
}
