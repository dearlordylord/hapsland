import { expect, it } from "vitest"
import { createRun } from "./index.ts"

it("refuses saturated Jev requests immediately and admits fresh work after a permit settles", () => {
  const inputs = [
    ...Array.from({ length: 20 }, (_, index) => ({ at: index, kind: "edit" as const, bytes: 10, unitBytes: [5] })),
    { at: 1003, kind: "edit" as const, bytes: 10, unitBytes: [5] }
  ]
  const run = createRun({ inputs, jevDelay: 1000 })
  expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle")

  const issued = run.observations.filter((item) =>
    item.outputs.some((command) => command.kind === "reviewServiceRequestIssued")
  )
  const unavailable = run.observations.filter((item) =>
    item.outputs.some((command) => command.kind === "reviewServiceRequestUnavailable")
  )
  expect(issued.filter((item) => item.time < 1000)).toHaveLength(8)
  expect(unavailable).toHaveLength(12)
  expect(issued.at(-1)?.time).toBe(1005)
  const refusedOperations = new Set(
    unavailable
      .map((item) => item.event)
      .filter((event) => "operation" in event)
      .map((event) => event.operation)
  )
  expect(
    run.observations
      .flatMap((item) => item.effects)
      .filter(
        (effect) => effect.kind === "jev" && effect.phase === "started" && refusedOperations.has(effect.operation!)
      )
  ).toEqual([])
})

it("a finish attempt waits for both requests, then a deadline cancels their exact work", () => {
  const run = createRun({
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 1, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 5, kind: "finish" },
      { at: 6, kind: "canonical", event: { kind: "stopPolled", partition: 1, lifetime: 1, round: 1, deadline: true } }
    ],
    jevDelay: 1000
  })
  expect(run.advance({ untilTime: 6, maxEvents: 100 }).reason).toBe("timeLimit")
  const waiting = run.observations.find((item) => item.event.kind === "stopPolled" && item.time === 5)
  expect(waiting?.outputs.map((command) => command.kind)).toEqual(["waitForWork"])
  const deadline = run.observations.find((item) => item.event.kind === "stopPolled" && item.time === 6)
  expect(deadline?.outputs.map((command) => command.kind)).toEqual([
    "reservationReleased",
    "reservationReleased",
    "cancelWork",
    "cancelWork",
    "finishReady"
  ])
  const started = run.observations
    .flatMap((item) => item.effects)
    .filter((effect) => effect.kind === "jev" && effect.phase === "started")
    .map((effect) => effect.operation)
    .sort()
  const cancelled = deadline?.outputs
    .filter((command) => command.kind === "cancelWork")
    .map((command) => command.operation)
    .sort()
  expect(cancelled).toEqual(started)
  expect(run.advance({ maxEvents: 100 }).reason).toBe("idle")
  const late = run.observations.filter((item) => item.event.kind === "reviewServiceRequestSettled")
  expect(late.map((item) => item.outputs.map((command) => command.kind))).toEqual([
    ["reviewServiceRequestObservationIgnored"],
    ["reviewServiceRequestObservationIgnored"]
  ])
  const issuedReviewServiceRequestIds = run.observations
    .flatMap((item) => item.effects)
    .filter((effect) => effect.kind === "jev" && effect.phase === "started")
    .map((effect) => effect.reviewServiceRequestId)
  expect(
    late.map((item) => ("reviewServiceRequestId" in item.event ? item.event.reviewServiceRequestId : null))
  ).toEqual(issuedReviewServiceRequestIds)
})

it("same-time completion and deadline follow recorded insertion order", () => {
  const edit = { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], outcome: "finding" as const }
  const deadline = {
    at: 7,
    kind: "canonical" as const,
    event: { kind: "stopPolled" as const, partition: 1, lifetime: 1, round: 1, deadline: true }
  }
  const beforeCompletion = createRun({ inputs: [edit, deadline], jevDelay: 5 })
  beforeCompletion.advance()
  expect(
    beforeCompletion.observations
      .filter((item) => item.time === 7)
      .slice(0, 2)
      .map((item) => item.event.kind)
  ).toEqual(["stopPolled", "reviewServiceRequestSettled"])
  expect(
    beforeCompletion.observations
      .find((item) => item.event.kind === "reviewServiceRequestSettled")
      ?.outputs.map((command) => command.kind)
  ).toEqual(["reviewServiceRequestObservationIgnored"])

  const afterCompletion = createRun({ inputs: [edit], jevDelay: 5 })
  afterCompletion.advance({ untilTime: 2 })
  afterCompletion.schedule(deadline)
  afterCompletion.advance()
  expect(
    afterCompletion.observations
      .filter((item) => item.time === 7)
      .slice(0, 2)
      .map((item) => item.event.kind)
  ).toEqual(["reviewServiceRequestSettled", "stopPolled"])
  expect(
    afterCompletion.observations
      .find((item) => item.event.kind === "reviewServiceRequestSettled")
      ?.outputs.map((command) => command.kind)
  ).toContain("findingRetained")
})

it("offers one ordinary delivery attempt for a completed single-unit edit", () => {
  const run = createRun({
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" }],
    jevDelay: 5
  })
  run.advance({ untilTime: 20 })
  expect(run.observations.filter((item) => item.event.kind === "collectionReady")).toHaveLength(1)
  expect(run.observations.filter((item) => item.event.kind === "collectionReserveLease")).toHaveLength(1)
  expect(run.observations.filter((item) => item.rejection)).toEqual([])
})

it("readies completed findings after a Stop deadline cancels sibling work", () => {
  const run = createRun({
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5, 5], outcome: "finding" },
      { at: 5, kind: "finish" }
    ],
    jevDelay: 1000,
    finishDeadline: 5
  })
  run.advance({ untilTime: 3 })
  const issued = run.observations.flatMap((item) =>
    item.outputs.filter((command) => command.kind === "reviewServiceRequestIssued")
  )
  expect(issued).toHaveLength(2)
  const { kind: _kind, category: _category, ...binding } = issued[0]!
  run.schedule({
    at: 4,
    kind: "canonical",
    event: { kind: "reviewServiceRequestSettled", ...binding, outcome: "finding", currentWork: true }
  })
  run.advance({ untilTime: 20 })
  const deadline = run.observations.find((item) => item.event.kind === "stopPolled" && item.time === 10)
  expect(deadline?.outputs.map((command) => command.kind)).toContain("finishReady")
  expect(
    run.observations.some(
      (item) =>
        item.event.kind === "collectionReady" &&
        item.time === 10 &&
        item.outputs.some((command) => command.kind === "collectionEligible")
    )
  ).toBe(true)
  expect(run.observations.filter((item) => item.event.kind === "collectionReserveLease")).toHaveLength(1)
  expect(run.observations.filter((item) => item.event.kind === "submissionBegin")).toHaveLength(1)
  expect(run.observations.some((item) => item.outputs.some((command) => command.kind === "submissionBegun"))).toBe(true)
  expect(run.observations.filter((item) => item.event.kind === "collectionReserveLease" && item.rejection)).toEqual([])
  expect(run.observations.filter((item) => item.event.kind === "submissionBegin" && item.rejection)).toEqual([])
})
