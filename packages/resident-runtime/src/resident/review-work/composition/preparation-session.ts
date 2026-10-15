import { encodePreparationInput } from "@hapsland/review-execution/direct-event/preparation"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { createPreparationForeign } from "./preparation-foreign.mjs"
import type { PreparationSession } from "../preparation/source-preparation-provider.mjs"
type ForeignPorts = Parameters<typeof createPreparationForeign>[0]
type SessionPorts = Omit<ForeignPorts, "graphLimits"> & {
  readonly graphLimits: NonNullable<ForeignPorts["graphLimits"]>
  readonly invocation: number
  readonly observation: DirectObservation
  readonly candidate: DirectObservation["candidates"][number]
}
/** Fresh resident scope uses the same whole Preparation ABI as public callers. */
export function createResidentPreparationSession(ports: SessionPorts): PreparationSession {
  const { invocation, observation, candidate, context, graphLimits } = ports
  if (graphLimits === undefined) throw new TypeError("Missing resident preparation graph limits")
  const foreign = createPreparationForeign(ports)
  return {
    invocation,
    machine: foreign.machine,
    performEffect: foreign.performEffect,
    decode: foreign.decode,
    revoke() {},
    close() {},
    input: {
      invocation: (invocation),
      preparation: encodePreparationInput({
        observation,
        candidates: [candidate],
        context,
        graphLimits,
        beforeAnalyze: true
      })
    }
  }
}
