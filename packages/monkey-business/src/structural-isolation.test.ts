import { expect, it } from "vitest"
import { createRun, restoreReplay, type RunStructuralFrame } from "./index.ts"

it("isolates structural details and retains immutable snapshots across listeners and later steps", () => {
  const config = {
    outcome: "finding" as const,
    preparationDelay: 2,
    jevDelay: 5,
    retention: 1000,
    inputs: [{ at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] }]
  }
  const run = createRun(config)
  const frames: RunStructuralFrame[] = []
  let secondListenerCount = 0
  run.subscribeStructural((frame) => {
    frames.push(frame)
    expect(Reflect.set(frame, "time", 999)).toBe(false)
    expect(Reflect.set(frame.scheduled.input, "at", 999)).toBe(false)
    expect(Reflect.set(frame.before.queue, "length", 0)).toBe(false)
    expect(Reflect.set(frame.after.queue, "length", 0)).toBe(false)
  })
  run.subscribeStructural((frame) => {
    expect(frame).toBe(frames.at(-1))
    expect(frame.time).not.toBe(999)
    secondListenerCount++
  })
  run.advance({ untilTime: 7, maxEvents: 200 })
  expect(frames.length).toBeGreaterThan(0)
  const retained = frames.slice()
  const values = structuredClone(retained)
  run.applyControl({
    kind: "jevProfile",
    delayMs: 9,
    outcomeWeights: { neverSent: 0, finding: 1, clear: 0, backendFailure: 0, timeout: 0, interrupted: 0 }
  })
  run.schedule({ at: 40, kind: "edit", bytes: 12, unitBytes: [6] })
  run.advance({ untilTime: 49, maxEvents: 200 })
  expect(retained).toEqual(values)
  expect(secondListenerCount).toBe(frames.length)
  expect(restoreReplay(run.exportReplay()).runtimeSnapshot()).toEqual(run.runtimeSnapshot())
})
