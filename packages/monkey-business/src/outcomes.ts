import Shared from "../../monkey-business-bend/engine.mjs"
import { doubleWords } from "./numeric-codec.ts"
import type { JevRequestOutcome } from "@hapsland/canonical-policy/canonical/adapter"

/** Stable cumulative-distribution order, recorded with replay configuration. */
export const JEV_OUTCOME_ORDER = [
  "neverSent",
  "finding",
  "clear",
  "backendFailure",
  "timeout",
  "interrupted"
] as const satisfies readonly JevRequestOutcome[]
export type OutcomeWeights = Readonly<Record<JevRequestOutcome, number>>
export type OutcomeProbabilities = Readonly<Record<JevRequestOutcome, number>>
export const DEFAULT_OUTCOME_WEIGHTS: OutcomeWeights = Object.freeze({
  neverSent: 0,
  finding: 50,
  clear: 50,
  backendFailure: 0,
  timeout: 0,
  interrupted: 0
})
export const OUTCOME_RANDOM_ALGORITHM = "xorshift32/1"
export const OUTCOME_RANDOM_STREAM = "jev-outcomes"

/** Slider bounds describe synthetic inputs, not Jev policy or empirical rates. */
export const validateOutcomeWeights = (weights: OutcomeWeights): OutcomeWeights => {
  if (!weights || typeof weights !== "object" || Array.isArray(weights))
    throw new TypeError("Jev outcome weights must be an object")
  for (const key of Object.keys(weights))
    if (!(JEV_OUTCOME_ORDER as readonly string[]).includes(key))
      throw new RangeError(`Unknown Jev outcome weight: ${key}`)
  const result = {} as Record<JevRequestOutcome, number>
  let enabled = false
  for (const outcome of JEV_OUTCOME_ORDER) {
    const value = weights[outcome]
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
      throw new RangeError(`${outcome} weight must be a finite number in [0, 100]`)
    result[outcome] = value
    enabled ||= value > 0
  }
  if (!enabled) throw new RangeError("At least one Jev outcome weight must be greater than zero")
  return result
}

/** Presentation percentages only; the shared Bend owner normalizes sampling inputs. */
export const normalizeOutcomeWeights = (weights: OutcomeWeights): OutcomeProbabilities => {
  const validated = validateOutcomeWeights(weights)
  const total = JEV_OUTCOME_ORDER.reduce((sum, outcome) => sum + validated[outcome], 0)
  return Object.fromEntries(JEV_OUTCOME_ORDER.map((outcome) => [outcome, validated[outcome] / total])) as Record<
    JevRequestOutcome,
    number
  >
}

/** Dedicated stream: call once at weighted request issuance. Edits, rendering,
 * stale callbacks, and explicit outcomes never consume it.
 * Fold the safe integer seed into 32 bits, FNV-mix the stream name, then apply
 * xorshift32 (13, 17, 5) once per sampled request. Zero state becomes one.
 */
export class SeededOutcomeSampler {
  private state: number
  constructor(seed = 1) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2 ** 48 - 1)
      throw new RangeError("outcome seed must be an integer in [0, 281474976710655]")
    this.state = Shared.random_initial(BigInt(seed))
  }
  sample(weights: OutcomeWeights): JevRequestOutcome {
    const validated = validateOutcomeWeights(weights)
    const encoded = JEV_OUTCOME_ORDER.map((outcome) => doubleWords(validated[outcome])).reduceRight<unknown>(
      (tail, head) => ({ $: "Con", head, tail }),
      { $: "Nil" }
    )
    const sampled = Shared.random_sample(this.state, encoded)
    this.state = sampled.random
    const outcome = JEV_OUTCOME_ORDER[sampled.outcome]
    if (outcome === undefined) throw new TypeError("invalid shared outcome")
    return outcome
  }
}
