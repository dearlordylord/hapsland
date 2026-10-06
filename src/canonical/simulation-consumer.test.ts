import { expect, it } from "vitest"
import { createRun, restoreReplay, type RunConfig } from "../../packages/monkey-business/src/index.ts"

const restore = (run: ReturnType<typeof createRun>) => {
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  return restored
}

it("consumes permits once while refusing an edit that arrives during saturation", () => {
  const run = createRun({
    retention: 1000,
    outcome: "clear",
    inputs: [0, 0, 4].map((at) => ({ at, kind: "edit", bytes: 10, unitBytes: [5] })),
    editPermitLimits: { perAdvicee: 1, resident: 1 },
    permitProfile: { outcome: "success", durationMs: 2, lifetimeMs: 30000 }
  })
  expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle")
  expect(
    run.observations.filter((frame) => frame.commands.some((command) => command.kind === "permitConsumed"))
  ).toHaveLength(2)
  const consumed = run.observations.flatMap((frame) =>
    frame.event.kind === "consumePermit" && frame.commands.some((command) => command.kind === "permitConsumed")
      ? [frame.event.token]
      : []
  )
  expect(new Set(consumed).size).toBe(2)
  expect(run.observations.find((frame) => frame.rejection)?.rejection).toBe("AdviceePermitLimit")
  expect(run.projection.admissions.flatMap((admission) => admission.permits)).toEqual([])
  restore(run)
})

it("reuses an identical evaluation without issuing another physical request", () => {
  const run = createRun({
    retention: 1000,
    outcome: "clear",
    inputs: [0, 0, 20].map((at) => ({
      at,
      kind: "edit",
      bytes: 10,
      unitBytes: [5],
      evaluationInputs: ["exact-prepared-input"]
    })),
    lifecycles: { reuse: { entryLimit: 1, byteLimit: 20 } }
  })
  expect(run.advance({ maxEvents: 1000 }).reason).toBe("idle")
  expect(
    run.observations.filter((frame) => frame.commands.some((command) => command.kind === "jevRequestIssued"))
  ).toHaveLength(1)
  expect(run.observations.some((frame) => frame.commands.some((command) => command.kind === "reuseCached"))).toBe(true)
  expect(run.observations.flatMap((frame) => (frame.rejection ? [frame.rejection] : []))).toEqual([])
  restore(run)
})

