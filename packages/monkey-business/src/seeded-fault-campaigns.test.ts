import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Run, type RunConfig } from "./index.ts"

// Directed finite campaigns, not a runtime checker. Fixed tree bounds make the
// intermediate charge/timing oracle independent of the sampled tree topology.
const agents = ["faulty/runtime:7", "healthy/runtime:2"] as const
const seeds = [7, 91001, 4294967313] as const
const configuration = (seed: number): RunConfig => ({
  seed,
  inputs: [],
  jevDelay: 5,
  preparationDelay: 2,
  retention: 10000,
  outcome: "clear",
  sessions: agents.map((agent, index) => ({
    agent,
    seed: index + 11,
    editIntervalMs: 1000000,
    variationMs: 0,
    editsPerTask: 1000,
    bytes: 10,
    unitBytes: [5]
  })),
  fileTrees: {
    ...DEFAULT_FILE_TREE_PROFILE,
    minFiles: 1,
    maxFiles: 1,
    maxImports: 0,
    minSourceBytes: 100,
    maxSourceBytes: 100,
    minTreeBytes: 20,
    maxTreeBytes: 20
  }
})
function edit(run: Run, agent: string, at: number, outcome: "clear" | "backendFailure" | "finding") {
  run.schedule({ kind: "edit", at, agent, bytes: 10, unitBytes: [5], outcome })
}
function advance(run: Run, horizon: number, budget: number) {
  const result = run.advance({ untilTime: horizon, maxEvents: budget })
  // Neither an empty queue nor exhausting fuel certifies the obligations below.
  expect(result.reason, `campaign budget ${budget} exhausted`).not.toBe("eventLimit")
}
function reproduce(run: Run): Run {
  const replay = JSON.parse(JSON.stringify(run.exportReplay()))
  const restored = restoreReplay(replay)
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.exportReplay()).toEqual(replay)
  return restored
}
function noPhysicalWork(run: Run) {
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.collection.leases).toEqual([])
}

it.each(seeds)("seed %i drains suspended finite faults and heals on the same resident", (seed) => {
  const run = createRun(configuration(seed))
  edit(run, agents[0], 0, "backendFailure")
  edit(run, agents[1], 0, "clear")
  advance(run, 3, 64)
  // PRE2 issues and starts both original requests before Jev5 completes.
  expect(run.projection.dispatch.requests).toHaveLength(2)
  expect(run.projection.global).toEqual({ items: 2, bytes: 10 })
  run.applyControl({ kind: "suspendArrivals", suspended: true })
  const restored = reproduce(run)
  for (const candidate of [run, restored]) advance(candidate, 10, 128)
  expect(restored.observe()).toEqual(run.observe())
  expect(
    run.observations
      .filter((frame) => frame.event.kind === "jevRequestSettled")
      .map((frame) => [frame.time, frame.partition, frame.event.kind === "jevRequestSettled" && frame.event.outcome])
  ).toEqual([
    [7, 1, "backendFailure"],
    [7, 2, "clear"]
  ])
  noPhysicalWork(run)
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  // Healing changes future work; it neither resets nor forgives old ownership.
  run.applyControl({ kind: "jevProfile", delayMs: 5, outcome: "finding" })
  run.applyControl({ kind: "suspendArrivals", agent: agents[0], suspended: false })
  edit(run, agents[0], 20, "finding")
  advance(run, 30, 192)
  expect(
    run.observations
      .filter((frame) => frame.event.kind === "submissionTerminal")
      .map((frame) => [frame.time, frame.partition])
  ).toEqual([[27, 1]])
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  noPhysicalWork(run)
  expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
  reproduce(run)
})

it.each(seeds)("seed %i progresses fresh healthy work while a peer stays faulty", (seed) => {
  const run = createRun(configuration(seed))
  for (const at of [0, 20, 40]) {
    edit(run, agents[0], at, "backendFailure")
    edit(run, agents[1], at, "clear")
  }
  advance(run, 30, 256)
  const restored = reproduce(run)
  for (const candidate of [run, restored]) advance(candidate, 50, 192)
  expect(restored.observe()).toEqual(run.observe())
  const settlements = run.observations.filter((frame) => frame.event.kind === "jevRequestSettled")
  for (const partition of [1, 2]) {
    expect(settlements.filter((frame) => frame.partition === partition).map((frame) => frame.time)).toEqual([7, 27, 47])
    expect(
      settlements
        .filter((frame) => frame.partition === partition)
        .map((frame) => frame.event.kind === "jevRequestSettled" && frame.event.outcome)
    ).toEqual(Array(3).fill(partition === 1 ? "backendFailure" : "clear"))
  }
  expect(Math.max(...run.observations.map((frame) => frame.after.dispatch.requests.length))).toBe(2)
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  noPhysicalWork(run)
  expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
  reproduce(run)
})

it.each(seeds)("seed %i refuses unavailable credentials then recovers without reset", (seed) => {
  const run = createRun(configuration(seed))
  run.applyControl({ kind: "credentials", action: "unavailable" })
  edit(run, agents[0], 0, "finding")
  advance(run, 10, 128)
  expect(
    run.observations.flatMap((frame) => frame.outputs).filter((command) => command.kind === "jevRequestUnavailable")
  ).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toEqual([])
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  noPhysicalWork(run)
  reproduce(run)
  run.applyControl({ kind: "credentials", action: "restore" })
  edit(run, agents[1], 20, "finding")
  advance(run, 30, 192)
  expect(
    run.observations
      .filter((frame) => frame.event.kind === "submissionTerminal")
      .map((frame) => [frame.time, frame.partition])
  ).toEqual([[27, 2]])
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  expect(run.interventions.map((report) => report.result)).toEqual(["applied", "applied"])
  noPhysicalWork(run)
  reproduce(run)
})
