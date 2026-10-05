import { expect, it } from "vitest"
import { createRun, restoreReplay, type Replay, type Run, type RunConfig } from "./index.ts"

const roundtrip = (run: Run) => {
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.queuedFacts).toEqual(run.queuedFacts)
  expect(restored.runtimeSnapshot()).toEqual(run.runtimeSnapshot())
  expect(restored.exportReplay()).toEqual(run.exportReplay())
  return restored
}
const noticeConfig: RunConfig = {
  sessions: [{ agent: "first" }, { agent: "second" }],
  expiryProfile: { pendingMs: 100, leaseMs: 2, cooldownMs: 20 },
  inputs: [
    { at: 2, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } },
    { at: 3, kind: "canonical", event: { kind: "noticeLease", key: 101, leased: false } },
    { at: 4, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } },
    { at: 23, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } }
  ]
}

it("restores the original Notice startup after suspension consumes metadata at time zero", () => {
  const run = createRun(noticeConfig)
  run.applyControl({ kind: "suspendArrivals", suspended: true })
  const before = run.exportReplay()
  const queued = run.queuedFacts
  run.advance({ untilTime: 0, maxEvents: 100 })
  expect(run.eventCount).toBe(before.endpoint.eventCount)
  expect(run.now).toBe(before.endpoint.now)
  expect(run.queuedFacts).not.toEqual(queued)
  expect(run.exportReplay().endpoint.queueTakes).toBeGreaterThan(before.endpoint.queueTakes)
  roundtrip(run)
})

it("keeps controls and scheduled inputs on both sides of metadata consumption", () => {
  const run = createRun(noticeConfig)
  run.applyControl({ kind: "suspendArrivals", suspended: true })
  run.schedule({ at: 30, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } })
  const before = run.exportReplay()
  run.advance({ untilTime: 0, maxEvents: 100 })
  run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 200, leaseMs: 3, cooldownMs: 30 } })
  run.schedule({ at: 31, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } })
  const after = run.exportReplay()
  expect(after.controls[1]?.sequence).toBe(2) // Normalization does not renumber public actions.
  expect(after.controls[1]?.queueTakes).toBeGreaterThan(before.controls[0]!.queueTakes)
  expect(after.scheduledInputs[1]?.queueTakes).toBe(after.controls[1]?.queueTakes)
  roundtrip(run)
})

it("records every normalization timestamp and finite same-coordinate invocation", () => {
  const run = createRun({
    inputs: [0, 50, 100].map((at) => ({
      at,
      kind: "canonical" as const,
      event: { kind: "collectionExpiryCheck" as const, elapsed: 0, lifetime: 1 }
    }))
  })
  run.advance({ untilTime: 0, maxEvents: 100 })
  run.advance({ untilTime: 0, maxEvents: 0 })
  run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 100, leaseMs: 2, cooldownMs: 20 } })
  run.advance({ untilTime: 50, maxEvents: 100 })
  run.advance({ untilTime: 100, maxEvents: 100 })
  expect(run.exportReplay().normalizations.map((record) => record.time)).toEqual([0, 0, 50, 100])
  expect(run.exportReplay().normalizations.map((record) => record.checkpointSequence)).toEqual([0, 1, 3, 4])
  roundtrip(run)
})

it("distinguishes an ordinary listener endpoint from later advance cleanup", () => {
  const run = createRun({
    inputs: [{ at: 0, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } }]
  })
  let captured: Replay | undefined
  let snapshot: ReturnType<Run["runtimeSnapshot"]> | undefined
  run.subscribe(() => {
    run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 100, leaseMs: 2, cooldownMs: 20 } })
    run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 200, leaseMs: 3, cooldownMs: 30 } })
    captured = run.exportReplay()
    snapshot = run.runtimeSnapshot()
  })
  run.advance({ untilTime: 0, maxEvents: 1 })
  expect(captured).toBeDefined()
  expect(captured!.normalizations).toEqual([])
  expect(run.exportReplay().normalizations).toHaveLength(1)
  expect(restoreReplay(captured!).runtimeSnapshot()).toEqual(snapshot)
  roundtrip(run)
})

