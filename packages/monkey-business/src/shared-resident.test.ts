import { describe, expect, it } from "vitest"
import { createRun, restoreReplay, projectAgent, DEFAULT_FILE_TREE_PROFILE } from "./index.ts"

const config = {
  seed: 7,
  sessions: [
    { agent: "alpha", seed: 11, editIntervalMs: 10, variationMs: 0, editsPerTask: 1000, bytes: 10, unitBytes: [5] },
    { agent: "beta", seed: 29, editIntervalMs: 10, variationMs: 0, editsPerTask: 1000, bytes: 10, unitBytes: [5] }
  ],
  limits: { globalItems: 128, globalBytes: 100000, partitionItems: 16, partitionBytes: 50000 },
  fileTrees: { ...DEFAULT_FILE_TREE_PROFILE, minFiles: 1, maxFiles: 1, maxImports: 0 },
  outcome: "clear" as const,
  jevDelay: 1000,
  retention: 10000
}

describe("one resident with independent agent generators", () => {
  it("applies a generator control only to its owner and restores the entire resident deterministically", () => {
    const run = createRun(config)
    run.advance({ untilTime: 80, maxEvents: 10000 })
    run.applyControl({ kind: "editPace", intervalMs: 731, agent: "alpha" })
    run.advance({ untilTime: 200, maxEvents: 10000 })
    const edits = run.observations.filter((frame) => frame.event.kind === "admitObservation" && frame.time > 80)
    expect(edits.some((frame) => frame.agent === "beta")).toBe(true)
    expect(edits.some((frame) => frame.agent === "alpha")).toBe(false)
    const replay = run.exportReplay()
    const restored = restoreReplay(replay)
    expect(restored.projection).toEqual(run.projection)
    expect(restored.observations).toEqual(run.observations)
    expect(restored.agentScopes).toEqual(run.agentScopes)
    expect(restored.exportReplay()).toEqual(replay)
    const alpha = projectAgent(run.projection, 1)
    const beta = projectAgent(run.projection, 2)
    expect(alpha.global).toEqual(beta.global)
    expect(alpha.global).toEqual(run.projection.global)
    expect(alpha.work.every((item) => item.partition === 1)).toBe(true)
    expect(beta.work.every((item) => item.partition === 2)).toBe(true)
    expect(alpha.dispatch.requests.length + beta.dispatch.requests.length).toBe(run.projection.dispatch.requests.length)
    expect(() => run.applyControl({ kind: "burst", count: 1, agent: "missing" })).toThrow("unknown agent")
    expect(() => run.applyControl({ kind: "jevProfile", delayMs: 1, agent: "alpha" })).toThrow("resident controls")
  })

  it("uses one global capacity budget instead of multiplying it by the agent count", () => {
    const run = createRun({ ...config, limits: { ...config.limits, globalItems: 4 } })
    run.advance({ untilTime: 100, maxEvents: 10000 })
    expect(
      run.observations.some((frame) =>
        frame.commands.some((command) => command.kind === "preparationRefused" || command.kind === "unitRefused")
      )
    ).toBe(true)
    expect(Math.max(...run.observations.map((frame) => frame.after.global.items))).toBeLessThanOrEqual(4)
    expect(new Set(run.observations.map((frame) => frame.partition))).toEqual(new Set([1, 2]))
  })
})
