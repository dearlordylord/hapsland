import { describe, expect, it } from "vitest"
import { createRun, replayRun, restoreReplay } from "./index.ts"
describe("scripted public run", () => {
  it("follows a synthetic edit through checked Jev finding and advice submission", () => {
    const run = createRun({ outcome: "finding" })
    run.advance({ maxEvents: 100 })
    const outputs = run.observations.flatMap((x) => x.outputs.map((c) => c.kind))
    expect(outputs).toContain("prepare")
    expect(outputs).toContain("jevRequestIssued")
    expect(outputs).toContain("findingRetained")
    expect(outputs).toContain("submissionRecorded")
    expect(run.observations.some((x) => x.event.kind === "stopPolled")).toBe(true)
    expect(run.observations.filter((x) => x.rejection)).toEqual([])
  })
})

describe("deterministic driver and replay", () => {
  it("a driver bound preserves unfinished work without an agent finish attempt", () => {
    const run = createRun({ inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }] })
    expect(run.advance({ maxEvents: 5 }).reason).toBe("eventLimit")
    expect(run.projection.work.some((work) => work.kind === "preparing")).toBe(true)
    expect(run.observations.some((x) => x.event.kind === "stopPolled")).toBe(false)
    expect(run.advance({ maxEvents: 100 }).reason).toBe("idle")
    expect(run.projection.rounds).toHaveLength(1)
  })
  it("single stepping equals batched advancement including replayed delay controls", () => {
    const config = {
      inputs: [
        { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] },
        { at: 30, kind: "edit" as const, bytes: 10, unitBytes: [5] }
      ]
    }
    const run = createRun(config)
    while (!run.observations.some((frame) => frame.outputs.some((command) => command.kind === "jevRequestIssued")))
      run.step()
    run.applyControl({ kind: "jevProfile", delayMs: 12, outcome: "clear" })
    run.advance()
    const replay = replayRun(run.exportReplay())
    while (replay.step());
    expect(replay.observations).toEqual(run.observations)
    const settled = run.observations.filter((x) => x.event.kind === "jevRequestSettled")
    expect(settled.map((x) => x.time)).toEqual([7, 44])
  })
  it("streams independently of retention and refuses incompatible identities", () => {
    const run = createRun({ retention: 0 })
    let count = 0
    run.subscribe(() => count++)
    run.advance()
    expect(count).toBeGreaterThan(10)
    expect(run.observations).toEqual([])
    const replay = replayRun({ ...run.exportReplay(), config: { ...run.exportReplay().config, retention: 100 } })
    replay.advance()
    expect(replay.observations).toHaveLength(count)
    expect(() => replayRun({ ...run.exportReplay(), logicIdentity: "different" as never })).toThrow(
      "incompatible replay identity"
    )
  })
  it("reports mismatched callback identities and missing required synthetic effects", () => {
    const wrong = createRun({
      inputs: [
        {
          at: 0,
          kind: "canonical",
          event: {
            kind: "jevRequestSettled",
            partition: 1,
            lifetime: 1,
            round: 1,
            operation: 1,
            request: 99,
            outcome: "clear",
            currentWork: true
          }
        }
      ]
    })
    expect(() => wrong.step()).toThrow("mismatched completion identity")
    const unhandled = createRun({
      inputs: [
        { at: 0, kind: "canonical", event: { kind: "openRound", partition: 1, lifetime: 1 } },
        {
          at: 1,
          kind: "canonical",
          event: { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 10 }
        }
      ]
    })
    expect(() => unhandled.advance()).toThrow("unhandled required command")
  })
})

it("time advancement never crosses a workload metadata boundary", () => {
  const run = createRun({ session: { editIntervalMs: 100, variationMs: 0 }, inputs: [] })
  expect(run.advance({ untilTime: 50, maxEvents: 100 }).reason).toBe("timeLimit")
  expect(run.observations).toEqual([])
  expect(run.now).toBe(0)
  run.advance({ untilTime: 100, maxEvents: 100 })
  expect(run.observations.filter((frame) => frame.event.kind !== "preparationGraph").map((x) => x.time)).toEqual([
    100, 100, 100, 100, 100
  ])
  expect(run.observations.every((frame) => frame.time === 100)).toBe(true)
})
it("ordinary capacity refusals remain observable successful transitions", () => {
  const run = createRun({
    limits: { globalItems: 1, partitionItems: 1, globalBytes: 10, partitionBytes: 10 },
    inputs: [{ at: 0, kind: "edit", bytes: 11, unitBytes: [1] }]
  })
  expect(run.advance().reason).toBe("idle")
  expect(run.observations.flatMap((x) => x.outputs.map((c) => c.kind))).toContain("preparationRefused")
  expect(run.observations.filter((x) => x.rejection)).toEqual([])
})

