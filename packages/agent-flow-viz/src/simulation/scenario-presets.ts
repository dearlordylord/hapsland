import { DEFAULT_FILE_TREE_PROFILE, type OutcomeWeights } from "@hapsland/monkey-business"
import { type SimulationModel } from "./model"
import { treeDrafts } from "./file-trees"

import { weightDrafts, singleOutcomeWeights } from "./outcome-mix"

export const draftSimulationPreset = (model: SimulationModel, action: string): SimulationModel | undefined => {
  if (action.startsWith("preset:")) {
    const presets: Record<string, Partial<SimulationModel> & { outcome: keyof OutcomeWeights }> = {
      normal: {
        pace: "100",
        delay: "50",
        outcome: "finding",
        bytes: "100",
        feedback: "Normal findings drafted. Start / reset, then Resume to watch advice delivery."
      },
      slow: {
        pace: "100",
        delay: "5000",
        outcome: "finding",
        bytes: "100",
        feedback: "Slow Jev drafted. Start / reset, then Resume to inspect requests waiting for results."
      },
      failure: {
        pace: "50",
        delay: "500",
        outcome: "backendFailure",
        bytes: "100",
        feedback:
          "Failure → recovery drafted. Start / reset and Resume; set Finding weight to 100 and the other weights to zero to recover future requests."
      },
      stale: {
        pace: "100",
        delay: "5000",
        outcome: "finding",
        bytes: "100",
        feedback:
          "Freshness change drafted. Start / reset and Resume until Jev is waiting; choose stale and Apply environment facts, then inspect settlement without retained advice."
      },
      credential: {
        pace: "100",
        delay: "50",
        outcome: "finding",
        bytes: "100",
        credentialReady: "unavailable",
        feedback:
          "Credential unavailable drafted. Start / reset, Resume and inspect refused requests; choose ready and Apply environment facts to recover future requests."
      },
      uncertain: {
        pace: "100",
        delay: "50",
        outcome: "finding",
        bytes: "100",
        outputOutcome: "uncertain",
        outputDelay: "50",
        outputLease: "500",
        feedback:
          "Uncertain host output drafted. Start / reset and Resume; inspect uncertain delivery and lease recovery. Choose certain and Apply host output profile for future output attempts."
      },
      source: {
        pace: "100",
        delay: "50",
        outcome: "finding",
        bytes: "100",
        sourceReadable: "unreadable",
        feedback:
          "Unreadable final source drafted. Start / reset and Resume; inspect candidate revalidation retiring advice before host handoff. Restore readable and Apply environment facts for future candidates."
      },
      rotation: {
        pace: "100",
        delay: "50",
        outcome: "finding",
        bytes: "100",
        feedback:
          "Credential rotation drafted. Start / reset, Resume until advice is ready; set credential generation 2 and Apply environment facts to invalidate advice authorized under generation 1."
      },
      expired: {
        pace: "100",
        delay: "50",
        outcome: "finding",
        bytes: "100",
        outputOutcome: "certain",
        outputDelay: "500",
        outputLease: "50",
        feedback:
          "Expired delivery lease drafted. Start / reset and Resume; inspect lease revalidation before delayed output. Apply delay 1 / lease 1000 for future delivery attempts."
      },
      capacity: {
        pace: "10",
        delay: "5000",
        outcome: "finding",
        bytes: "1000000",
        feedback: "Capacity pressure drafted. Start / reset, Resume, then inject a burst and inspect refusal events."
      }
    }
    const { outcome, ...fields } = presets[action.slice(7)]
    return {
      ...model,
      draftEpoch: model.draftEpoch + 1,
      ...weightDrafts(singleOutcomeWeights(outcome)),
      currentWork: "current",
      credentialReady: "ready",
      credentialGeneration: "1",
      sourceReadable: "readable",
      outputOutcome: "certain",
      outputDelay: "1",
      outputLease: "1000",
      ...fields
    }
  }
  if (action === "trees:balanced" || action === "trees:pressure")
    return {
      ...model,
      draftEpoch: model.draftEpoch + 1,
      ...treeDrafts(
        action === "trees:balanced"
          ? DEFAULT_FILE_TREE_PROFILE
          : {
              ...DEFAULT_FILE_TREE_PROFILE,
              minFiles: 10,
              maxFiles: 16,
              maxDepth: 4,
              minTreeBytes: 2048,
              maxTreeBytes: 5120
            }
      ),
      feedback: "Tree generation drafted. Start / reset or Apply to future preparations to use it."
    }
}
