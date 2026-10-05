import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Run, type RunConfig } from "./index.ts"

const config = (changed: boolean, next: number, preparationDelay: number): RunConfig => ({
  seed: 7,
  retention: 1000,
  preparationDelay,
  jevDelay: 20,
  outcome: "finding",
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
    { at: 0, kind: "edit", bytes: 10, unitBytes: [5], revisionSubject: "opaque-root", revisionInput: "accepted-old" },
    {
      at: next,
      kind: "edit",
      bytes: 14,
      unitBytes: [7],
      revisionSubject: "opaque-root",
      revisionInput: changed ? "accepted-new" : "accepted-old"
    }
  ]
})
function advance(run: Run, endpoint: number) {
  expect(run.advance({ untilTime: endpoint, maxEvents: 120 }).reason).not.toBe("eventLimit")
}
function replay(run: Run) {
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
}

// Independent literals distinguish two concurrently retained physical effects
// from permission to deliver their results. Canonical is exercised, not rerun as
// a test oracle. These cases preserve the existing changed/refused regressions.
it.each([
  ["preparation", 1, 5],
  ["review", 3, 2]
] as const)("changed input fences the old result during overlapping %s", (phase, next, preparationDelay) => {
  const run = createRun(config(true, next, preparationDelay))
  advance(run, next)
  expect(run.observations.filter((frame) => frame.event.kind === "revisionRegister")).toHaveLength(2)
  expect(
    run.observations
      .flatMap((frame) => frame.commands)
      .flatMap((command) => (command.kind === "revisionReplaced" ? [command.generation] : []))
  ).toEqual([1, 2])
  expect(run.projection.global).toEqual({ items: 2, bytes: preparationDelay === 5 ? 24 : 19 })
  expect(run.projection.dispatch.running).toHaveLength(2)
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "retainFinding")
  ).toEqual([])
  replay(run)
  advance(run, 30)
  const issues = run.observations
    .flatMap((frame) => frame.commands)
    .filter((command) => command.kind === "jevRequestIssued")
  // Production server.ts:1986–2000,2098–2101 checks current work before
  // backend issuance. A stale preparation still completes its original facts,
  // but cannot acquire a request; an already-issued review completes physically.
  expect(issues).toHaveLength(phase === "preparation" ? 1 : 2)
  if (phase === "preparation") {
    expect(run.observations.filter((frame) => frame.event.kind === "preparationCompleted")).toHaveLength(2)
    expect(run.observations.some((frame) => frame.event.kind === "jevRequestReady" && !frame.event.currentWork)).toBe(
      true
    )
  } else {
    const old = issues[0]!
    const oldCallback = run.observations.find(
      (frame) => frame.event.kind === "jevRequestSettled" && frame.event.request === old.request
    )!
    expect(oldCallback.event).toMatchObject({
      partition: old.partition,
      lifetime: old.lifetime,
      round: old.round,
      operation: old.operation,
      request: old.request,
      outcome: "finding",
      currentWork: false
    })
    // Canonical.review_observed_choice retires an owned stale finding; the
    // canceled/absent-work JevObservationIgnored path has different premises.
    expect(oldCallback.commands).toEqual([
      { kind: "reservationReleased", id: 2 },
      { kind: "reviewRecorded", outcome: "finding" },
      { kind: "retireStaleFinding" },
      { kind: "jevRequestOutcomeRecorded", outcome: "finding" }
    ])
    expect(oldCallback.after.dispatch.requests.some((request) => request.request === old.request)).toBe(false)
  }
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "retainFinding")
  ).toEqual([{ kind: "retainFinding" }])
  expect(
    run.observations.filter((frame) => frame.event.kind === "submissionTerminal").map((frame) => frame.time)
  ).toEqual([next + preparationDelay + 20])
  expect(run.projection.global).toEqual({ items: 1, bytes: 7 })
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  replay(run)
})

it("same input preserves both captured generation members during overlapping preparation", () => {
  const run = createRun(config(false, 1, 5))
  advance(run, 1)
  expect(
    run.observations
      .flatMap((frame) => frame.commands)
      .flatMap((command) => (command.kind === "revisionReplaced" ? [command.generation] : []))
  ).toEqual([1])
  expect(
    run.observations
      .flatMap((frame) => frame.commands)
      .flatMap((command) => (command.kind === "revisionReused" ? [command.generation] : []))
  ).toEqual([1])
  expect(run.projection.global).toEqual({ items: 2, bytes: 24 })
  advance(run, 30)
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "revisionStale")
  ).toEqual([])
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "retainFinding")
  ).toHaveLength(2)
  expect(
    run.observations.filter((frame) => frame.event.kind === "submissionTerminal").map((frame) => frame.time)
  ).toEqual([25, 26])
  expect(run.projection.global).toEqual({ items: 2, bytes: 12 })
  expect(run.projection.dispatch.requests).toEqual([])
  replay(run)
})

it("changed source before final selection retires the old finding and fresh work recovers", () => {
  const original = config(true, 3, 2)
  const run = createRun({ ...original, inputs: (original.inputs ?? []).slice(0, 1) })
  for (let fuel = 0; fuel < 120; fuel++) {
    if (run.step()?.event.kind === "collectionReady") break
  }
  expect(run.observations.at(-1)?.event.kind).toBe("collectionReady")
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  expect(run.observations.filter((frame) => frame.event.kind === "submissionBegin")).toEqual([])
  run.applyControl({
    kind: "environment",
    currentWork: false,
    credentialReady: true,
    credentialGeneration: 1,
    sourceReadable: false
  })
  advance(run, 23)
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(run.projection.collection.leases).toEqual([])
  replay(run)
  run.applyControl({
    kind: "environment",
    currentWork: true,
    credentialReady: true,
    credentialGeneration: 1,
    sourceReadable: true
  })
  run.schedule({
    at: 24,
    kind: "edit",
    bytes: 14,
    unitBytes: [7],
    revisionSubject: "opaque-root",
    revisionInput: "accepted-new"
  })
  advance(run, 50)
  expect(
    run.observations.filter((frame) => frame.event.kind === "submissionTerminal").map((frame) => frame.time)
  ).toEqual([46])
  expect(run.projection.global).toEqual({ items: 1, bytes: 7 })
  replay(run)
})