it("keeps a finding during credential loss and delivers it after recovery", () => {
  const run = createRun({
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    inputs: [{ at: 0, kind: "edit", agent: "agent-1", bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  run.advance({ untilTime: 0 })
  run.applyControl({
    kind: "collectionResponse",
    action: "open",
    agent: "agent-1",
    response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 20, admittedBlock: false }
  })
  run.advance({ untilTime: 7 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  const attempt = (candidate = run) =>
    candidate.applyControl({
      kind: "collectionResponse",
      action: "attempt",
      agent: "agent-1",
      target: { id: 1, partition: 1, lifetime: 1, round: 1 },
      currentBlock: false
    })
  run.applyControl({ kind: "credentials", action: "unavailable" })
  attempt()
  run.advance({ untilTime: 8 })
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(0)
  expect(run.projection.pendingFindings).toHaveLength(1)
  const restored = restore(run)
  for (const candidate of [run, restored]) {
    candidate.applyControl({ kind: "credentials", action: "restore" })
    attempt(candidate)
    candidate.advance({ untilTime: 9 })
  }
  expect(restored.observe()).toEqual(run.observe())
  expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  restore(run)
})

it.each([8, 10])("settles original work around the Stop deadline with delay %s", (delay) => {
  const config = {
    retention: 1000,
    preparationDelay: 2,
    jevDelay: delay,
    finishDeadline: 8,
    outcome: "clear",
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 3, kind: "finish" }
    ]
  } satisfies RunConfig
  const run = createRun(config)
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(run.observations.some((frame) => frame.commands.some((command) => command.kind === "waitForWork"))).toBe(true)
  const original = run.observe().callbackTargets.find((target) => target.effect.kind === "jevSettled")!
  const restored = restore(run)
  for (const candidate of [run, restored]) candidate.advance({ untilTime: 20, maxEvents: 100 })
  expect(restored.observe()).toEqual(run.observe())
  const ready = run.observations.find((frame) => frame.commands.some((command) => command.kind === "finishReady"))!
  expect(ready.time).toBe(delay === 8 ? 10 : 11)
  const settled = run.observations.find((frame) => frame.event.kind === "jevRequestSettled")!
  expect(settled.time).toBe(2 + delay)
  if (delay === 10) {
    expect(settled.commands.map((command) => command.kind)).toEqual(["jevObservationIgnored"])
    const before = run.projection
    run.applyControl({ kind: "callback", action: "duplicate", target: original })
    run.advance({ untilTime: 20, maxEvents: 100 })
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestSettled").at(-1)?.rejection).toBe(
      "StaleOperation"
    )
    expect(run.projection).toEqual(before)
  }
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.dispatch.running).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  restore(run)
})

it("keeps a quiet round open while a collector owns it, then expires after release", () => {
  const run = createRun({
    retention: 1000,
    inputs: [
      { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
      { at: 12, kind: "edit", bytes: 10, unitBytes: [5] },
      {
        at: 8,
        kind: "canonical",
        event: { kind: "collectionClaimBackground", group: 1, token: 99, active: true, capacity: 1 }
      },
      {
        at: 25,
        kind: "canonical",
        event: { kind: "collectionExpireBackground", group: 1, token: 99, elapsed: 17, lifetime: 17 }
      }
    ],
    outcome: "clear",
    editPermitLimits: { perAdvicee: 2, resident: 2 },
    permitProfile: { outcome: "success", durationMs: 0, lifetimeMs: 30000 },
    lifecycles: { quietWindowMs: 10 }
  })
  run.advance({ untilTime: 24, maxEvents: 1000 })
  expect(run.projection.collection.claims).toEqual([{ group: 1, owner: 99 }])
  expect(run.observations.some((frame) => frame.commands.some((command) => command.kind === "quietRoundExpired"))).toBe(
    false
  )
  const restored = restore(run)
  for (const candidate of [run, restored]) expect(candidate.advance({ maxEvents: 1000 }).reason).toBe("idle")
  expect(restored.observe()).toEqual(run.observe())
  expect(
    run.observations.find((frame) => frame.commands.some((command) => command.kind === "quietRoundExpired"))?.time
  ).toBe(35)
  expect(run.projection.collection.claims).toEqual([])
  expect(run.projection.rounds).toEqual([])
})

it("changes the outcome of an original authorized output attempt without issuing another review", () => {
  const run = createRun({
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    session: { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 },
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" }],
    outputProfile: { outcome: "certain", delayMs: 5, leaseMs: 10 }
  })
  for (
    let fuel = 0;
    fuel < 100 && !run.observe().callbackTargets.some((target) => target.effect.kind === "outputTerminal");
    fuel++
  )
    run.step()
  const target = run.observe().callbackTargets.find((target) => target.effect.kind === "outputTerminal")!
  expect(target).toBeDefined()
  expect(run.projection.delivery.submissions.batches[0]?.phase).toBe("authorized")
  expect(run.projection.collection.leases).toHaveLength(1)
  run.applyControl({ kind: "outputAttempt", target, outcome: "uncertain" })
  const restored = restore(run)
  for (const candidate of [run, restored]) candidate.advance({ untilTime: 20, maxEvents: 100 })
  expect(restored.observe()).toEqual(run.observe())
  const terminal = run.observations.filter((frame) => frame.event.kind === "submissionTerminal")
  expect(terminal).toHaveLength(1)
  expect(terminal[0]?.event).toMatchObject({ certain: false })
  expect(run.projection.collection.leases).toEqual([])
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
})
