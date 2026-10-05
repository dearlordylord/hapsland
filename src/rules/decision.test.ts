import { describe, expect, it } from "vitest"
import { initialCanonical, probabilityWords, stepCanonical, type CanonicalEvent } from "../canonical/adapter.ts"
import { findingFromProbability, compareAdviceOrder } from "./decision.ts"

const initial = initialCanonical({ globalItems: 1, globalBytes: 1, partitionItems: 1, partitionBytes: 1 })

describe("canonical probability words", () => {
  it("retains adjacent threshold values", () => {
    expect(findingFromProbability(0.7, 0.7)).toBe(false)
    expect(findingFromProbability(0.7000000000000001, 0.7)).toBe(true)
  })

  it("rejects malformed words at the canonical boundary", () => {
    const threshold = probabilityWords(0.7)
    for (const probability of [
      { high: 0x7ff00000, low: 0 }, // positive infinity
      { high: 0xbff00000, low: 0 }, // negative one
      { high: 0x3ff00000, low: 1 }, // greater than one
      { high: 0x80000000, low: 0 }, // negative zero
      { high: 0x3fe66666, low: 2 ** 32 } // invalid low word
    ]) {
      const event = { kind: "ruleFindingCheck", probability, threshold } as CanonicalEvent
      expect(() => stepCanonical(initial, event)).toThrow()
    }
  })
})

it("orders equal-probability advice by path and then rule identity", () => {
  const first = { probability: 0.8, path: "a.ts", ruleId: "r1" }
  const second = { probability: 0.8, path: "a.ts", ruleId: "r2" }
  const third = { probability: 0.8, path: "b.ts", ruleId: "r1" }
  expect([third, second, first].sort(compareAdviceOrder)).toEqual([first, second, third])
  expect(compareAdviceOrder(first, first)).toBe(0)
  expect(compareAdviceOrder(first, third)).toBeLessThan(0)
  expect(compareAdviceOrder(third, first)).toBeGreaterThan(0)
  expect(compareAdviceOrder(second, first)).toBeGreaterThan(0)
})