it("waits for checked finish allowance before generating a later task", () => {
  const run = createRun({
    outcome: "finding",
    session: { editIntervalMs: 10, variationMs: 0, editsPerTask: 1, taskPauseMs: 1 },
    jevDelay: 100,
    finishDeadline: 500
  })
  run.advance({ untilTime: 50, maxEvents: 100 })
  expect(run.observations.flatMap((x) => x.outputs.map((c) => c.kind))).toContain("waitForWork")
  expect(run.observations.filter((x) => x.event.kind === "beginObservedPreparation")).toHaveLength(1)
  run.advance({ untilTime: 140, maxEvents: 100 })
  const outputs = run.observations.flatMap((x) => x.outputs.map((c) => c.kind))
  expect(outputs).toContain("finishReserved")
  expect(outputs).toContain("finishAuthorized")
  expect(outputs).toContain("finishRecorded")
  expect(outputs).toContain("roundContinuationAvailable")
  expect(outputs).toContain("finishEnded")
  expect(run.observations.filter((x) => x.rejection)).toEqual([])
  expect(run.observations.filter((x) => x.event.kind === "beginObservedPreparation").length).toBeGreaterThan(1)
})
it("ends an allowed finish and opens a fresh round for later generated work", () => {
  const run = createRun({
    session: { editIntervalMs: 10, variationMs: 0, editsPerTask: 1, taskPauseMs: 1 },
    outcome: "clear"
  })
  run.advance({ untilTime: 45, maxEvents: 100 })
  const outputs = run.observations.flatMap((x) => x.outputs.map((c) => c.kind))
  expect(outputs).toContain("finishAllowedNoAdvice")
  expect(run.observations.filter((x) => x.event.kind === "openRound")).toHaveLength(2)
  expect(run.observations.filter((x) => x.rejection)).toEqual([])
})
it("preserves global ordering between controls and explicit scheduled inputs in replay", () => {
  const run = createRun({ session: { bytes: 100 } })
  run.applyControl({ kind: "burst", count: 1 })
  run.schedule({ at: 0, kind: "edit", bytes: 9, unitBytes: [9] })
  run.advance({ maxEvents: 20 })
  const replay = replayRun(run.exportReplay())
  replay.advance({ maxEvents: 20 })
  expect(replay.observations).toEqual(run.observations)
})
it("a virtual finish deadline cancels unfinished requests and permits later work", () => {
  const run = createRun({
    session: { editIntervalMs: 10, variationMs: 0, editsPerTask: 1, taskPauseMs: 1 },
    jevDelay: 1000,
    finishDeadline: 5
  })
  run.advance({ untilTime: 60, maxEvents: 100 })
  const outputs = run.observations.flatMap((x) => x.outputs.map((c) => c.kind))
  expect(outputs).toContain("cancelWork")
  expect(outputs).toContain("finishAllowedDeadline")
  expect(run.observations.filter((x) => x.event.kind === "openRound")).toHaveLength(2)
  expect(run.observations.filter((x) => x.rejection)).toEqual([])
})
it("uses checked continuation exhaustion to allow finish instead of inventing another continuation", () => {
  const run = createRun({
    outcome: "finding",
    session: { editIntervalMs: 10, variationMs: 0, editsPerTask: 1, taskPauseMs: 1, adviceResponse: "promptRepair" },
    jevDelay: 30,
    finishDeadline: 100
  })
  run.advance({ untilTime: 300, maxEvents: 1000 })
  expect(run.observations.flatMap((frame) => frame.outputs.map((command) => command.kind))).toContain(
    "roundContinuationExhausted"
  )
  expect(run.observations.flatMap((frame) => frame.outputs.map((command) => command.kind))).not.toContain(
    "continuationRefused"
  )
  expect(run.observations.filter((frame) => frame.event.kind === "openRound").length).toBeGreaterThan(1)
})

it("restores controls applied after metadata-only clock advancement at the viewing endpoint", () => {
  const run = createRun({ session: { editIntervalMs: 10, variationMs: 0 }, outcome: "clear" })
  run.advance({ untilTime: 10 })
  run.applyControl({ kind: "suspendArrivals", suspended: true })
  run.advance({ untilTime: 100 })
  run.applyControl({ kind: "suspendArrivals", suspended: false })
  const exported = run.exportReplay()
  expect(exported.endpoint.now).toBe(20)
  expect(run.observations.filter((frame) => frame.event.kind !== "preparationGraph")).toHaveLength(14)
  const restored = restoreReplay(exported)
  expect(restored.observations).toEqual(run.observations)
  expect(restored.now).toBe(20)
  expect(restored.exportReplay().controls).toEqual(exported.controls)
  run.advance({ untilTime: 60 })
  restored.advance({ untilTime: 60 })
  expect(restored.observations).toEqual(run.observations)
})
