import { expect, it } from "vitest"
import { encodeStopCapture, decodeStopFacts } from "./stop-codec.ts"

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
