import { expect, it, vi } from "vitest"
import Native from "../../monkey-business-bend/run.mjs"
import { createRun } from "./index.ts"
import { encodeNativeRunList, nativeRunList } from "./native-run-codec.ts"
import { readRecord } from "@hapsland/canonical-policy/canonical/boundary-schema"

import { agent, target, control, opened, attempt, terminal, replayExact } from "./collection-response.fixture.ts"

it("retains completed finding until a current response selects its exact authorized member", () => {
  const run = opened()
  run.advance({ untilTime: 6 })
  expect(run.projection.pendingFindings).toEqual([])
  expect(terminal(run)).toEqual([])
  run.advance({ untilTime: 7 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(terminal(run)).toEqual([])
  attempt(run)
  run.advance({ untilTime: 8 })
  expect(terminal(run)).toHaveLength(1)
  expect(terminal(run)[0]).toMatchObject({ partition: 1, event: { certain: true } })
  expect(run.observations.filter((frame) => frame.event.kind === "collectionReserveLease")).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  replayExact(run)
})

it.each(["close", "expiry", "wrongScope", "revokedOptIn"] as const)(
  "%s cannot turn a retained finding into output authority",
  (failure) => {
    const run = opened(failure === "expiry" ? 7 : 20, failure === "revokedOptIn")
    run.advance({ untilTime: 7 })
    expect(run.projection.pendingFindings).toHaveLength(1)
    if (failure === "close") control(run, { kind: "collectionResponse", action: "close", agent, target })
    attempt(run, false, failure === "wrongScope" ? { ...target, lifetime: 2 } : target)
    run.advance({ untilTime: 8 })
    expect(terminal(run)).toEqual([])
    expect(run.projection.collection.leases).toEqual([])
    // An ended response does not cancel valid preparation/review ownership.
    expect(run.projection.pendingFindings).toHaveLength(1)
    replayExact(run)
  }
)

it("temporary credential refusal recovers on the same response without a second review", () => {
  const run = opened()
  run.advance({ untilTime: 7 })
  run.applyControl({ kind: "credentials", action: "unavailable" })
  attempt(run)
  run.advance({ untilTime: 8 })
  expect(terminal(run)).toEqual([])
  expect(run.projection.pendingFindings).toHaveLength(1)
  run.applyControl({ kind: "credentials", action: "restore" })
  attempt(run)
  run.advance({ untilTime: 9 })
  expect(terminal(run)).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  replayExact(run)
})

it("a successful response suppresses a second selection of the same retained advice", () => {
  const run = opened()
  run.advance({ untilTime: 7 })
  attempt(run)
  run.advance({ untilTime: 8 })
  attempt(run)
  run.advance({ untilTime: 9 })
  expect(terminal(run)).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  replayExact(run)
})

it("issues independent overlapping contexts and cannot reparent an ended original identity", () => {
  const run = opened()
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual(target)
  control(run, {
    kind: "collectionResponse",
    action: "open",
    agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false }
  })
  const second = { ...target, id: 2 }
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual(second)
  control(run, { kind: "collectionResponse", action: "close", agent, target })
  run.advance({ untilTime: 7 })
  attempt(run, false, target)
  expect(run.observe().collectionResponseReports.at(-1)?.result).toBe("missing")
  attempt(run, false, second)
  run.advance({ untilTime: 8 })
  expect(terminal(run)).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  expect(run.projection.pendingFindings).toHaveLength(1)
  replayExact(run)
})

it("overlapping response selections cannot both own one advice item", () => {
  const run = opened()
  control(run, {
    kind: "collectionResponse",
    action: "open",
    agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false }
  })
  run.advance({ untilTime: 7 })
  attempt(run, false, target)
  attempt(run, false, { ...target, id: 2 })
  run.advance({ untilTime: 8 })
  expect(terminal(run)).toHaveLength(1)
  expect(
    run.observations.flatMap((frame) => frame.outputs).filter((command) => command.kind === "collectionLeaseReserved")
  ).toHaveLength(1)
  expect(
    run.observations.flatMap((frame) => frame.outputs).filter((command) => command.kind === "submissionBegun")
  ).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  replayExact(run)
})

it("refuses foreign response scopes before minting a capability and preserves allocator identity", () => {
  const run = opened()
  control(run, {
    kind: "collectionResponse",
    action: "open",
    agent,
    response: { partition: 1, lifetime: 2, round: 1, started: 0, deadline: 20, admittedBlock: false }
  })
  expect(run.observe().collectionResponseReports.at(-1)).toMatchObject({ result: "wrongScope" })
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toBeUndefined()
  control(run, {
    kind: "collectionResponse",
    action: "open",
    agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false }
  })
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual({ ...target, id: 2 })
  replayExact(run)
})

it.each(["laterAction", "extraEnvelopeField"] as const)(
  "rejects %s before publishing response state and retries the same issuance",
  (malformedKind) => {
    const run = createRun({
      retention: 1000,
      preparationDelay: 2,
      jevDelay: 5,
      inputs: [{ at: 0, kind: "edit", agent, bytes: 10, unitBytes: [5], outcome: "finding" }]
    })
    run.advance({ untilTime: 0 })
    const before = run.observe()
    const runtime = run.runtimeSnapshot()
    const replay = run.exportReplay()
    const apply = Native.control
    const interception = vi.spyOn(Native, "control").mockImplementationOnce((state, value) => {
      const transition = apply(state, value)
      const report = readRecord(transition.report)
      if (malformedKind === "extraEnvelopeField")
        return { ...transition, report: { ...report, result: { ...readRecord(report.result), unexpected: true } } }
      const nativeState = readRecord(transition.state)
      const action = {
        $: "Driver.Action",
        event: { $: "Canonical.CollectorGateCheck", expired: false, credential_valid: true },
        delay: 0,
        job: false,
        candidate: { $: "None" },
        expiry_advice: { $: "None" }
      }
      const item = (order: number, delay: unknown) => ({
        $: "NativeRunTypes.Item",
        order,
        input: {
          $: "NativeRunTypes.ResponseInput",
          action: { ...action, delay },
          target: { $: "None" },
          pending: { $: "None" },
          writer: false
        }
      })
      return {
        ...transition,
        state: {
          ...nativeState,
          items: encodeNativeRunList([
            ...nativeRunList(nativeState.items),
            item(Number(nativeState.next), 0),
            item(Number(nativeState.next) + 1, true)
          ])
        }
      }
    })
    const open = {
      kind: "collectionResponse" as const,
      action: "open" as const,
      agent,
      response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false }
    }
    try {
      expect(() => control(run, open)).toThrow()
      expect(interception).toHaveBeenCalledTimes(1)
      expect(run.observe()).toEqual(before)
      expect(run.runtimeSnapshot()).toEqual(runtime)
      expect(run.exportReplay()).toEqual(replay)
      control(run, open)
      expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual(target)
      control(run, open)
      expect(run.observe().collectionResponseReports.map((report) => report.issued?.id)).toEqual([1, 2])
      run.advance({ untilTime: 7 })
      attempt(run)
      run.advance({ untilTime: 8 })
      expect(terminal(run)).toHaveLength(1)
      replayExact(run)
    } finally {
      interception.mockRestore()
    }
  }
)
