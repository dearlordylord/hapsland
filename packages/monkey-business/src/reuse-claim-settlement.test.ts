import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"

it("settles a superseded pre-issuance claim while preserving the other prepared request", () => {
  // The original standalone subject is shared: changing prepared input replaces
  // its revision. Reuse ownership must settle even when no physical request ran.
  const run = createRun({
    outcome: "clear",
    preparationDelay: 2,
    jevDelay: 5,
    inputs: ["a", "b"].map((input) => ({
      at: 0,
      kind: "edit" as const,
      bytes: 10,
      unitBytes: [5],
      evaluationInputs: [input]
    })),
    lifecycles: { reuse: { entryLimit: 1, byteLimit: 100 } }
  })
  expect(run.advance({ untilTime: 100, maxEvents: 1000 }).reason).toBe("idle")
  const unavailable = run.observations.filter((frame) =>
    frame.commands.some((command) => command.kind === "jevRequestUnavailable")
  )
  expect(unavailable).toHaveLength(1)
  expect(unavailable[0]!.event.kind).toBe("jevRequestReady")
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "jevRequestIssued")
  ).toHaveLength(1)
  expect(run.projection.work).toEqual([])
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.reuse.claims).toEqual([])
  expect(run.projection.reuse.cache).toHaveLength(1)
  expect(run.projection.charges.map((charge) => charge.id)).toEqual(
    run.projection.reuse.cache.map((entry) => entry.reservation)
  )
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  const replay = restoreReplay(run.exportReplay())
  expect(replay.observations).toEqual(run.observations)
  expect(replay.projection).toEqual(run.projection)
})

it("settles an authentically issued stale clear result without caching its replaced revision", () => {
  const run = createRun({
    outcome: "clear",
    preparationDelay: 2,
    jevDelay: 5,
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5], evaluationInputs: ["old"] },
      { at: 3, kind: "edit", bytes: 10, unitBytes: [5], evaluationInputs: ["new"] }
    ],
    lifecycles: { reuse: { entryLimit: 2, byteLimit: 100 } }
  })
  expect(run.advance({ untilTime: 100, maxEvents: 1000 }).reason).toBe("idle")
  const commands = run.observations.flatMap((frame) => frame.commands)
  expect(commands.filter((command) => command.kind === "jevRequestIssued")).toHaveLength(2)
  // Canonical records an authentic AtJev result even when the revision became
  // stale. Captured revision currency separately forbids caching that result.
  const stale = run.observations.find((frame) => frame.time === 2 + 5 && frame.event.kind === "jevRequestSettled")
  const current = run.observations.find((frame) => frame.time === 3 + 2 + 5 && frame.event.kind === "jevRequestSettled")
  expect(stale?.event).toMatchObject({ kind: "jevRequestSettled", currentWork: false, outcome: "clear" })
  expect(stale?.commands).toContainEqual({ kind: "jevRequestOutcomeRecorded", outcome: "clear" })
  expect(stale?.commands).toContainEqual({ kind: "settleStaleClear" })
  expect(current?.event).toMatchObject({ kind: "jevRequestSettled", currentWork: true, outcome: "clear" })
  expect(current?.commands).toContainEqual({ kind: "settleClear" })
  expect(commands.filter((command) => command.kind === "cacheCommitted")).toHaveLength(1)
  expect(run.projection.work).toEqual([])
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.reuse.claims).toEqual([])
  expect(run.projection.reuse.cache).toHaveLength(1)
  expect(run.projection.charges.map((charge) => charge.id)).toEqual(
    run.projection.reuse.cache.map((entry) => entry.reservation)
  )
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  const replay = restoreReplay(run.exportReplay())
  expect(replay.observations).toEqual(run.observations)
  expect(replay.projection).toEqual(run.projection)
})
