import { describe, expect, it } from "vitest"
import {
  collectionOrdering,
  findingCollectionOutcome,
  finalCollectionFits
} from "@hapsland/resident-runtime/resident/collection-decisions"

describe("checked collection decision decoding", () => {
  it.each([
    ["collectionFindingSelected", "selected"],
    ["collectionFindingRetained", "retained"],
    ["collectionFindingLimited", "limited"],
    ["collectionFindingExpired", "expired"]
  ])("preserves Bend finding disposition %s", (command, expected) => {
    expect(findingCollectionOutcome(command)).toBe(expected)
  })
  it.each([
    ["collectionBefore", -1],
    ["collectionEqual", 0],
    ["collectionAfter", 1]
  ] as const)("preserves Bend ordering %s", (command, expected) => expect(collectionOrdering(command)).toBe(expected))
  it.each([undefined, "collectionFits", "toString"])("refuses missing or unrelated outputs %s", (command) => {
    expect(() => findingCollectionOutcome(command)).toThrow("invalid canonical finding fit")
    expect(() => collectionOrdering(command)).toThrow("invalid canonical collection order")
  })
  it("distinguishes accepted output from a byte-limited output", () => {
    expect(finalCollectionFits({ outputs: [{ category: "decision", kind: "collectionFits" }] })).toBe(true)
    expect(finalCollectionFits({ outputs: [{ category: "decision", kind: "collectionLimited" }] })).toBe(false)
  })
  it.each([
    { rejection: "refused", outputs: [{ category: "decision", kind: "collectionFits" }] },
    { outputs: [] },
    {
      outputs: [
        { category: "decision", kind: "collectionFits" },
        { category: "decision", kind: "collectionLimited" }
      ]
    },
    { outputs: [{ category: "request", kind: "collectionFits" }] },
    { outputs: [{ category: "event", kind: "collectionFits" }] }
  ] as const)("refuses rejected or ambiguous final output decisions %#", (result) => {
    expect(() => finalCollectionFits(result)).toThrow("canonical final response fit refused")
  })
  it("does not treat an unrelated command as an output fit", () => {
    expect(() =>
      finalCollectionFits({ outputs: [{ category: "decision", kind: "collectionFindingSelected" }] })
    ).toThrow("invalid canonical final response fit")
  })
})
