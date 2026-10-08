import { expect, it } from "vitest"
import { createRun, type RunInput } from "./index.ts"

it("rejects past edit and canonical scheduling atomically and accepts later work", () => {
  const run = createRun({
    preparationDelay: 1,
    jevDelay: 1,
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  run.advance({ untilTime: 10, maxEvents: 200 })
  const before = { observation: run.observe(), runtime: run.runtimeSnapshot(), replay: run.exportReplay() }
  const past: RunInput[] = [
    {
      at: 0,
      kind: "edit",
      bytes: 10,
      unitBytes: [5],
      evaluationInputs: ["rejected-prepared-unit"],
      revisionSubject: "rejected-root",
      revisionInput: "rejected-input"
    },
    { at: 0, kind: "canonical", event: { kind: "collectionOrderCheck", leftSequence: 1, rightSequence: 2 } }
  ]
  for (const input of past) {
    expect(() => run.schedule(input)).toThrow(new RangeError("cannot schedule in the past"))
    expect(run.observe()).toEqual(before.observation)
    expect(run.runtimeSnapshot()).toEqual(before.runtime)
    expect(run.exportReplay()).toEqual(before.replay)
  }

  run.schedule({ at: 11, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" })
  run.schedule({
    at: 11,
    kind: "canonical",
    event: { kind: "collectionOrderCheck", leftSequence: 1, rightSequence: 2 }
  })
  run.advance({ untilTime: 20, maxEvents: 200 })
  expect(run.observe().eventCount).toBeGreaterThan(before.observation.eventCount)
  expect(run.observations.filter((frame) => frame.event.kind === "preparationCompleted")).toHaveLength(2)
})
