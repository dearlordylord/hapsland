import { describe, expect, test } from "vitest"
import { createRun, restoreReplay } from "./index.ts"

describe("applied settings snapshots", () => {
  test("keeps inspection settings stable while execution and scheduled inputs advance", () => {
    const run = createRun({ session: { agent: "writer", editIntervalMs: 100 } })
    const settings = run.appliedSettings
    const before = run.exportReplay()
    run.schedule({ kind: "edit", at: 1, bytes: 10, unitBytes: [10] })
    run.advance({ untilTime: 10, maxEvents: 10 })
    expect(run.eventCount).toBeGreaterThan(before.endpoint.eventCount)
    expect(run.exportReplay().scheduledInputs.length).toBeGreaterThan(before.scheduledInputs.length)
    expect(run.appliedSettings).toBe(settings)
    expect(settings.controls).toEqual([])
  })

  test("isolates deeply frozen snapshots from configuration, controls and exported copies", () => {
    const config = { session: { agent: "writer", bytes: 100, unitBytes: [100] } }
    const run = createRun(config)
    const initial = run.appliedSettings
    config.session.unitBytes[0] = 999
    expect(initial.config.session?.unitBytes).toEqual([100])

    const control = { kind: "sizes" as const, agent: "writer", reservationBytes: 200, reviewUnitBytes: [100, 100] }
    const record = run.applyControl(control)
    const settings = run.appliedSettings
    expect(settings).not.toBe(initial)
    expect(initial.controls).toEqual([])
    expect(settings.controls).toEqual([record])
    control.reviewUnitBytes[0] = 999
    const recorded = record.control
    if (recorded.kind !== "sizes") throw new Error("expected sizes control")
    Reflect.set(recorded.reviewUnitBytes, "0", 888)
    const exported = run.exportReplay()
    const exportedControl = exported.controls[0]!.control
    if (exportedControl.kind !== "sizes") throw new Error("expected exported sizes control")
    Reflect.set(exportedControl.reviewUnitBytes, "0", 777)
    const captured = settings.controls[0]!.control
    if (captured.kind !== "sizes") throw new Error("expected captured sizes control")
    expect(captured.reviewUnitBytes).toEqual([100, 100])
    expect(run.exportReplay().controls[0]!.control).toEqual(captured)
    expect(Object.isFrozen(settings)).toBe(true)
    expect(Object.isFrozen(settings.config.session?.unitBytes)).toBe(true)
    expect(Object.isFrozen(settings.controls)).toBe(true)
    expect(Object.isFrozen(captured.reviewUnitBytes)).toBe(true)
    expect(Reflect.set(captured.reviewUnitBytes, "0", 666)).toBe(false)
    expect(run.appliedSettings).toBe(settings)
  })

  test("preserves the snapshot after rejected controls and reconstructs recorded settings", () => {
    const run = createRun({ session: { agent: "writer" } })
    run.applyControl({ kind: "editPace", agent: "writer", intervalMs: 50 })
    run.advance({ untilTime: 10, maxEvents: 10 })
    run.applyControl({ kind: "suspendArrivals", agent: "writer", suspended: true })
    const settings = run.appliedSettings
    expect(() => run.applyControl({ kind: "editPace", intervalMs: 0 })).toThrow()
    expect(run.appliedSettings).toBe(settings)
    const restored = restoreReplay(run.exportReplay())
    expect(restored.appliedSettings).toEqual(settings)
    expect(restored.appliedSettings).not.toBe(settings)
    expect(restored.appliedSettings.controls).toHaveLength(2)
  })
})
