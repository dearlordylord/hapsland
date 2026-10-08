import { expect, it } from "vitest"
import { createRun } from "./index.ts"
import { ResourceScenarios, demoResourceLimits } from "./resource-scenarios.ts"

const exercise = (config: ConstructorParameters<typeof ResourceScenarios>[0]) => {
  const run = createRun({
    inputs: [],
    resourceScenarios: config ?? {},
    limits: { globalItems: 512, globalBytes: 1048576, partitionItems: 16, partitionBytes: 65536 }
  })
  run.advance({ untilTime: 180010, maxEvents: 1000 })
  expect(run.observations.flatMap((frame) => (frame.rejection ? [frame.rejection] : []))).toEqual([])
  return run.observations
}
it("accumulates suppressed failures, preserves leased notice, bounds keys and frees storage for recovery", () => {
  const frames = exercise({ notices: true, noticeMaximumKeys: 1 })
  const suppressed = frames.find((f) => f.outputs.some((c) => c.kind === "noticeSuppressed"))!
  expect(suppressed.after.notices[0]!.suppressed).toBe(1)
  const merged = frames.find((f) => f.outputs.some((c) => c.kind === "noticePendingMerged"))!
  expect(merged.after.notices[0]!.pending!.count).toBe(1)
  const leased = frames.find((f) => f.outputs.some((c) => c.kind === "noticeLeaseKept"))!
  expect(leased.after.notices[0]!.pending!.leased).toBe(true)
  expect(frames.flatMap((f) => f.outputs)).toContainEqual({ category: "decision", kind: "noticeRejectedFull" })
  expect(frames.filter((f) => f.outputs.some((c) => c.kind === "noticeCommitted"))).toHaveLength(2)
  expect(frames.at(-1)!.after.notices).toEqual([])
  expect(frames.at(-1)!.after.global.bytes).toBe(0)
})
it("checks the explicit encoded-byte boundary and oversized candidate through Bend", () => {
  const frames = exercise({ outputFit: true })
  expect(frames[0]!.outputs).not.toEqual(frames[2]!.outputs)
  expect(frames[0]!.after).toEqual(frames[2]!.after)
  expect(frames[0]!.event).toEqual({ kind: "collectionFitCheck", items: 1, bytes: 10240 })
})

it("replays optional exercises through one resident with exact ordered observations", async () => {
  const { createRun, replayRun } = await import("./index.ts")
  const run = createRun({ inputs: [], resourceScenarios: { notices: true, noticeMaximumKeys: 1, outputFit: true } })
  run.advance({ untilTime: 180010, maxEvents: 1000 })
  const replay = replayRun(run.exportReplay())
  replay.advance({ untilTime: 180010, maxEvents: 1000 })
  expect(replay.observations).toEqual(run.observations)
  expect(run.projection.notices).toEqual([])
  expect(run.projection.global.bytes).toBe(0)
  expect(run.observations.filter((f) => f.event.kind === "noticeCommit")).toHaveLength(2)
})

it.each([10240, 10241])("gates generated advice handoff on %i explicit synthetic encoded bytes", async (bytes) => {
  const { createRun, replayRun } = await import("./index.ts")
  const run = createRun({
    outcome: "finding",
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 20, kind: "finish" }
    ],
    resourceScenarios: { outputFit: true, outputBytes: bytes }
  })
  run.advance({ untilTime: 100, maxEvents: 1000 })
  const fits = run.observations.filter((f) => f.event.kind === "collectionFitCheck" && f.event.bytes === bytes)
  expect(fits.length).toBeGreaterThan(0)
  const handedOff = run.observations.some((f) => f.outputs.some((c) => c.kind === "submissionBegun"))
  expect(handedOff).toBe(bytes === 10240)
  if (bytes === 10241)
    expect(run.observations.some((f) => f.outputs.some((c) => c.kind === "submissionAuthorized"))).toBe(false)
  const replay = replayRun(run.exportReplay())
  replay.advance({ untilTime: 100, maxEvents: 1000 })
  expect(replay.observations).toEqual(run.observations)
})

it("sizes shared demo cache and notice maxima without scaling fixture event counts", () => {
  expect(demoResourceLimits(1)).toEqual({ entryLimit: 4, byteLimit: 32768, noticeMaximumKeys: 8 })
  expect(demoResourceLimits(3)).toEqual({ entryLimit: 6, byteLimit: 49152, noticeMaximumKeys: 24 })
  expect(demoResourceLimits(64)).toEqual({ entryLimit: 8, byteLimit: 65536, noticeMaximumKeys: 64 })
  expect(new ResourceScenarios({ notices: true, noticeMaximumKeys: 64 }).inputs()).toHaveLength(
    new ResourceScenarios({ notices: true, noticeMaximumKeys: 1 }).inputs().length
  )
})
it("records scaled notice maxima and preserves explicit overrides in exact replay", async () => {
  const { createRun, replayRun } = await import("./index.ts")
  for (const override of [undefined, 1]) {
    const run = createRun({
      sessions: [{ agent: "a" }, { agent: "b" }, { agent: "c" }],
      resourceScenarios: { notices: true, ...(override === undefined ? {} : { noticeMaximumKeys: override }) }
    })
    expect(run.capacityMetadata.notices?.maximumKeys).toBe(override ?? 24)
    run.advance({ untilTime: 5, maxEvents: 500 })
    const replay = replayRun(run.exportReplay())
    replay.advance({ untilTime: 5, maxEvents: 500 })
    expect(replay.observations).toEqual(run.observations)
  }
})