it("restores a no-take Sharing observation and its listener controls before the pending tail", () => {
  const run = createRun({
    preparationDelay: 2,
    jevDelay: 30,
    outcome: "finding",
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], evaluationInputs: ["same"] }],
    lifecycles: { reuse: { entryLimit: 8, byteLimit: 1 } }
  })
  let captured: Replay | undefined
  let snapshot: ReturnType<Run["runtimeSnapshot"]> | undefined
  let takeBefore = 0
  run.subscribe((frame) => {
    if (frame.event.kind !== "reuseRoute") return
    expect(run.exportReplay().endpoint.queueTakes).toBe(takeBefore)
    run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 200, leaseMs: 3, cooldownMs: 30 } })
    captured = run.exportReplay()
    snapshot = run.runtimeSnapshot()
  })
  for (let steps = 0; !captured && steps < 1000; steps++) {
    takeBefore = run.exportReplay().endpoint.queueTakes
    run.step(2)
  }
  expect(captured).toBeDefined()
  const restored = restoreReplay(captured!)
  expect(restored.runtimeSnapshot()).toEqual(snapshot)
  run.advance({ untilTime: 40, maxEvents: 1000 })
  restored.advance({ untilTime: 40, maxEvents: 1000 })
  expect(restored.runtimeSnapshot()).toEqual(run.runtimeSnapshot())
  expect(restored.observe()).toEqual(run.observe())
})

it("restores queue-only progress after an inactive preparation fact", () => {
  const run = createRun({
    seed: 7,
    preparationDelay: 100,
    jevDelay: 20,
    outcome: "finding",
    sessions: [
      {
        agent: "a",
        seed: 7,
        editIntervalMs: 1_000_000,
        variationMs: 0,
        editsPerTask: 1,
        taskPauseMs: 1_000_000,
        bytes: 10,
        unitBytes: [5]
      }
    ],
    inputs: [
      {
        at: 0,
        kind: "edit",
        agent: "a",
        generation: 0,
        recurring: false,
        revision: 1,
        bytes: 10,
        unitBytes: [5],
        outcome: "finding"
      }
    ],
    fileTrees: {
      minFiles: 1,
      maxFiles: 1,
      maxImports: 0,
      maxDepth: 1,
      deniedPercent: 0,
      missingPercent: 0,
      unreadablePercent: 0,
      repeatedEdgePercent: 0,
      cyclicEdgePercent: 0,
      unsupportedPercent: 0,
      deadlineStep: 0,
      localWork: 0,
      minSourceBytes: 4,
      maxSourceBytes: 4,
      minTreeBytes: 3,
      maxTreeBytes: 3
    }
  })
  expect(run.advance({ maxEvents: 5 }).reason).toBe("eventLimit")
  expect(run.observations.at(-1)?.commands).toContainEqual(expect.objectContaining({ kind: "prepare" }))
  expect(run.queuedFacts[0]?.input.kind).toBe("preparationGraph")
  const activeReplay = run.exportReplay()
  expect(restoreReplay(JSON.parse(JSON.stringify(activeReplay))).exportReplay()).toEqual(activeReplay)
  run.applyControl({ kind: "adviceeLifecycle", agent: "a", action: "disconnect" })
  run.advance({ untilTime: 0, maxEvents: 100 })
  expect(run.observations.filter((frame) => frame.event.kind === "preparationGraph")).toHaveLength(1)
  run.advance({ untilTime: 50, maxEvents: 100 })
  const replay = run.exportReplay()
  expect(replay.endpoint).toEqual({ eventCount: 9, queueTakes: 13, now: 50 })
  const restored = restoreReplay(JSON.parse(JSON.stringify(replay)))
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.queuedFacts).toEqual(run.queuedFacts)
  expect(restored.runtimeSnapshot()).toEqual(run.runtimeSnapshot())
  expect(restored.exportReplay()).toEqual(replay)
})

it("rejects missing or impossible in-place replay progress instead of inventing queue progress", () => {
  const run = createRun({ inputs: [] })
  run.advance({ maxEvents: 0 })
  const replay = run.exportReplay()
  const missing = JSON.parse(JSON.stringify(replay))
  delete missing.endpoint.queueTakes
  expect(() => restoreReplay(missing)).toThrow()
  expect(() => restoreReplay({ ...replay, endpoint: { ...replay.endpoint, queueTakes: 1 } })).toThrow()
  expect(() =>
    restoreReplay({ ...replay, normalizations: [{ ...replay.normalizations[0]!, checkpointSequence: 1 }] })
  ).toThrow()
  expect(() => restoreReplay({ ...replay, endpoint: { ...replay.endpoint, queueTakes: 2 ** 48 } })).toThrow()
})
