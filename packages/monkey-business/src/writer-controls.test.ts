import { expect, it } from "vitest"
import { captureWriter, encodeWriterCapture, validateWriterControl, decodeWriterEvents } from "./writer-controls.ts"
import { SharedCore } from "./shared-core.ts"
const capture = {
  target: { partition: 1, lifetime: 3, round: 5, token: 7 },
  claimStarted: 10,
  claimLifetimeMs: 20,
  capacity: 2,
  response: { partition: 1, lifetime: 3, round: 5, started: 10, deadline: 40, admittedBlock: false }
}
it("retains the exact original writer token, scope, lease and response authority", () => {
  const frozen = captureWriter(capture)
  expect(Object.isFrozen(frozen)).toBe(true)
  expect(Object.isFrozen(frozen.target)).toBe(true)
  expect(Object.isFrozen(frozen.response)).toBe(true)
  expect(encodeWriterCapture(capture)).toEqual({
    $: "WriterScenario.ClaimFacts",
    target: { $: "WriterScenario.Target", partition: 1, lifetime: 3, round: 5, token: 7 },
    claim_started: 10,
    claim_lifetime: 20,
    capacity: 2,
    response: {
      $: "CollectionScenario.Response",
      partition: 1,
      lifetime: 3,
      round: 5,
      started: 10,
      deadline: 40,
      admitted_block: false
    }
  })
})
it("validates action-specific fields, exact object shape and bounded derived clocks", () => {
  expect(() => captureWriter({ ...capture, response: { ...capture.response, id: 41 } })).toThrow()
  expect(() =>
    validateWriterControl({
      kind: "backgroundWriter",
      action: "claim",
      agent: "a",
      capture: { ...capture, claimStarted: 2 ** 48 - 2 }
    })
  ).toThrow()
  expect(() =>
    validateWriterControl({ kind: "backgroundWriter", action: "attempt", agent: "a", target: capture.target })
  ).toThrow()
  expect(() =>
    validateWriterControl({
      kind: "backgroundWriter",
      action: "release",
      agent: "a",
      target: { ...capture.target, newLifetime: 4 }
    })
  ).toThrow()
  expect(() => captureWriter({ ...capture, response: { ...capture.response, deadline: 9 } })).toThrow()
})
it("decodes bounded actual release facts without interpreting ownership in TypeScript", () => {
  expect(
    decodeWriterEvents({
      $: "Con",
      head: { $: "Canonical.CollectionReleaseBackground", group: 1n, token: 7n },
      tail: { $: "Nil" }
    })
  ).toEqual([{ kind: "collectionReleaseBackground", group: 1, token: 7 }])
})
it("peeks authentic writer release authority without consuming its original receipt", () => {
  const core = new SharedCore({ globalItems: 32, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 }, 1)
  core.declareAdvicee(1, 1)
  core.configureCredentials(true, 1)
  core.step({ kind: "openRound", partition: 1, lifetime: 1 })
  const original = {
    target: { partition: 1, lifetime: 1, round: 1, token: 51 },
    claimStarted: 0,
    claimLifetimeMs: 20,
    capacity: 2,
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 30, admittedBlock: false }
  }
  const prepared = core.writerPrepare(original)
  if (!prepared.pending) throw new Error("missing actual writer preparation")
  core.step(core.writerClaim(prepared.pending, 0))
  expect(core.writerAfter(prepared.pending, 0).issued).toEqual({ id: 1, partition: 1, lifetime: 1, round: 1 })
  const release = core.writerRelease(original.target)[0]
  if (!release) throw new Error("missing actual writer release receipt")
  const before = core.projection
  expect(core.writerReleaseValid(release.receipt, 1)).toBe(true)
  expect(core.writerReleaseValid(release.receipt, 1)).toBe(true)
  expect(core.projection).toEqual(before)
  expect(core.writerReleaseDelivery(release.receipt, 1)).toEqual(release.event)
  expect(() => core.writerReleaseValid(release.receipt, 1)).toThrow("foreign or consumed")
  expect(() => core.writerReleaseDelivery(release.receipt, 1)).toThrow("foreign or consumed")
  expect(core.projection).toEqual(before)
})
