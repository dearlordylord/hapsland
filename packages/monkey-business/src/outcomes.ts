import type { JevRequestOutcome } from "../../../src/canonical/adapter.ts";

/** Stable cumulative-distribution order, recorded with replay configuration. */
export const JEV_OUTCOME_ORDER = [
  "neverSent", "finding", "clear", "backendFailure", "timeout", "interrupted",
] as const satisfies readonly JevRequestOutcome[];
export type OutcomeWeights = Readonly<Record<JevRequestOutcome, number>>;
export type OutcomeProbabilities = Readonly<Record<JevRequestOutcome, number>>;
export const DEFAULT_OUTCOME_WEIGHTS: OutcomeWeights = Object.freeze({
  neverSent: 0, finding: 50, clear: 50, backendFailure: 0, timeout: 0, interrupted: 0,
});
export const OUTCOME_RANDOM_ALGORITHM = "xorshift32/1";
export const OUTCOME_RANDOM_STREAM = "jev-outcomes";

/** Slider bounds describe synthetic inputs, not Jev policy or empirical rates. */
export const validateOutcomeWeights = (weights: OutcomeWeights): OutcomeWeights => {
  if (!weights || typeof weights !== "object" || Array.isArray(weights))
    throw new TypeError("Jev outcome weights must be an object");
  for (const key of Object.keys(weights))
    if (!(JEV_OUTCOME_ORDER as readonly string[]).includes(key))
      throw new RangeError(`Unknown Jev outcome weight: ${key}`);
  const result = {} as Record<JevRequestOutcome, number>;
  let total = 0;
  for (const outcome of JEV_OUTCOME_ORDER) {
    const value = weights[outcome];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
      throw new RangeError(`${outcome} weight must be a finite number in [0, 100]`);
    result[outcome] = value;
    total += value;
  }
  if (total === 0) throw new RangeError("At least one Jev outcome weight must be greater than zero");
  return result;
};

/** The UI and sampler share this pure, deterministic normalization. */
export const normalizeOutcomeWeights = (weights: OutcomeWeights): OutcomeProbabilities => {
  const validated = validateOutcomeWeights(weights);
  const total = JEV_OUTCOME_ORDER.reduce((sum, outcome) => sum + validated[outcome], 0);
  return Object.fromEntries(JEV_OUTCOME_ORDER.map(outcome => [outcome, validated[outcome] / total])) as Record<JevRequestOutcome, number>;
};

/** Dedicated stream: call once at weighted request issuance. Edits, rendering,
 * stale callbacks, and explicit outcomes never consume it.
 * Fold the safe integer seed into 32 bits, FNV-mix the stream name, then apply
 * xorshift32 (13, 17, 5) once per sampled request. Zero state becomes one.
 */
export class SeededOutcomeSampler {
  private state: number;
  constructor(seed = 1) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2 ** 48 - 1)
      throw new RangeError("outcome seed must be an integer in [0, 281474976710655]");
    let state = (seed >>> 0) ^ Math.floor(seed / 2 ** 32);
    for (const character of OUTCOME_RANDOM_STREAM)
      state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
    this.state = state || 1;
  }
  sample(weights: OutcomeWeights): JevRequestOutcome {
    const probabilities = normalizeOutcomeWeights(weights);
    let state = this.state;
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    this.state = state >>> 0;
    const draw = this.state / 2 ** 32;
    let cumulative = 0;
    let lastPositive: JevRequestOutcome = "finding";
    for (const outcome of JEV_OUTCOME_ORDER) {
      if (probabilities[outcome] === 0) continue;
      lastPositive = outcome;
      cumulative += probabilities[outcome];
      if (draw < cumulative) return outcome;
    }
    // Floating point addition can leave the positive distribution just below one.
    return lastPositive;
  }
}
