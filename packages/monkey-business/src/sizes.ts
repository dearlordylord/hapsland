import { CANONICAL_MAX_BYTES, CANONICAL_MAX_UNITS } from "@hapsland/canonical-policy/canonical/adapter"
import {
  initialImportGraph,
  projectImportGraph,
  stepImportGraph,
  type GraphLimits,
  type ImportGraphEvent,
  type ImportGraphCommand,
  type ImportGraphProjection
} from "../../agent-flow-bend/import-graph-adapter.ts"

/** Separate checked graph frames; never canonical lifecycle or native capture observations. */
export type SizeGraphFrame = Readonly<{
  model: "import-graph"
  sequence: number
  event: ImportGraphEvent
  before: ImportGraphProjection
  command: ImportGraphCommand
  after: ImportGraphProjection
}>
export type SizeGraphInput = Readonly<{ limits?: GraphLimits; events: readonly ImportGraphEvent[] }>

/** Source-free facts execute the existing graph model, without filesystem effects. */
export const runSizeGraph = (
  input: SizeGraphInput
): Readonly<{ input: SizeGraphInput; frames: readonly SizeGraphFrame[] }> => {
  let state = initialImportGraph(input.limits)
  const events = input.events.map((event) =>
    Object.freeze({ ...event, ...("edges" in event ? { edges: Object.freeze([...event.edges]) } : {}) })
  ) as readonly ImportGraphEvent[]
  const limits = projectImportGraph(state).limits
  const frames = events.map((event, sequence): SizeGraphFrame => {
    const before = projectImportGraph(state)
    const stepped = stepImportGraph(state, event)
    state = stepped.state
    return Object.freeze({
      model: "import-graph",
      sequence,
      event,
      before,
      command: stepped.command,
      after: projectImportGraph(state)
    })
  })
  return Object.freeze({
    input: Object.freeze({ limits, events: Object.freeze(events) }),
    frames: Object.freeze(frames)
  })
}

/** Synthetic input measurements, not a claim that native bytes were measured. */
export type SizeFacts = Readonly<{
  sourceBytes: number
  evidenceTreeBytes: number
  reservationBytes: number
  reviewUnitBytes: readonly number[]
  encodedOutputBytes: number
}>

export const validateSizeFacts = (facts: SizeFacts): SizeFacts => {
  const byteCount = (field: string, value: number, minimum = 0): number => {
    // Stay within the checked adapters' immediate Nat domain.
    if (!Number.isSafeInteger(value) || value < minimum || value > CANONICAL_MAX_BYTES) {
      throw new RangeError(`${field} must be an integer from ${minimum} to ${CANONICAL_MAX_BYTES}`)
    }
    return value
  }
  if (!Array.isArray(facts.reviewUnitBytes) || facts.reviewUnitBytes.length > CANONICAL_MAX_UNITS) {
    throw new RangeError(`reviewUnitBytes must contain at most ${CANONICAL_MAX_UNITS} units`)
  }
  return Object.freeze({
    sourceBytes: byteCount("sourceBytes", facts.sourceBytes),
    evidenceTreeBytes: byteCount("evidenceTreeBytes", facts.evidenceTreeBytes),
    reservationBytes: byteCount("reservationBytes", facts.reservationBytes, 1),
    reviewUnitBytes: Object.freeze(facts.reviewUnitBytes.map((bytes) => byteCount("reviewUnitBytes", bytes, 1))),
    encodedOutputBytes: byteCount("encodedOutputBytes", facts.encodedOutputBytes)
  })
}

export const sizePreparationInput = (input: SizeFacts): Readonly<{ bytes: number; unitBytes: readonly number[] }> => {
  const facts = validateSizeFacts(input)
  return Object.freeze({ bytes: facts.reservationBytes, unitBytes: facts.reviewUnitBytes })
}
