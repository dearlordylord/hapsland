import { expect, it } from "vitest"
import { encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/canonical-boundary"
import { readCanonicalEvent } from "@hapsland/canonical-policy/canonical/event-reader"

const stopEnded = () => ({
  kind: "stopGroupEnded" as const,
  group: 9,
  lifetime: 2,
  round: 4,
  scopes: [{ partition: 7, round: 3 }]
})

it("copies foreign event graphs, freezes decoded data, and reuses only reader outputs", () => {
  const input = stopEnded()
  const decoded = readCanonicalEvent(input)

  expect(decoded).not.toBe(input)
  expect(decoded.kind).toBe("stopGroupEnded")
  if (decoded.kind !== "stopGroupEnded") throw new Error("wrong event")
  expect(decoded.scopes).not.toBe(input.scopes)
  expect(decoded.scopes[0]).not.toBe(input.scopes[0])
  expect(Object.isFrozen(decoded)).toBe(true)
  expect(Object.isFrozen(decoded.scopes)).toBe(true)
  expect(Object.isFrozen(decoded.scopes[0])).toBe(true)
  expect(Object.isFrozen(input)).toBe(false)
  expect(Object.isFrozen(input.scopes)).toBe(false)

  input.scopes[0]!.partition = 8
  expect(decoded.scopes[0]?.partition).toBe(7)
  expect(readCanonicalEvent(decoded)).toBe(decoded)
  expect(encodeCanonicalEvent(decoded)).toEqual({
    $: "Canonical.StopGroupEnded",
    group: 9,
    lifetime: 2,
    round: 4,
    scopes: { $: "Con", head: { $: "Canonical.StopScope", partition: 7, round: 3 }, tail: { $: "Nil" } }
  })
})

it("always decodes frozen lookalikes and mutable originals", () => {
  const frozenLookalike = Object.freeze({
    ...stopEnded(),
    scopes: Object.freeze([Object.freeze({ partition: 7, round: 3 })])
  })
  const firstLookalikeDecode = readCanonicalEvent(frozenLookalike)
  const secondLookalikeDecode = readCanonicalEvent(frozenLookalike)
  expect(firstLookalikeDecode).not.toBe(frozenLookalike)
  expect(secondLookalikeDecode).not.toBe(firstLookalikeDecode)

  const mutableInput = stopEnded()
  const firstMutableDecode = readCanonicalEvent(mutableInput)
  const secondMutableDecode = readCanonicalEvent(mutableInput)
  expect(firstMutableDecode).not.toBe(mutableInput)
  expect(secondMutableDecode).not.toBe(firstMutableDecode)
  expect(Object.isFrozen(mutableInput)).toBe(false)
})

it("preserves exact-field and range failures as TypeErrors", () => {
  expect(() => readCanonicalEvent({ ...stopEnded(), extra: true })).toThrow(
    new TypeError("invalid Bend boundary value")
  )
  expect(() => readCanonicalEvent({ ...stopEnded(), group: 0 })).toThrow(new TypeError("invalid Bend boundary value"))
  expect(() => encodeCanonicalEvent({ ...stopEnded(), extra: true } as never)).toThrow(
    new TypeError("invalid Bend boundary value")
  )
})
