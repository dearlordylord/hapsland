import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE } from "./index.ts"

// SOURCE-ONLY TDD gap: #182 must publish the declared typed callbackTargets and
// Control union. No casts or locally fabricated receipt bypass that boundary.
it("a held captured old result cannot become current delivery after source replacement", () => {
  const run = createRun({
    seed: 7,
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    outcome: "finding",
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 2,
      maxFiles: 2,
      maxImports: 1,
      maxDepth: 1,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    },
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5], revisionSubject: "root", revisionInput: "old" },
      { at: 3, kind: "edit", bytes: 10, unitBytes: [5], revisionSubject: "root", revisionInput: "new" }
    ]
  })
  for (let fuel = 0; fuel < 120; fuel++) {
    if (run.observe().callbackTargets.some((target) => target.effect.kind === "jevSettled")) break
    run.step()
  }
  const target = run.observe().callbackTargets.find((value) => value.effect.kind === "jevSettled")!
  expect(target.owner).toEqual({ partition: 1, lifetime: 1, round: 1, operation: 3 })
  expect(target.effect).toEqual({ kind: "jevSettled", request: 4 })
  expect(
    run.observations.flatMap((frame) => frame.outputs).filter((command) => command.kind === "jevRequestIssued")
  ).toMatchObject([{ ...target.owner, request: 4 }])
  expect(Number.isSafeInteger(target.originalOrder)).toBe(true)
  const immutableTarget = JSON.parse(JSON.stringify(target))
  const originalFrame = run.observations.at(-1)!
  const immutableBefore = JSON.parse(JSON.stringify(originalFrame.before))
  const immutableAfter = JSON.parse(JSON.stringify(originalFrame.after))
  run.applyControl({ kind: "callback", target, action: "hold" })
  expect(run.advance({ untilTime: 15, maxEvents: 120 }).reason).not.toBe("eventLimit")
  expect(run.projection.global).toEqual({ items: 2, bytes: 10 })
  expect(run.projection.dispatch.requests).toHaveLength(1)
  expect(run.projection.pendingFindings).toHaveLength(1)
  const fresh = run.observations.find((frame) => frame.event.kind === "submissionTerminal")!
  expect(fresh.time).toBe(10)
  expect(fresh.event).toMatchObject({ advice: 7, certain: true })
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(1)
  expect(target).toEqual(immutableTarget)
  expect(originalFrame.before).toEqual(immutableBefore)
  expect(originalFrame.after).toEqual(immutableAfter)
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
  run.applyControl({ kind: "callback", target, action: "release" })
  expect(run.advance({ untilTime: run.now, maxEvents: 120 }).reason).not.toBe("eventLimit")
  const old = run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").at(-1)!
  expect(old.event).toMatchObject({ ...target.owner, request: 4, outcome: "finding", currentWork: false })
  // Canonical.review_observed_choice: physically completed, still-owned stale
  // finding is retired, not the canceled/absent-work Ignored branch.
  expect(old.outputs).toEqual([
    { category: "event", kind: "reservationReleased", id: 2 },
    { category: "event", kind: "reviewRecorded", outcome: "finding" },
    { category: "event", kind: "staleFindingRetired" },
    { category: "event", kind: "jevRequestOutcomeRecorded", outcome: "finding" }
  ])
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  expect(run.projection.dispatch.requests).toEqual([])
  const settled = JSON.parse(JSON.stringify(run.projection))
  run.applyControl({ kind: "callback", target, action: "duplicate" })
  expect(run.advance({ untilTime: run.now, maxEvents: 120 }).reason).not.toBe("eventLimit")
  const repeated = run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").at(-1)!
  expect(repeated.rejection).toBe("StaleOperation")
  expect(repeated.outputs).toEqual([])
  expect(repeated.before).toEqual(repeated.after)
  expect(run.projection).toEqual(settled)
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(1)
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
})
