import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"

// Each edit allocates observation, preparation, review and physical request
// IDs in that order (Canonical.admit_one and request_ready_reserved).
// Each seed stops while preparation is pending, before automatic edit output.
// Timing and singleton memberships are independent expectations, not trace data.
// The byte count is a synthetic final encoded-output fact, not native IO size.
const campaigns = [
  { seed: 7, preparation: 2, backend: 5, stop: 1, delay: 5, lease: 30, outcome: "uncertain" },
  { seed: 91001, preparation: 3, backend: 7, stop: 1, delay: 6, lease: 30, outcome: "failed" },
  { seed: 4294967313, preparation: 1, backend: 9, stop: 1, delay: 4, lease: 30, outcome: "uncertain" },
  { seed: 11, preparation: 2, backend: 5, stop: 1, delay: 4, lease: 5, outcome: "certain" },
  { seed: 12, preparation: 2, backend: 5, stop: 1, delay: 5, lease: 5, outcome: "certain" },
  { seed: 13, preparation: 2, backend: 5, stop: 1, delay: 6, lease: 5, outcome: "certain" }
] as const

it.each(campaigns)("seed $seed preserves captured Stop membership and output profile across replay", (scenario) => {
  const run = createRun({
    seed: scenario.seed,
    retention: 10000,
    outcome: "finding",
    preparationDelay: scenario.preparation,
    jevDelay: scenario.backend,
    finishDeadline: 50,
    lifecycles: { encodedOutputBytes: 10240 },
    outputProfile: { outcome: scenario.outcome, delayMs: scenario.delay, leaseMs: scenario.lease },
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: scenario.stop, kind: "finish" }
    ]
  })
  const ready = scenario.preparation + scenario.backend
  const first = run.advance({ untilTime: ready, maxEvents: 500 })
  expect(first.reason).not.toBe("eventLimit")
  const reserve = run.observations.find((frame) => frame.event.kind === "finishReserve")
  expect(reserve?.event).toMatchObject({ group: 1, round: 1, selected: [3] })
  expect(run.projection.delivery.counters).toContainEqual({ group: 1, round: 1, used: 1 })
  expect(run.observations.filter((frame) => frame.event.kind === "finishAuthorize")).toHaveLength(
    scenario.outcome === "failed" ? 0 : 1
  )
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())

  // Changing future output does not change an already captured completion.
  run.applyControl({ kind: "outputProfile", outcome: "certain", delayMs: 1, leaseMs: 1 })
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  const endpoint = ready + (scenario.outcome === "failed" ? scenario.delay : Math.min(scenario.delay, scenario.lease))
  run.advance({ untilTime: endpoint - 1, maxEvents: 500 })
  restored.advance({ untilTime: endpoint - 1, maxEvents: 500 })
  expect(restored.observe()).toEqual(run.observe())
  expect(
    run.observations.some((frame) => frame.event.kind === "finishTerminal" || frame.event.kind === "finishRelease")
  ).toBe(false)
  run.advance({ untilTime: endpoint, maxEvents: 500 })
  restored.advance({ untilTime: endpoint, maxEvents: 500 })
  expect(restored.observe()).toEqual(run.observe())
  if (scenario.outcome === "failed") {
    expect(run.observations.find((frame) => frame.event.kind === "finishRelease")?.time).toBe(endpoint)
    expect(
      run.observations.some((frame) => frame.event.kind === "finishAuthorize" || frame.event.kind === "finishTerminal")
    ).toBe(false)
    expect(run.projection.delivery.counters.find((counter) => counter.group === 1 && counter.round === 1)?.used).toBe(0)
  } else {
    expect(run.observations.find((frame) => frame.event.kind === "finishTerminal")).toMatchObject({
      time: endpoint,
      event: {
        group: 1,
        round: 1,
        selected: [3],
        outcome: scenario.outcome === "certain" && scenario.delay < scenario.lease ? "acknowledged" : "unknown"
      }
    })
    expect(run.projection.delivery.counters.find((counter) => counter.group === 1 && counter.round === 1)?.used).toBe(1)
  }
  expect(run.projection.collection.leases).toEqual([])
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
})

