import { expect, it } from "vitest"
import { createRun, restoreReplay, type Run } from "./index.ts"

const replay = (run: Run) =>
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
// Supplied synthetic final encoded output includes wrapping. UTF-8 measurement
// below is an independent fixture expectation, not native serializer evidence.
const encoded = (bytes: number) => {
  const prefix = '{"decision":"block","reason":"',
    suffix = '"}'
  const overhead = new TextEncoder().encode(prefix + suffix).byteLength
  const remaining = bytes - overhead
  return prefix + "é".repeat(Math.floor(remaining / 2)) + "x".repeat(remaining % 2) + suffix
}
const configuration = (bytes: number, outcome: "failed" | "uncertain" = "uncertain") => ({
  seed: 7,
  retention: 1000,
  outcome: "finding" as const,
  preparationDelay: 2,
  jevDelay: 5,
  finishDeadline: 50,
  lifecycles: { encodedOutputBytes: bytes },
  outputProfile: { outcome, delayMs: 5, leaseMs: 20 },
  inputs: [
    { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] },
    { at: 1, kind: "finish" as const }
  ]
})

it.each([10239, 10240, 10241])(
  "uses the existing final UTF-8 byte limit at %i without a finding-count cap",
  (bytes) => {
    expect(new TextEncoder().encode(encoded(bytes)).byteLength).toBe(bytes)
    const run = createRun(configuration(bytes))
    run.advance({ untilTime: 7, maxEvents: 300 })
    const fits = run.observations.filter(
      (frame) => frame.event.kind === "collectionFitCheck" && frame.event.bytes === bytes
    )
    expect(fits.length).toBeGreaterThan(0)
    expect(
      fits.every((frame) =>
        frame.outputs.some((command) => command.kind === (bytes <= 10240 ? "collectionFits" : "collectionLimited"))
      )
    ).toBe(true)
    if (bytes > 10240) {
      expect(
        run.observations.some(
          (frame) =>
            frame.event.kind === "collectionReserveLease" ||
            frame.event.kind === "finishAuthorize" ||
            (frame.event.kind === "finishReserve" && frame.event.selected.length > 0)
        )
      ).toBe(false)
      expect(run.projection.collection.leases).toEqual([])
      expect(
        run.projection.delivery.counters.find((counter) => counter.group === 1 && counter.round === 1)?.used ?? 0
      ).toBe(0)
    } else {
      const authorized = run.observations.find((frame) => frame.event.kind === "finishAuthorize")!
      expect(authorized.time).toBe(7)
      expect(authorized.event).toMatchObject({ group: 1, round: 1, selected: [3] })
      expect(run.projection.delivery.counters.find((counter) => counter.group === 1 && counter.round === 1)?.used).toBe(
        1
      )
    }
    replay(run)
    run.advance({ untilTime: 20, maxEvents: 300 })
    const authorized = run.observations.find((frame) => frame.event.kind === "finishAuthorize")
    const terminal = run.observations.find((frame) => frame.event.kind === "finishTerminal")
    if (bytes <= 10240) {
      expect(terminal?.time).toBe(12)
      expect(terminal?.event).toMatchObject({ outcome: "unknown" })
      expect(terminal && "selected" in terminal.event ? terminal.event.selected : undefined).toEqual(
        authorized && "selected" in authorized.event ? authorized.event.selected : undefined
      )
      expect(terminal?.event).toMatchObject({
        attempt: authorized && "attempt" in authorized.event ? authorized.event.attempt : 0,
        token: authorized && "token" in authorized.event ? authorized.event.token : 0
      })
    }
    expect(run.projection.collection.leases).toEqual([])
    replay(run)
  }
)

it("releases a proven preauthorization provisional number without authorizing or claiming output", () => {
  const run = createRun(configuration(10240, "failed"))
  run.advance({ untilTime: 7, maxEvents: 300 })
  const reserved = run.observations.find((frame) => frame.outputs.some((command) => command.kind === "finishReserved"))!
  expect(reserved.time).toBe(7)
  expect(run.projection.delivery.counters.find((counter) => counter.group === 1 && counter.round === 1)?.used).toBe(1)
  expect(run.observations.some((frame) => frame.event.kind === "finishAuthorize")).toBe(false)
  replay(run)
  run.advance({ untilTime: 12, maxEvents: 300 })
  expect(
    run.observations.some(
      (frame) => frame.outputs.some((command) => command.kind === "finishReleased") && frame.time === 12
    )
  ).toBe(true)
  expect(run.projection.delivery.counters.find((counter) => counter.group === 1 && counter.round === 1)?.used).toBe(0)
  expect(run.observations.some((frame) => frame.event.kind === "finishTerminal")).toBe(false)
  expect(run.projection.collection.leases).toEqual([])
  replay(run)
})

it("consumes authorized uncertain output and refuses a mismatched terminal membership atomically", () => {
  const run = createRun(configuration(10240))
  run.advance({ untilTime: 7, maxEvents: 300 })
  const issued = run.observations.find((frame) => frame.event.kind === "finishAuthorize")!
  expect(issued.event.kind).toBe("finishAuthorize")
  if (issued.event.kind !== "finishAuthorize") throw new Error("Missing actual issued Finish identity")
  const { group, round, attempt, token, selected } = issued.event
  const before = structuredClone(run.projection)
  run.schedule({
    at: 8,
    kind: "canonical",
    event: { kind: "finishTerminal", group, round, attempt, token, selected: [], outcome: "unknown" }
  })
  run.advance({ untilTime: 8, maxEvents: 300 })
  expect(run.observations.at(-1)?.outputs.some((command) => command.kind === "finishRefused")).toBe(true)
  expect(run.projection).toEqual(before)
  replay(run)
  run.advance({ untilTime: 12, maxEvents: 300 })
  expect(run.observations.findLast((frame) => frame.event.kind === "finishTerminal")?.event).toMatchObject({
    group,
    round,
    attempt,
    token,
    selected,
    outcome: "unknown"
  })
  expect(
    run.projection.delivery.counters.find((counter) => counter.group === group && counter.round === round)?.used
  ).toBe(1)
  expect(run.projection.collection.leases).toEqual([])
  replay(run)
})
