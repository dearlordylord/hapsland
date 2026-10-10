import { graphLimitsFromDrafts } from "../graph-limit-controls"
import { demoResourceLimits, createRun } from "@hapsland/monkey-business"
import { type SimulationModel } from "./model"
import { treeProfile, graphDrafts } from "./file-trees"
import { number } from "./input"
import { draftWeights } from "./outcome-mix"
import { environmentFacts, outputProfile, adviceResponse } from "./environment"
import type { SimulationRun } from "./run-model"
export const createSimulationRun = (model: SimulationModel): SimulationRun => {
  const demoLimits = demoResourceLimits(number(model.agentCount, "Agent count", 1, 6))
  return createRun({
    demoAgentCount: number(model.agentCount, "Agent count", 1, 6),
    // One resident ledger and execution pool serve every independent generator.
    limits: { globalItems: 32, partitionItems: 16, globalBytes: 2000, partitionBytes: 2000 },
    editPermitLimits: {
      perAdvicee: number(model.permitPerAdvicee, "Per-advicee pending permits", 1, 65536),
      resident: number(model.permitResident, "Resident pending permits", 1, 65536)
    },
    permitProfile: {
      outcome: "success",
      durationMs: number(model.permitDuration, "PRE to POST duration", 0, 1_000_000_000),
      lifetimeMs: number(model.permitLifetime, "Permit lifetime", 1, 1_000_000_000)
    },
    lifecycles: {
      collectors: { capacity: 64 },
      reuse: { entryLimit: demoLimits.entryLimit, byteLimit: demoLimits.byteLimit },
      quietWindowMs: 60000
    },
    resourceScenarios:
      model.resourceScenario === "none"
        ? undefined
        : {
            noticeMaximumKeys: demoLimits.noticeMaximumKeys,
            notices: model.resourceScenario === "notices",
            outputFit: model.resourceScenario === "fit" || model.resourceScenario === "oversized",
            outputBytes: model.resourceScenario === "oversized" ? 10241 : 512
          },
    environment: environmentFacts(model),
    outputProfile: outputProfile(model),
    seed: number(model.seed, "Seed", 0, 2 ** 48 - 1),
    jevDelay: number(model.delay, "Jev delay", 0, 1_000_000),
    outcomeWeights: draftWeights(model),
    fileTrees: treeProfile(model),
    graphLimits: graphLimitsFromDrafts(graphDrafts(model)),
    sessions: Array.from({ length: number(model.agentCount, "Agent count", 1, 6) }, (_, index) => ({
      agent: `agent-${index + 1}`,
      seed: (number(model.seed, "Seed", 0, 2 ** 48 - 1) + Math.imul(index, 2654435761)) >>> 0,
      editIntervalMs: number(model.pace, "Edit pace", 1, 1_000_000),
      variationMs: number(model.variation, "Edit interval variation", 0, 1_000_000_000),
      editsPerTask: number(model.editsPerTask, "Edits per task", 1, 1024),
      taskPauseMs: number(model.taskPause, "Pause between tasks", 0, 1_000_000_000),
      adviceResponse: adviceResponse(model),
      repairDelayMs: number(model.repairDelay, "Repair response delay", 0, 1_000_000_000),
      editDurationMs: number(model.editDuration, "Simulated edit duration", 0, 1_000_000_000),
      bytes: number(model.bytes, "Reservation bytes", 1, 1_000_000)
    }))
  })
}