it("uses four actual same-round outputs then permits Stop without a fifth continuation", () => {
  const run = createRun({
    seed: 91001,
    retention: 10000,
    outcome: "finding",
    preparationDelay: 2,
    jevDelay: 5,
    finishDeadline: 50,
    lifecycles: { encodedOutputBytes: 10240 },
    outputProfile: { outcome: "uncertain", delayMs: 5, leaseMs: 30 },
    inputs: Array.from({ length: 5 }, (_, index) => [
      { at: index * 40, kind: "edit" as const, bytes: 10, unitBytes: [5] },
      { at: index * 40 + 1, kind: "finish" as const }
    ]).flat()
  })
  for (let index = 0; index < 5; index++) {
    if (index === 4) {
      const stopAt = index * 40 + 1
      run.advance({ untilTime: stopAt, maxEvents: 500 })
      const pending = run.observations.findLast((frame) => frame.event.kind === "stopPolled")
      expect(pending?.time).toBe(stopAt)
      expect(pending?.outputs.some((command) => command.kind === "waitForWork")).toBe(true)
      expect(run.projection.delivery.counters).toContainEqual({ group: 1, round: 1, used: 4 })
      expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
    }
    run.advance({ untilTime: index * 40 + 2 + 5, maxEvents: 500 })
    const check = run.observations.findLast((frame) => frame.event.kind === "roundContinuationBudgetCheck")
    expect(check?.event).toMatchObject({ active: true, count: Math.min(index, 4) })
    expect(check?.outputs.map((command) => command.kind)).toContain(
      index < 4 ? "roundContinuationAvailable" : "roundContinuationExhausted"
    )
    expect(run.observations.filter((frame) => frame.event.kind === "finishAuthorize")).toHaveLength(
      Math.min(index + 1, 4)
    )
    if (index < 4) {
      expect(run.observations.findLast((frame) => frame.event.kind === "finishAuthorize")?.event).toMatchObject({
        group: 1,
        round: 1,
        selected: [index * 4 + 3]
      })
    }
    expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
    run.advance({ untilTime: index * 40 + 12, maxEvents: 500 })
    if (index < 4) {
      expect(run.projection.delivery.counters.find((counter) => counter.group === 1 && counter.round === 1)?.used).toBe(
        index + 1
      )
    } else {
      // Canonical waits for this declared preparation/backend completion before
      // checking exhaustion; retirement removes the live counter.
      // Preserve its historical value at the actual closure transition.
      const retired = run.observations.find((frame) =>
        frame.outputs.some((command) => command.kind === "partitionRetired")
      )
      const readyAt = index * 40 + 2 + 5
      expect(retired?.time).toBe(readyAt)
      expect(
        run.observations.some(
          (frame) => frame.time === readyAt && frame.outputs.some((command) => command.kind === "finishAllowedNoAdvice")
        )
      ).toBe(true)
      expect(retired?.before.delivery.counters).toContainEqual({ group: 1, round: 1, used: 4 })
      expect(retired?.after.delivery.counters.some((counter) => counter.group === 1 && counter.round === 1)).toBe(false)
      expect(retired?.after.rounds.some((round) => round.partition === 1 && round.id === 1)).toBe(false)
      expect(run.projection.delivery.counters.some((counter) => counter.group === 1 && counter.round === 1)).toBe(false)
      expect(run.projection.rounds.some((round) => round.partition === 1 && round.id === 1)).toBe(false)
      expect(
        run.observations.some(
          (frame) => frame.time >= 161 && frame.event.kind === "finishReserve" && frame.event.selected.length > 0
        )
      ).toBe(false)
      expect(run.observations.some((frame) => frame.time >= 161 && frame.event.kind === "finishAuthorize")).toBe(false)
    }
    expect(run.projection.collection.leases).toEqual([])
    expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
  }
  expect(run.observations.filter((frame) => frame.event.kind === "finishTerminal")).toHaveLength(4)
  expect(
    run.observations.some(
      (frame) =>
        frame.outputs.some((command) => command.kind === "finishAllowedNoAdvice") && frame.time === 4 * 40 + 2 + 5
    )
  ).toBe(true)
}, 60000)
