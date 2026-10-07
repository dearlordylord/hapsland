import { describe, expect, it } from "vitest"
import { runSizeGraph, sizePreparationInput, validateSizeFacts, createRun, replayRun } from "./index.ts"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-adapter"

describe("source-free checked size graph runs", () => {
  it("distinguishes tree bytes and never reads an excluded path", () => {
    const overflow = runSizeGraph({
      limits: { ...GRAPH_LIMIT_CEILINGS, treeBytes: 10 },
      events: [{ kind: "root", target: 1, sourceBytes: 1, treeBytes: 11, edges: [] }]
    })
    expect(overflow.frames[0]?.after.reason).toBe("TreeLimit")
    const exact = runSizeGraph({
      limits: { ...GRAPH_LIMIT_CEILINGS, treeBytes: 10 },
      events: [{ kind: "root", target: 1, sourceBytes: 1, treeBytes: 10, edges: [] }, { kind: "next" }]
    })
    expect(exact.frames.at(-1)?.after.phase).toBe("complete")
    const denied = runSizeGraph({
      events: [
        { kind: "root", target: 1, sourceBytes: 1, treeBytes: 1, edges: [10] },
        { kind: "next" },
        { kind: "resolved", target: 2, result: "found" },
        { kind: "pathChecked", allowed: false },
        { kind: "next" }
      ]
    })
    expect(denied.frames.map((frame) => frame.command.kind)).toEqual([
      "none",
      "resolveEdge",
      "checkPath",
      "skipImport",
      "unitIncomplete"
    ])
    expect(denied.frames.at(-1)?.after.reason).toBe("Excluded")
    expect(denied.frames.at(-1)?.after.files).toBe(1)
  })
  it("preserves deadline outcomes as graph observations", () => {
    const result = runSizeGraph({
      events: [
        { kind: "root", target: 1, sourceBytes: 1, treeBytes: 1, edges: [10] },
        { kind: "next" },
        { kind: "deadlineReached" }
      ]
    })
    expect(result.frames.at(-1)?.command).toEqual({ kind: "unitIncomplete", reason: "Deadline" })
    expect(runSizeGraph(result.input)).toEqual(result)
  })
  it("distinguishes exact source limit from an over-limit source", () => {
    const run = (sourceBytes: number) =>
      runSizeGraph({
        limits: { ...GRAPH_LIMIT_CEILINGS, sourceBytes: 100, readBytes: 200 },
        events: [{ kind: "root", target: 1, sourceBytes, treeBytes: 10, edges: [] }, { kind: "next" }]
      })
    expect(run(100).frames.at(-1)?.after.phase).toBe("complete")
    expect(run(101).frames[0]?.after.reason).toBe("ReadLimit")
    expect(run(101).frames[0]?.model).toBe("import-graph")
  })
})

describe("distinct synthetic byte facts", () => {
  const facts = {
    sourceBytes: 101,
    evidenceTreeBytes: 23,
    reservationBytes: 500,
    reviewUnitBytes: [200, 350],
    encodedOutputBytes: 77
  }
  it("maps only reservation and review unit facts into preparation", () => {
    expect(sizePreparationInput(facts)).toEqual({ bytes: 500, unitBytes: [200, 350] })
    expect(validateSizeFacts(facts)).toEqual(facts)
  })
  it("rejects unsafe byte counts and oversized fan-out before use", () => {
    expect(() => validateSizeFacts({ ...facts, sourceBytes: -1 })).toThrow("sourceBytes")
    expect(() => validateSizeFacts({ ...facts, encodedOutputBytes: 0.5 })).toThrow("encodedOutputBytes")
    expect(() => validateSizeFacts({ ...facts, reviewUnitBytes: Array(1025).fill(1) })).toThrow("reviewUnitBytes")
  })
})

describe("checked size capacity through the public run", () => {
  it("admits only the review units that fit the checked byte budget", () => {
    const facts = {
      sourceBytes: 101,
      evidenceTreeBytes: 23,
      reservationBytes: 50,
      reviewUnitBytes: [60, 60, 20],
      encodedOutputBytes: 77
    }
    const run = createRun({
      limits: { globalItems: 10, partitionItems: 10, globalBytes: 100, partitionBytes: 100 },
      inputs: [{ at: 0, kind: "edit", ...sizePreparationInput(facts) }],
      jevDelay: 100
    })
    run.advance({ maxEvents: 200 })
    const commands = run.observations.flatMap((frame) => frame.commands)
    expect(commands.filter((command) => command.kind === "unitAdmitted").map((command) => command.bytes)).toEqual([
      60, 20
    ])
    expect(commands.filter((command) => command.kind === "unitRefused").map((command) => command.bytes)).toEqual([60])
  })
  it("checks explicit encoded output facts independently of reservation bytes", () => {
    const run = createRun({
      inputs: [
        { at: 0, kind: "canonical", event: { kind: "collectionFitCheck", items: 1, bytes: 1 } },
        { at: 1, kind: "canonical", event: { kind: "collectionFitCheck", items: 1, bytes: 100_000_000 } }
      ]
    })
    run.advance({ maxEvents: 10 })
    expect(run.observations.flatMap((frame) => frame.commands)).toEqual([
      { kind: "collectionFits" },
      { kind: "collectionLimited" }
    ])
  })
})

it("applies live reservation sizes only to future generated edits and replays the boundary", () => {
  const run = createRun({ session: { variationMs: 0, editIntervalMs: 10, bytes: 10, unitBytes: [5], editsPerTask: 3 } })
  run.step() // First edit is observed; the second is already queued with original facts.
  run.applyControl({ kind: "sizes", reservationBytes: 30, reviewUnitBytes: [7, 9] })
  run.advance({ maxEvents: 100, untilTime: 35 })
  const edits = run.observations.filter((frame) => frame.event.kind === "beginObservedPreparation")
  expect(edits.map((frame) => (frame.event.kind === "beginObservedPreparation" ? frame.event.bytes : -1))).toEqual([
    10, 10, 30
  ])
  const replay = replayRun(run.exportReplay())
  replay.advance({ maxEvents: run.eventCount })
  expect(replay.observations).toEqual(run.observations)
  expect(run.exportReplay().controls[0]?.control.kind).toBe("sizes")
})

it("rejects an invalid size control without recording or changing the run", () => {
  const run = createRun({ session: {} })
  expect(() => run.applyControl({ kind: "sizes", reservationBytes: -1, reviewUnitBytes: [10] })).toThrow()
  expect(run.exportReplay().controls).toEqual([])
  expect(run.eventCount).toBe(0)
})
