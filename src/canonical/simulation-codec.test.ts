import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { encodeSharedValue, decodeSharedValue } from "@hapsland/canonical-policy/canonical/simulation-codec"

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

it("reuses fully frozen native graphs while preserving mutable and accessor isolation", () => {
  const child = Object.freeze({ $: "Tuple", value: 7 })
  const input = Object.freeze({ $: "Some", value: child })
  expect(decodeSharedValue(input)).toBe(input)
  expect(decodeSharedValue(input)).toBe(input)
  const mutable = { $: "Tuple", value: 7 }
  const shallow = Object.freeze({ $: "Some", value: mutable })
  const decoded = decodeSharedValue(shallow)
  expect(decoded).not.toBe(shallow)
  mutable.value = 8
  expect(decoded).toEqual({ $: "Some", value: { $: "Tuple", value: 7 } })
  expect(decodeSharedValue(shallow)).toEqual({ $: "Some", value: { $: "Tuple", value: 8 } })
  let value = 1
  const accessor = Object.freeze({
    $: "Tuple",
    get value() {
      return value
    }
  })
  expect(decodeSharedValue(accessor)).toEqual({ $: "Tuple", value: 1 })
  value = 2
  expect(decodeSharedValue(accessor)).toEqual({ $: "Tuple", value: 2 })
})

it("keeps list bounds and scalar checks when frozen nodes are reused", () => {
  const nil = Object.freeze({ $: "Nil" })
  const list = Object.freeze({ $: "Con", head: 1, tail: nil })
  expect(decodeSharedValue(list)).toBe(list)
  let oversized: unknown = list
  for (let i = 0; i < 2048; i++) oversized = Object.freeze({ $: "Con", head: 1, tail: oversized })
  expect(() => decodeSharedValue(oversized)).toThrow()
  expect(() => decodeSharedValue(Object.freeze({ $: "Tuple", value: -1 }))).toThrow()
})

it("copies prototype-named payload fields as own data properties", () => {
  const input = JSON.parse('{"$":"Tuple","__proto__":{"$":"Some","value":1}}')
  const output = decodeSharedValue(input) as Record<string, unknown>
  expect(Object.getPrototypeOf(output)).toBe(Object.prototype)
  expect(Object.hasOwn(output, "__proto__")).toBe(true)
  expect(output.__proto__).toEqual({ $: "Some", value: 1 })
})
