import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE } from "./index.ts"

it("another advicee's genuine authorized output does not hold this Stop open", () => {
  const dormant = { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 }
  const run = createRun({
    seed: 7,
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    finishDeadline: 10,
    sessions: [
      { ...dormant, agent: "a" },
      { ...dormant, agent: "b" }
    ],
    outputProfile: { outcome: "certain", delayMs: 9, leaseMs: 20 },
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 1,
      maxFiles: 1,
      maxImports: 0,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    },
    inputs: [
      { at: 0, kind: "edit", agent: "a", bytes: 10, unitBytes: [5], outcome: "clear" },
      { at: 0, kind: "edit", agent: "b", bytes: 10, unitBytes: [5], outcome: "finding" },
      { at: 8, kind: "finish", agent: "a" }
    ]
  })
  run.advance({ untilTime: 7, maxEvents: 200 })
  const original = run.projection.delivery.submissions.batches
  expect(original).toHaveLength(1)
  expect(original[0]).toMatchObject({ group: 2, round: 2, surface: "background", phase: "authorized" })
  const leases = run.projection.collection.leases
  expect(leases).toHaveLength(1)
  run.advance({ untilTime: 8, maxEvents: 200 })
  const stopped = run.observations.find((frame) => frame.event.kind === "stopPolled")
  expect(stopped?.time).toBe(8)
  expect(stopped?.event).toMatchObject({ partition: 1, lifetime: 1, round: 1, deadline: false })
  expect(stopped?.outputs.map((command) => command.kind)).toEqual(["finishReady"])
  expect(run.observations.some((frame) => frame.event.kind === "stopGroupEnded" && frame.time === 8)).toBe(true)
  expect(run.projection.delivery.submissions.batches).toEqual(original)
  expect(run.projection.collection.leases).toEqual(leases)
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
  run.advance({ untilTime: 20, maxEvents: 200 })
  expect(
    run.observations.filter((frame) => frame.event.kind === "submissionTerminal").map((frame) => frame.time)
  ).toEqual([16])
  expect(run.projection.collection.leases).toEqual([])
  expect(run.projection.dispatch.requests).toEqual([])
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
})

it("group Stop derives its real output wait even with extraPending false", () => {
  const run = createRun({
    seed: 7,
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    session: { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 },
    outputProfile: { outcome: "certain", delayMs: 9, leaseMs: 20 },
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 1,
      maxFiles: 1,
      maxImports: 0,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    },
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  run.advance({ untilTime: 7, maxEvents: 100 })
  expect(run.projection.delivery.submissions.batches[0]).toMatchObject({
    group: 1,
    round: 1,
    surface: "background",
    phase: "authorized"
  })
  const original = run.projection.collection.leases
  expect(original).toHaveLength(1)
  run.schedule({
    at: 8,
    kind: "canonical",
    event: {
      kind: "stopGroupPolled",
      group: 1,
      lifetime: 1,
      round: 1,
      scopes: [{ partition: 1, round: 1 }],
      deadline: false,
      extraPending: false,
      continuations: 0
    }
  })
  run.advance({ untilTime: 8, maxEvents: 100 })
  const wait = run.observations.find((frame) => frame.event.kind === "stopGroupPolled")
  expect(wait?.outputs.map((command) => command.kind)).toEqual(["waitForWork"])
  expect(wait?.rejection).toBeUndefined()
  expect(run.projection.collection.leases).toEqual(original)
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
  run.schedule({
    at: 9,
    kind: "canonical",
    event: {
      kind: "stopGroupPolled",
      group: 1,
      lifetime: 1,
      round: 1,
      scopes: [{ partition: 1, round: 1 }],
      deadline: true,
      extraPending: false,
      continuations: 0
    }
  })
  run.advance({ untilTime: 9, maxEvents: 100 })
  const cutoff = run.observations.filter((frame) => frame.event.kind === "stopGroupPolled")[1]
  expect(cutoff?.outputs.map((command) => command.kind)).toEqual(["finishReady"])
  expect(cutoff?.rejection).toBeUndefined()
  // The logical decision is distinct from the actual still-issued output.
  expect(run.projection.collection.leases).toEqual(original)
  run.advance({ untilTime: 20, maxEvents: 100 })
  expect(
    run.observations.filter((frame) => frame.event.kind === "submissionTerminal").map((frame) => frame.time)
  ).toEqual([16])
  expect(run.projection.collection.leases).toEqual([])
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
})
