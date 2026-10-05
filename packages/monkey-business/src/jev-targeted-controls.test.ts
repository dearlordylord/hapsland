import { expect, it } from "vitest"
import { createRun, restoreReplay, type Run } from "./index.ts"
import type { JevRequestTarget } from "./jev-interventions.ts"

const edit = { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5], outcome: "finding" as const }
const issued = (run: Run): JevRequestTarget => {
  for (let step = 0; step < 100; step++) {
    const frame = run.step()
    const command = frame?.commands.find((command) => command.kind === "jevRequestIssued")
    if (command?.kind === "jevRequestIssued")
      return {
        partition: command.partition,
        lifetime: command.lifetime,
        round: command.round,
        operation: command.operation,
        request: command.request
      }
  }
  throw new Error("request was not issued within 100 transitions")
}
const replayExact = (run: Run): void => {
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
}
const reach = (run: Run, condition: () => boolean): void => {
  for (let transitions = 0; transitions < 100 && !condition(); transitions++) run.step()
  expect(condition(), "declared boundary must be reached within 100 transitions").toBe(true)
}

it("targets an issued request before start, preserves its due time and recovers on the same resident", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 })
  const target = issued(run)
  const due = run.now + 20
  run.applyControl({ kind: "jevRequest", target, outcome: "neverSent" })
  expect(run.interventions.at(-1)).toMatchObject({ control: { target }, result: "applied", at: run.now })
  run.applyControl({ kind: "jevProfile", delayMs: 1, outcome: "finding" })
  run.advance({ untilTime: due })
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toEqual([])
  expect(
    run.observations
      .filter((frame) => frame.event.kind === "jevRequestSettled")
      .map((frame) => [frame.time, frame.event])
  ).toEqual([[due, { kind: "jevRequestSettled", ...target, outcome: "neverSent", currentWork: true }]])
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  run.schedule({ ...edit, at: run.now })
  run.advance({ untilTime: run.now + 10 })
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "submissionRecorded")
  ).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
  replayExact(run)
})

it("visibly refuses wrong, unknown, started and terminal targets without replacing their healthy callbacks", () => {
  const run = createRun({ inputs: [edit], jevDelay: 20 })
  const target = issued(run)
  for (const field of ["partition", "lifetime", "round", "operation", "request"] as const) {
    run.applyControl({ kind: "jevRequest", target: { ...target, [field]: target[field] + 1 }, outcome: "timeout" })
  }
  reach(run, () => run.observations.some((frame) => frame.event.kind === "jevRequestStarted"))
  run.applyControl({ kind: "jevRequest", target, outcome: "neverSent" })
  run.advance({ untilTime: 30 })
  run.applyControl({ kind: "jevRequest", target, outcome: "interrupted" })
  expect(run.interventions.map((report) => report.result)).toEqual([
    "requestMissing",
    "requestMissing",
    "requestMissing",
    "requestMissing",
    "requestMissing",
    "requestAlreadyStarted",
    "requestMissing"
  ])
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  expect(
    run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").map((frame) => frame.event)
  ).toEqual([{ kind: "jevRequestSettled", ...target, outcome: "finding", currentWork: true }])
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "submissionRecorded")
  ).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
  replayExact(run)
})

it.each(["backendFailure", "timeout", "interrupted"] as const)(
  "replaces only a started request with valid %s facts",
  (outcome) => {
    const run = createRun({ inputs: [edit], jevDelay: 20 })
    const target = issued(run)
    reach(run, () => run.observations.some((frame) => frame.event.kind === "jevRequestStarted"))
    run.applyControl({ kind: "jevRequest", target, outcome })
    run.advance({ untilTime: 30 })
    expect(run.interventions.at(-1)?.result).toBe("applied")
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestInterrupted")).toHaveLength(
      outcome === "interrupted" ? 1 : 0
    )
    expect(
      run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").map((frame) => frame.event)
    ).toEqual([{ kind: "jevRequestSettled", ...target, outcome, currentWork: true }])
    expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
    expect(run.projection.dispatch.requests).toEqual([])
    expect(run.projection.dispatch.running).toEqual([])
    replayExact(run)
  }
)

it("restores availability without changing issuance authority, and rotation retires old findings", () => {
  const run = createRun({ inputs: [edit] })
  reach(run, () => run.observations.some((frame) => frame.event.kind === "jevRequestSettled"))
  run.applyControl({ kind: "credentials", action: "unavailable" })
  run.advance({ untilTime: 8 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "submissionRecorded")
  ).toEqual([])
  run.applyControl({ kind: "credentials", action: "restore" })
  run.advance({ untilTime: 9 })
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "submissionRecorded")
  ).toHaveLength(1)
  run.schedule({ ...edit, at: 10 })
  reach(run, () => run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").length === 2)
  run.applyControl({ kind: "credentials", action: "rotate" })
  run.advance({ untilTime: 20 })
  expect(run.projection.pendingFindings).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.collection.leases).toEqual([])
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "submissionRecorded")
  ).toHaveLength(1)
  expect(run.interventions.map((report) => report.result)).toEqual(["applied", "applied", "applied"])
  run.schedule({ ...edit, at: 21 })
  run.advance({ untilTime: 30 })
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "submissionRecorded")
  ).toHaveLength(2)
  expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
  replayExact(run)
})

it("refuses issuance while credentials are unavailable and restores fresh admission without reset", () => {
  const run = createRun({ inputs: [] })
  run.applyControl({ kind: "credentials", action: "unavailable" })
  run.schedule(edit)
  run.advance({ untilTime: 10, maxEvents: 100 })
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "jevRequestUnavailable")
  ).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toEqual([])
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  run.applyControl({ kind: "credentials", action: "restore" })
  run.schedule({ ...edit, at: 11 })
  run.advance({ untilTime: 21, maxEvents: 100 })
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  expect(
    run.observations.flatMap((frame) => frame.commands).filter((command) => command.kind === "submissionRecorded")
  ).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.rejection)).toEqual([])
  expect(run.interventions.map((report) => report.result)).toEqual(["applied", "applied"])
  replayExact(run)
})
