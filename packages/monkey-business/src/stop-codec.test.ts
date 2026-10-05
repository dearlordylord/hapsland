import { expect, it } from "vitest"
import { encodeStopCapture, decodeStopFacts, decodeStopFound } from "./stop-codec.ts"

const original = { partition: 2, lifetime: 3, round: 4, attempt: 5, token: 6, started: 7, cutoff: 11 }
it("captures the exact original scope and safe cutoff, including u48 times", () => {
  expect(encodeStopCapture(original)).toEqual({ $: "StopScenario.Capture", ...original })
  expect(encodeStopCapture({ ...original, cutoff: 2 ** 48 - 1 }).cutoff).toBe(2 ** 48 - 1)
  for (const change of [{ cutoff: 6 }, { cutoff: 2 ** 48 }, { lifetime: 0 }, { attempt: 0 }, { token: 0 }])
    expect(() => encodeStopCapture({ ...original, ...change })).toThrow()
})
it("decodes captured polls without changing same-time order or scope", () => {
  expect(
    decodeStopFacts({
      $: "Con",
      head: {
        $: "StopScenario.Fact",
        at: 11n,
        event: { $: "Canonical.StopPolled", partition: 2, lifetime: 3, round: 4, deadline: true }
      },
      tail: { $: "Nil" }
    })
  ).toEqual([{ at: 11, event: { kind: "stopPolled", partition: 2, lifetime: 3, round: 4, deadline: true } }])
})

it("decodes exact optional Finish values without retaining mutable input", () => {
  const finish = {
    $: "StopScenario.Finish",
    partition: 2,
    lifetime: 3,
    round: 4,
    attempt: 5,
    token: 6,
    deadline: 11,
    recurring: false,
    selected: { $: "Con", head: 9, tail: { $: "Nil" } },
    waiting: false,
    validating: 0,
    started: 7,
    fit_pending: false,
    output: { $: "Nil" }
  }
  const decoded = decodeStopFound({ $: "Some", value: finish })
  finish.selected.head = 10
  expect(decoded?.selected).toEqual([9])
  expect(Object.isFrozen(decoded)).toBe(true)
  expect(Object.isFrozen(decoded?.selected)).toBe(true)
  expect(decodeStopFound({ $: "None" })).toBeUndefined()
  for (const value of [
    { $: "None", value: finish },
    { $: "Some" },
    { $: "Some", value: { ...finish, extra: true } },
    { $: "Some", value: { ...finish, started: 12 } }
  ])
    expect(() => decodeStopFound(value)).toThrow(TypeError)
})
