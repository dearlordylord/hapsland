import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { encodeSharedValue, decodeSharedValue } from "./simulation-codec.ts"

const prefix = "../agent-flow-bend/"

describe("shared Bend value transport", () => {
  it.each([0, 1, 281474976710655])("preserves exact Nat %s across the emitter boundary", (value) => {
    expect(encodeSharedValue(value)).toBe(BigInt(value))
    expect(encodeSharedValue(BigInt(value))).toBe(BigInt(value))
    expect(decodeSharedValue(BigInt(value))).toBe(value)
    expect(decodeSharedValue(value)).toBe(value)
  })
  it.each([-1n, 281474976710656n, -1, 281474976710656, 0.5, NaN, Infinity])("refuses invalid Nat %s", (value) => {
    expect(() => encodeSharedValue(value)).toThrow()
    expect(() => decodeSharedValue(value)).toThrow()
  })
  it.each(["RulePolicy.Words", prefix + "RulePolicy.Words", "Numeric.Words"])(
    "keeps U32 words native while encoding surrounding Nats: %s",
    (tag) => {
      const input = { $: tag, high: 4294967295, low: 0n, other: 7 }
      const encoded = encodeSharedValue(input)
      expect(encoded).toEqual({
        $: tag.startsWith("Numeric.") ? tag : prefix + "RulePolicy.Words",
        high: 4294967295,
        low: 0,
        other: 7n
      })
      expect(decodeSharedValue(encoded)).toEqual({
        $: tag.startsWith("Numeric.") ? tag : "RulePolicy.Words",
        high: 4294967295,
        low: 0,
        other: 7
      })
      expect(() => encodeSharedValue({ ...input, high: 4294967296 })).toThrow()
      expect(() => decodeSharedValue({ ...input, low: 4294967296n })).toThrow()
    }
  )
  it("normalizes only policy namespaces and leaves local constructors unchanged", () => {
    expect(encodeSharedValue({ $: "Canonical.OpenRound", partition: 1, lifetime: 2 })).toEqual({
      $: prefix + "Canonical.OpenRound",
      partition: 1n,
      lifetime: 2n
    })
    expect(decodeSharedValue({ $: prefix + "Canonical.OpenRound", partition: 1n, lifetime: 2n })).toEqual({
      $: "Canonical.OpenRound",
      partition: 1,
      lifetime: 2
    })
    expect(encodeSharedValue({ $: "Session.Stream", count: 1 })).toEqual({ $: "Session.Stream", count: 1n })
    expect(decodeSharedValue({ $: "Session.Stream", count: 1n })).toEqual({ $: "Session.Stream", count: 1 })
  })
  it.each([undefined, 1, "bad", "Unknown.Constructor", prefix + "Session.Stream", "Canonical."])(
    "refuses invalid constructor tag %s",
    (tag) => {
      expect(() => encodeSharedValue({ $: tag })).toThrow()
      expect(() => decodeSharedValue({ $: tag })).toThrow()
    }
  )
  it("keeps primitive payloads and converts bounded linked lists without mutating input", () => {
    const input = { $: "Con", head: { $: "Tuple", label: "text", flag: true, empty: null }, tail: { $: "Nil" } }
    expect(decodeSharedValue(encodeSharedValue(input))).toEqual(input)
    expect(() => encodeSharedValue([])).toThrow()
    let oversized: unknown = { $: "Nil" }
    for (let index = 0; index < 2049; index++) oversized = { $: "Con", head: index, tail: oversized }
    expect(() => encodeSharedValue(oversized)).toThrow()
  })
  it("round-trips nested constructor and list payloads", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            count: fc.integer({ min: 0, max: 281474976710655 }),
            label: fc.string({ maxLength: 30 }),
            flag: fc.boolean()
          }),
          { maxLength: 20 }
        ),
        (items) => {
          const list = items.reduceRight<unknown>((tail, item) => ({ $: "Con", head: { $: "Tuple", ...item }, tail }), {
            $: "Nil"
          })
          const input = { $: "Some", value: list }
          expect(decodeSharedValue(encodeSharedValue(input))).toEqual(input)
        }
      ),
      { numRuns: 100, seed: 217 }
    )
  })
})
