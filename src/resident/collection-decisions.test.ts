import { describe, expect, it } from "vitest"
import {
  collectionOrdering,
  findingCollectionOutcome,
  finalCollectionFits
} from "@hapsland/resident-runtime/resident/collection-decisions"

describe("checked collection command decoding", () => {
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
  it.each([undefined, "collectionFits", "toString"])("refuses missing or unrelated commands %s", (command) => {
    expect(() => findingCollectionOutcome(command)).toThrow("invalid canonical finding fit")
    expect(() => collectionOrdering(command)).toThrow("invalid canonical collection order")
  })
  it("distinguishes accepted output from a byte-limited output", () => {
    expect(finalCollectionFits({ commands: [{ kind: "collectionFits" }] })).toBe(true)
    expect(finalCollectionFits({ commands: [{ kind: "collectionLimited" }] })).toBe(false)
  })
  it.each([
    { rejection: "refused", commands: [{ kind: "collectionFits" }] },
    { commands: [] },
    { commands: [{ kind: "collectionFits" }, { kind: "collectionLimited" }] }
  ])("refuses rejected or ambiguous final output decisions %#", (result) => {
    expect(() => finalCollectionFits(result)).toThrow("canonical final response fit refused")
  })
  it("does not treat an unrelated command as an output fit", () => {
    expect(() => finalCollectionFits({ commands: [{ kind: "collectionFindingSelected" }] })).toThrow(
      "invalid canonical final response fit"
    )
  })
})
