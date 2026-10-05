import { JEV_OUTCOME_ORDER, validateOutcomeWeights, type OutcomeWeights } from "../../../packages/monkey-business/src/index.ts"

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid game review encoding")
  return value as Record<string, unknown>
}

/** Decode the emitted translator's ordinary IEEE64 words; sampling remains shared-engine owned. */
export function reviewWeights(encoded: unknown): OutcomeWeights {
  let cursor = encoded
  const weights: Partial<Record<typeof JEV_OUTCOME_ORDER[number], number>> = {}
  for (const outcome of JEV_OUTCOME_ORDER) {
    const item = object(cursor)
    const word = object(item.head)
    if (item.$ !== "Con" || word.$ !== "../../packages/monkey-business-bend/Numeric.Words")
      throw new Error("invalid game review encoding")
    for (const field of [word.high, word.low])
      if (typeof field !== "bigint" || field < 0n || field > 0xffff_ffffn)
        throw new Error("invalid game numeric word")
    const bytes = new DataView(new ArrayBuffer(8))
    bytes.setUint32(0, Number(word.high), false)
    bytes.setUint32(4, Number(word.low), false)
    weights[outcome] = bytes.getFloat64(0, false)
    cursor = item.tail
  }
  if (object(cursor).$ !== "Nil") throw new Error("invalid game review weight count")
  return validateOutcomeWeights(weights as OutcomeWeights)
}
