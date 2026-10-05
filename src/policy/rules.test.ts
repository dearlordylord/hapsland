import { describe, expect, it } from "vitest"
import { Probability, RuleId } from "../domain/contracts.ts"
import { deriveAdvice } from "./rules.ts"
import { configuredRules } from "../test-support/default-rules.ts"

const snapshot = { path: "src/example.ts", contentHash: "abc123" }

describe("advice policy", () => {
  it("keeps zero and the threshold clean, and reports values above it", () => {
    const rule = configuredRules[0]
    if (rule === undefined) throw new Error("expected a configured rule")
    const atThreshold = { [rule.id]: Probability.make(0.7) }
    expect(deriveAdvice([rule], atThreshold, snapshot, 5)).toEqual([])

    const above = { [rule.id]: Probability.make(1) }
    expect(deriveAdvice([rule], above, snapshot, 5)).toEqual([
      { ruleId: RuleId.make(rule.id), probability: Probability.make(1), message: rule.message, snapshot }
    ])
  })

  it("orders by probability then stable rule rank and enforces the budget", () => {
    const assessment = Object.fromEntries(configuredRules.map((rule) => [rule.id, Probability.make(0.9)]))
    const advice = deriveAdvice(configuredRules, assessment, snapshot, 3)
    expect(advice).toHaveLength(3)
    expect(advice.map((item) => item.ruleId)).toEqual(configuredRules.slice(0, 3).map((rule) => rule.id))
  })

  it("keeps adjacent binary64 values on opposite sides of a strict threshold", () => {
    const rule = configuredRules[0]
    if (rule === undefined) throw new Error("expected a configured rule")
    const words = new DataView(new ArrayBuffer(8))
    words.setFloat64(0, rule.threshold, false)
    words.setUint32(4, words.getUint32(4, false) + 1, false)
    const next = words.getFloat64(0, false)
    expect(deriveAdvice([rule], { [rule.id]: Probability.make(rule.threshold) }, snapshot, 1)).toEqual([])
    expect(deriveAdvice([rule], { [rule.id]: Probability.make(next) }, snapshot, 1)).toHaveLength(1)
  })

  it("ranks a higher probability ahead of an earlier configured rule", () => {
    const first = configuredRules[0]
    const second = configuredRules[1]
    if (first === undefined || second === undefined) throw new Error("expected two rules")
    const advice = deriveAdvice(
      [first, second],
      { [first.id]: Probability.make(0.8), [second.id]: Probability.make(0.9) },
      snapshot,
      1
    )
    expect(advice.map(({ ruleId }) => ruleId)).toEqual([second.id])
  })
})
