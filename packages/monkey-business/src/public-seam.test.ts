import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"

it("observes one isolated resident boundary and restores that boundary through replay", () => {
  const run = createRun({
    inputs: [{ at: 2 ** 32 + 17, kind: "canonical", event: { kind: "openRound", partition: 1, lifetime: 1 } }]
  })
  expect(run.step()?.outputs).toEqual([{ category: "event", kind: "roundStarted", id: 1 }])
  const view = run.observe()
  expect(view.now).toBe(2 ** 32 + 17)
  expect(view.eventCount).toBe(1)
  expect(view.projection.rounds.map((round) => [round.partition, round.id])).toEqual([[1, 1]])
  expect(Object.isFrozen(view.observations)).toBe(true)
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(view)
})

it("rejects excess advance fields synchronously without publishing state", () => {
  const run = createRun()
  const before = run.observe()
  expect(() => run.advance({ maxEvents: 1, typo: true } as never)).toThrow(TypeError)
  expect(run.observe()).toEqual(before)
})

it("preserves the full u48 scripted clock and refuses the adjacent value atomically", () => {
  const at = 2 ** 48 - 1
  const run = createRun({
    inputs: [{ at, kind: "canonical", event: { kind: "openRound", partition: 1, lifetime: 1 } }]
  })
  expect(run.advance({ untilTime: at }).now).toBe(at)
  expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
  const before = run.observe()
  expect(() => run.schedule({ at: at + 1, kind: "finish" })).toThrow()
  expect(() => run.advance({ untilTime: at + 1 })).toThrow()
  expect(run.observe()).toEqual(before)
})

it("keeps independently expected finding and NeverSent lifecycle observations", () => {
  for (const outcome of ["finding", "neverSent"] as const) {
    const run = createRun({
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome }],
      preparationDelay: 2,
      jevDelay: 5
    })
    run.advance({ untilTime: 6 })
    expect(
      run.observe().observations.some((frame) => frame.outputs.some((command) => command.kind === "findingRetained"))
    ).toBe(false)
    run.advance({ untilTime: 7 })
    const frames = run.observe().observations
    expect(frames.filter((frame) => frame.event.kind === "jevRequestSettled").map((frame) => frame.time)).toEqual([7])
    expect(frames.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(
      outcome === "neverSent" ? 0 : 1
    )
    expect(
      frames.flatMap((frame) => frame.outputs).filter((command) => command.kind === "findingRetained")
    ).toHaveLength(outcome === "finding" ? 1 : 0)
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
  }
})
