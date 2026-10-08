import { expect, it } from "vitest"
import { createRun, restoreReplay, type RunStructuralFrame, type Replay } from "./index.ts"
import type { CallbackTarget } from "./callback-controls.ts"

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

it("applies a physical delivery listener control before its business event and restores that checkpoint", () => {
  const run = createRun({
    outcome: "finding",
    preparationDelay: 2,
    jevDelay: 5,
    retention: 1000,
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }]
  })
  let captured: Replay | undefined
  let capturedRuntime: ReturnType<typeof run.runtimeSnapshot> | undefined
  run.subscribeStructural((frame) => {
    if (frame.kind !== "callbackDelivery" || frame.receipt.target.effect.kind !== "jevSettled") return
    expect(frame.time).toBe(7)
    expect(run.now).toBe(7)
    expect(run.observations.some((item) => item.event.kind === "jevRequestSettled")).toBe(false)
    run.applyControl({ kind: "environment", currentWork: false, credentialReady: true })
    captured = run.exportReplay()
    capturedRuntime = run.runtimeSnapshot()
  })
  run.advance({ untilTime: 8, maxEvents: 200 })
  expect(captured).toBeDefined()
  expect(captured!.controls.at(-1)?.time).toBe(7)
  expect(run.projection.pendingFindings).toEqual([])
  expect(run.observations.some((item) => item.event.kind === "submissionTerminal")).toBe(false)
  const restored = restoreReplay(captured!)
  expect(restored.runtimeSnapshot()).toEqual(capturedRuntime)
  restored.advance({ untilTime: 8, maxEvents: 200 })
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.exportReplay()).toEqual(run.exportReplay())
})

it("retains a duplicated receipt through a physical checkpoint and retention-one replay", () => {
  const run = createRun({
    retention: 1,
    preparationDelay: 2,
    jevDelay: 5,
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  let checkpoint: Replay | undefined
  let target: CallbackTarget | undefined
  const delivered: NonNullable<ReturnType<typeof run.step>>[] = []
  run.subscribe((frame) => {
    if (frame.event.kind === "jevRequestSettled") delivered.push(frame)
  })
  run.subscribeStructural((frame) => {
    if (checkpoint || frame.kind !== "callbackDelivery" || frame.receipt.target.effect.kind !== "jevSettled") return
    target = frame.receipt.target
    run.applyControl({ kind: "environment", currentWork: false, credentialReady: true })
    checkpoint = run.exportReplay()
    run.applyControl({ kind: "callback", action: "duplicate", target })
    expect(run.observe().callbackReports.at(-1)?.result).toBe("applied")
  })
  run.advance({ untilTime: 8, maxEvents: 200 })
  expect(checkpoint).toBeDefined()
  expect(target).toBeDefined()
  expect(delivered).toHaveLength(2)
  expect(delivered.map((frame) => frame.callbackReceipt?.target)).toEqual([target, target])
  expect(delivered[1]?.rejection).toBe("StaleOperation")
  expect(run.observations).toHaveLength(1)

  const restored = restoreReplay(checkpoint!)
  restored.applyControl({ kind: "callback", action: "duplicate", target: target! })
  expect(restored.observe().callbackReports.at(-1)?.result).toBe("applied")
  restored.advance({ untilTime: 8, maxEvents: 200 })
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.runtimeSnapshot()).toEqual(run.runtimeSnapshot())
  expect(restored.exportReplay()).toEqual(run.exportReplay())
})
