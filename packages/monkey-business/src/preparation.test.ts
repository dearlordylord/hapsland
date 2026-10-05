import { describe, expect, it } from "vitest"
import { createRun, restoreReplay, PreparationReplay, preparationExample, DEFAULT_FILE_TREE_PROFILE } from "./index.ts"

describe("preparation within the operation timeline", () => {
  it("reuses the branching-budget example with checked exclusions and exact tree saturation", () => {
    const graph = new PreparationReplay()
    const scope = {
      kind: "preparationGraph" as const,
      example: "branchingTreeBudget" as const,
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 5,
      unit: 0
    }
    const frames = preparationExample(scope.example).steps.map(({ event: fact }, step) =>
      graph.step({ ...scope, step, fact })
    )
    const terminal = frames.at(-1)!
    expect(terminal.command).toEqual({ kind: "unitIncomplete", reason: "TreeLimit" })
    expect(terminal.after).toMatchObject({
      files: 7,
      readBytes: 7000,
      treeBytes: 20480,
      skippedTree: true,
      skippedExcluded: true
    })
    expect(
      frames
        .filter((frame) => frame.command.kind === "readSource")
        .map((frame) => (frame.command.kind === "readSource" ? frame.command.target : 0))
    ).toEqual([2, 3, 4, 5, 6, 7])
    expect(frames.filter((frame) => frame.command.kind === "skipImport").map((frame) => frame.command)).toEqual([
      { kind: "skipImport", target: 8, reason: "Excluded" },
      { kind: "skipImport", target: 5, reason: "TreeLimit" },
      { kind: "skipImport", target: 7, reason: "TreeLimit" }
    ])
  })

  it("keeps canonical work and capacity while each artifact runs its own graph", () => {
    const run = createRun({
      fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 2, maxFiles: 2, deniedPercent: 0 },
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5, 7] }],
      outcome: "clear"
    })
    run.advance()
    const inner = run.observations.filter((frame) => frame.event.kind === "preparationGraph")
    expect(inner).toHaveLength(12)
    for (const frame of inner) {
      expect(frame.after).toEqual(frame.before)
      expect(frame.event.kind).toBe("preparationGraph")
      if (frame.event.kind !== "preparationGraph") continue
      const operation = frame.event.operation
      expect(frame.after.work.some((work) => work.kind === "preparing" && work.operation === operation)).toBe(true)
      expect(frame.commands).toEqual([])
    }
    expect(inner.map((frame) => frame.preparation?.command.kind)).toEqual([
      "none",
      "resolveEdge",
      "checkPath",
      "readSource",
      "none",
      "unitComplete",
      "none",
      "resolveEdge",
      "checkPath",
      "readSource",
      "none",
      "unitComplete"
    ])
    const completion = run.observations.find((frame) => frame.event.kind === "preparationCompleted")
    expect(completion?.sequence).toBeGreaterThan(inner.at(-1)!.sequence)
    expect(
      completion?.commands.filter((command) => command.kind === "unitAdmitted").map((command) => command.bytes)
    ).toEqual([5, 7])
  })

  it("restores an endpoint in the middle of capture and resumes the same checked trace", () => {
    const run = createRun({ inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }] })
    while (!run.observations.some((frame) => frame.preparation?.command.kind === "readSource")) run.step()
    const restored = restoreReplay(run.exportReplay())
    expect(restored.observations).toEqual(run.observations)
    run.advance()
    restored.advance()
    expect(restored.observations).toEqual(run.observations)
  })

  it("keeps denied paths as checked omissions and refuses out-of-order graph facts", () => {
    const graph = new PreparationReplay()
    const scope = {
      kind: "preparationGraph" as const,
      example: "simple" as const,
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 3,
      unit: 0
    }
    graph.step({ ...scope, step: 0, fact: { kind: "root", target: 1, sourceBytes: 1000, treeBytes: 400, edges: [10] } })
    graph.step({ ...scope, step: 1, fact: { kind: "next" } })
    graph.step({ ...scope, step: 2, fact: { kind: "resolved", target: 2, result: "found" } })
    const denied = graph.step({ ...scope, step: 3, fact: { kind: "pathChecked", allowed: false } })
    expect(denied.command).toEqual({ kind: "skipImport", target: 2, reason: "Excluded" })
    expect(denied.after.files).toBe(1)
    expect(() => graph.step({ ...scope, step: 5, fact: { kind: "next" } })).toThrow("out of order")
    const terminal = graph.step({ ...scope, step: 4, fact: { kind: "next" } })
    expect(terminal.command).toEqual({ kind: "unitIncomplete", reason: "Excluded" })
  })
})
