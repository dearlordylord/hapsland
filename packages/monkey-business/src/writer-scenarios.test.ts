import { expect, it } from "vitest"
import { createRun, restoreReplay, type Run, type RunInput } from "./index.ts"
import { validateWriterControl, type WriterCapture, type WriterControl } from "./writer-controls.ts"

// Controls and replay use the public Run boundary; Canonical owns membership.
const apply = (run: Run, value: WriterControl) => run.applyControl(validateWriterControl(value))
const agent = "agent-1",
  target = { partition: 1, lifetime: 1, round: 1, token: 51 }
const capture = (lease = 20, token = 51): WriterCapture => ({
  target: { ...target, token },
  claimStarted: 0,
  claimLifetimeMs: lease,
  capacity: 2,
  response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 30, admittedBlock: false }
})
const terminal = (run: Run) => run.observations.filter((f) => f.event.kind === "submissionTerminal")
const replay = (run: Run) => {
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.queuedFacts).toEqual(run.queuedFacts)
  expect(restored.projection.global).toEqual(run.projection.global)
  expect(restored.projection.partitions).toEqual(run.projection.partitions)
  expect(restored.projection.collection.leases).toEqual(run.projection.collection.leases)
  expect(restored.projection.delivery).toEqual(run.projection.delivery)
  expect(restored.observations.filter((frame) => frame.preparation).map((frame) => frame.preparation)).toEqual(
    run.observations.filter((frame) => frame.preparation).map((frame) => frame.preparation)
  )
}
const opened = (lease = 20) => {
  const run = createRun({
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    inputs: [{ at: 0, kind: "edit", agent, bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  run.advance({ untilTime: 0, maxEvents: 100 })
  apply(run, { kind: "backgroundWriter", action: "claim", agent, capture: capture(lease) })
  return run
}

it("waits with one actual membership and no advice lease, then authorizes one current response", () => {
  const run = opened()
  run.advance({ untilTime: 6, maxEvents: 200 })
  expect(run.projection.collection.claims).toEqual([{ group: 1, owner: 51 }])
  expect(run.projection.collection.leases).toEqual([])
  expect(terminal(run)).toEqual([])
  run.advance({ untilTime: 7, maxEvents: 200 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(terminal(run)).toEqual([])
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
  run.advance({ untilTime: 8, maxEvents: 200 })
  expect(terminal(run)).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(1)
  replay(run)
})

it("coalesces a competing same-advicee trigger without replacing the original waiter or response", () => {
  const run = opened()
  apply(run, { kind: "backgroundWriter", action: "claim", agent, capture: capture(20, 52) })
  run.advance({ untilTime: 7, maxEvents: 200 })
  expect(run.projection.collection.claims).toEqual([{ group: 1, owner: 51 }])
  expect(run.observations.some((f) => f.commands.some((c) => c.kind === "collectionBackgroundRefused"))).toBe(true)
  apply(run, {
    kind: "backgroundWriter",
    action: "attempt",
    agent,
    target: { ...target, token: 52 },
    currentBlock: false
  })
  run.advance({ untilTime: 7, maxEvents: 100 })
  expect(terminal(run)).toEqual([])
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
  run.advance({ untilTime: 8, maxEvents: 100 })
  expect(terminal(run)).toHaveLength(1)
  replay(run)
})

it("wrong-token release preserves the live writer while an accepted release ends its response", () => {
  const run = opened()
  run.advance({ untilTime: 7, maxEvents: 200 })
  apply(run, { kind: "backgroundWriter", action: "release", agent, target: { ...target, token: 52 } })
  run.advance({ untilTime: 7, maxEvents: 100 })
  expect(run.projection.collection.claims).toEqual([{ group: 1, owner: 51 }])
  apply(run, { kind: "backgroundWriter", action: "release", agent, target })
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
  run.advance({ untilTime: 8, maxEvents: 100 })
  expect(run.projection.collection.claims).toEqual([])
  expect(terminal(run)).toEqual([])
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  replay(run)
})

it.each([6, 7, 8])(
  "samples writer expiry %i ms after claim before attempting current response authority",
  (elapsed) => {
    const run = opened(7)
    run.advance({ untilTime: elapsed, maxEvents: 200 })
    apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
    run.advance({ untilTime: elapsed + 1, maxEvents: 200 })
    // At t=6 no finding exists yet: claim remains, but no lease or output is
    // invented. At equality and after it, the original claim is gone.
    expect(terminal(run)).toEqual([])
    expect(run.projection.collection.leases).toEqual([])
    expect(run.projection.collection.claims).toEqual([])
    replay(run)
  }
)

it("a stale lifetime cannot release the current writer or borrow its response authority", () => {
  const run = opened()
  run.advance({ untilTime: 7, maxEvents: 200 })
  const stale = { ...target, lifetime: 2 }
  apply(run, { kind: "backgroundWriter", action: "release", agent, target: stale })
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target: stale, currentBlock: false })
  run.advance({ untilTime: 8, maxEvents: 100 })
  expect(run.projection.collection.claims).toEqual([{ group: 1, owner: 51 }])
  expect(terminal(run)).toEqual([])
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
  run.advance({ untilTime: 9, maxEvents: 100 })
  expect(terminal(run)).toHaveLength(1)
  replay(run)
})

// Seeds vary original preparation/backend timing and the ordering of competing
// public controls. Each ending exercises a different original writer lifecycle;
// the healthy participant supplies an explicit available-progress witness.
it.each([
  { seed: 3, ending: "release" },
  { seed: 17, ending: "expire" },
  { seed: 41, ending: "disconnect" },
  { seed: 97, ending: "remove" }
] as const)(
  "seeded public writer interleaving $seed ends by $ending without cancelling the healthy owner",
  ({ seed, ending }) => {
    const preparationDelay = 2 + (seed % 3),
      jevDelay = 3 + (seed % 4),
      readyAt = preparationDelay + jevDelay
    const cutoff = readyAt + 2,
      healthy = "healthy-writer",
      healthyTarget = { partition: 2, lifetime: 1, round: 2, token: 61 }
    const original = capture(cutoff),
      healthyCapture = {
        ...capture(cutoff + 10),
        target: healthyTarget,
        response: { ...original.response, partition: 2, lifetime: 1, round: 2 }
      }
    const run = createRun({
      seed,
      retention: 2000,
      preparationDelay,
      jevDelay,
      sessions: [agent, healthy].map((agent) => ({
        agent,
        editIntervalMs: 1000000,
        variationMs: 0,
        editsPerTask: 1000
      })),
      inputs: [agent, healthy].map((agent) => ({
        at: 0,
        kind: "edit" as const,
        agent,
        bytes: 10,
        unitBytes: [5],
        outcome: "finding" as const
      }))
    })
    const advance = (untilTime: number) => {
      const result = run.advance({ untilTime, maxEvents: 500 })
      expect(result.reason).not.toBe("eventLimit")
    }
    advance(0)
    apply(run, { kind: "backgroundWriter", action: "claim", agent, capture: original })
    apply(run, { kind: "backgroundWriter", action: "claim", agent: healthy, capture: healthyCapture })
    // The seed changes the order of real refused controls, not authority facts.
    const competing: WriterControl[] = [
      { kind: "backgroundWriter", action: "claim", agent, capture: { ...original, target: { ...target, token: 99 } } },
      { kind: "backgroundWriter", action: "release", agent, target: { ...target, token: 99 } }
    ]
    for (let index = 0; index < competing.length; index++) apply(run, competing[(index + seed) % competing.length]!)
    advance(0)
    expect(
      run
        .observe()
        .writerReports.filter((report) => report.issued)
        .map((report) => report.issued)
    ).toEqual([
      { id: 1, partition: 1, lifetime: 1, round: 1 },
      { id: 2, partition: 2, lifetime: 1, round: 2 }
    ])
    expect(run.projection.collection.claims).toEqual([
      { group: 2, owner: 61 },
      { group: 1, owner: 51 }
    ])
    expect(run.projection.collection.leases).toEqual([])
    expect(terminal(run)).toEqual([])
    advance(preparationDelay)
    expect(run.observations.filter((frame) => frame.event.kind === "preparationCompleted")).toHaveLength(2)
    expect(run.projection.dispatch.requests).toHaveLength(2)
    expect(run.projection.pendingFindings).toEqual([])
    advance(readyAt)
    expect(run.projection.pendingFindings).toHaveLength(2)
    expect(run.projection.dispatch.requests).toEqual([])
    expect(terminal(run)).toEqual([])
    if (ending === "expire") {
      advance(cutoff)
      apply(run, { kind: "backgroundWriter", action: "expire", agent, target })
    } else if (ending === "release") apply(run, { kind: "backgroundWriter", action: "release", agent, target })
    else run.applyControl({ kind: "adviceeLifecycle", agent, action: ending })
    apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
    apply(run, {
      kind: "backgroundWriter",
      action: "attempt",
      agent: healthy,
      target: healthyTarget,
      currentBlock: false
    })
    advance(ending === "expire" ? cutoff + 1 : readyAt + 1)
    expect(run.projection.collection.claims.some((claim) => claim.group === 1)).toBe(false)
    expect(run.projection.collection.claims.some((claim) => claim.group === 2 && claim.owner === 61)).toBe(true)
    expect(terminal(run)).toHaveLength(1)
    expect(terminal(run)[0]?.partition).toBe(2)
    expect(run.projection.collection.leases).toEqual([])
    expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(2)
    // Original issuance facts remain immutable even after departure/expiry.
    expect(
      run
        .observe()
        .writerReports.filter((report) => report.issued)
        .map((report) => report.issued)
    ).toEqual([
      { id: 1, partition: 1, lifetime: 1, round: 1 },
      { id: 2, partition: 2, lifetime: 1, round: 2 }
    ])
    replay(run)
  }
)

it.each([8, 7, 6])("original writer lease %i authorizes only a finding collected strictly before expiry", (lease) => {
  const run = opened(lease)
  run.advance({ untilTime: 7, maxEvents: 200 })
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
  run.advance({ untilTime: 8, maxEvents: 200 })
  expect(terminal(run)).toHaveLength(lease === 8 ? 1 : 0)
  expect(run.projection.collection.leases).toEqual([])
  replay(run)
})

it.each(["disconnect", "remove"] as const)(
  "%s releases only one background waiter and preserves the healthy advicee's work",
  (action) => {
    const other = "healthy-writer",
      otherTarget = { partition: 2, lifetime: 1, round: 2, token: 61 }
    const run = createRun({
      retention: 2000,
      preparationDelay: 2,
      jevDelay: 5,
      lifecycles: { reuse: { entryLimit: 8, byteLimit: 1 } },
      sessions: [agent, other].map((agent) => ({ agent, editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 })),
      inputs: [
        {
          at: 0,
          kind: "edit",
          agent,
          bytes: 10,
          unitBytes: [5],
          evaluationInputs: ["same-prepared"],
          revisionSubject: "same",
          revisionInput: "same",
          outcome: "finding"
        },
        {
          at: 0,
          kind: "edit",
          agent: other,
          bytes: 10,
          unitBytes: [5],
          evaluationInputs: ["same-prepared"],
          revisionSubject: "same",
          revisionInput: "same",
          outcome: "finding"
        }
      ]
    })
    run.advance({ untilTime: 0, maxEvents: 200 })
    apply(run, { kind: "backgroundWriter", action: "claim", agent, capture: capture(20) })
    apply(run, {
      kind: "backgroundWriter",
      action: "claim",
      agent: other,
      capture: {
        ...capture(20),
        target: otherTarget,
        response: {
          ...capture(20).response,
          partition: otherTarget.partition,
          lifetime: otherTarget.lifetime,
          round: otherTarget.round
        }
      }
    })
    run.advance({ untilTime: 7, maxEvents: 500 })
    expect(run.projection.collection.claims).toHaveLength(2)
    expect(terminal(run)).toEqual([])
    expect(
      run
        .observe()
        .writerReports.filter((report) => report.issued)
        .map((report) => report.issued)
    ).toEqual([
      { id: 1, partition: 1, lifetime: 1, round: 1 },
      { id: 2, partition: 2, lifetime: 1, round: 2 }
    ])
    const routes = run.observations.filter((frame) => frame.event.kind === "reuseRoute").map((frame) => frame.event)
    expect(routes).toHaveLength(2)
    if (routes[0]?.kind !== "reuseRoute" || routes[1]?.kind !== "reuseRoute")
      throw new Error("missing original reuse route")
    expect(routes[0].id).not.toBe(routes[1].id)
    run.applyControl({ kind: "adviceeLifecycle", agent, action })
    apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
    apply(run, { kind: "backgroundWriter", action: "attempt", agent: other, target: otherTarget, currentBlock: false })
    run.advance({ untilTime: 8, maxEvents: 500 })
    expect(run.projection.collection.claims.some((c) => c.group === 1)).toBe(false)
    expect(terminal(run)).toHaveLength(1)
    expect(terminal(run)[0]?.partition).toBe(2)
    expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(2)
    replay(run)
  }
)

it("records the original queued claim, actual grant frame and Engine-issued response", () => {
  const run = opened()
  expect(run.observe().writerReports).toEqual([
    {
      at: 0,
      controlSequence: 0,
      control: { kind: "backgroundWriter", action: "claim", agent, capture: capture() },
      result: "queued"
    }
  ])
  expect(run.projection.collection.claims).toEqual([])
  expect(run.projection.collection.leases).toEqual([])
  run.advance({ untilTime: 0, maxEvents: 100 })
  expect(run.observe().writerReports.at(-1)).toMatchObject({
    result: "applied",
    issued: { id: 1, partition: 1, lifetime: 1, round: 1 }
  })
  const frame = run.observations.find((frame) => frame.event.kind === "collectionClaimBackground")
  expect(frame?.before.collection.claims).toEqual([])
  expect(frame?.commands).toEqual([{ kind: "collectionBackgroundClaimed" }])
  expect(frame?.after.collection.claims).toEqual([{ group: 1, owner: 51 }])
  replay(run)
})

it("overlapping writer and explicit Edit response cannot lease one item together; writer release preserves authorized output", () => {
  const run = opened()
  run.applyControl({ kind: "outputProfile", outcome: "certain", delayMs: 5, leaseMs: 20 })
  run.advance({ untilTime: 7, maxEvents: 200 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  run.applyControl({
    kind: "collectionResponse",
    action: "open",
    agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 7, deadline: 30, admittedBlock: false }
  })
  expect(run.observe().collectionResponseReports.at(-1)?.issued).toEqual({ id: 2, partition: 1, lifetime: 1, round: 1 })
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
  run.applyControl({
    kind: "collectionResponse",
    action: "attempt",
    agent,
    target: { id: 2, partition: 1, lifetime: 1, round: 1 },
    currentBlock: false
  })
  run.advance({ untilTime: 7, maxEvents: 300 })
  expect(
    run.observations.filter(
      (frame) =>
        frame.event.kind === "collectionReserveLease" &&
        frame.commands.some((command) => command.kind === "collectionLeaseReserved")
    )
  ).toHaveLength(1)
  expect(terminal(run)).toEqual([])
  apply(run, { kind: "backgroundWriter", action: "release", agent, target })
  run.advance({ untilTime: 8, maxEvents: 100 })
  expect(run.projection.collection.claims).toEqual([])
  expect(terminal(run)).toEqual([])
  run.advance({ untilTime: 12, maxEvents: 200 })
  expect(terminal(run)).toHaveLength(1)
  expect(terminal(run)[0]?.event).toMatchObject({ kind: "submissionTerminal", certain: true })
  replay(run)
})

it("same-partition compatible members share one actual physical request while the writer waits without an advice lease", () => {
  const edit: RunInput = {
    at: 0,
    kind: "edit",
    agent,
    bytes: 10,
    unitBytes: [5],
    evaluationInputs: ["shared-original"],
    revisionSubject: "same",
    revisionInput: "same",
    outcome: "finding"
  }
  const run = createRun({
    retention: 3000,
    preparationDelay: 2,
    jevDelay: 10,
    inputs: [edit, { ...edit }],
    lifecycles: { reuse: { entryLimit: 8, byteLimit: 1 } }
  })
  run.advance({ untilTime: 0, maxEvents: 200 })
  apply(run, { kind: "backgroundWriter", action: "claim", agent, capture: capture(20) })
  run.advance({ untilTime: 2, maxEvents: 300 })
  expect(run.projection.revision.entries).toEqual([expect.objectContaining({ members: 2 })])
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  expect(run.projection.dispatch.requests).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  const begin = run.observations.find((frame) => frame.event.kind === "beginObservedPreparation")?.event
  if (begin?.kind !== "beginObservedPreparation") throw new Error("missing original shared member")
  run.applyControl({
    kind: "sharingMember",
    action: "leave",
    agent,
    target: { partition: begin.partition, lifetime: begin.lifetime, round: begin.round, operation: begin.observation }
  })
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(run.projection.revision.entries).toEqual([expect.objectContaining({ members: 1 })])
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  expect(run.projection.dispatch.requests).toHaveLength(1)
  run.advance({ untilTime: 12, maxEvents: 300 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  apply(run, { kind: "backgroundWriter", action: "attempt", agent, target, currentBlock: false })
  run.advance({ untilTime: 13, maxEvents: 200 })
  expect(terminal(run)).toHaveLength(1)
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  replay(run)
})

it("explicit synchronous Edit collection remains healthy while its background writer waits", () => {
  const run = opened()
  run.advance({ untilTime: 7, maxEvents: 200 })
  run.applyControl({
    kind: "collectionResponse",
    action: "open",
    agent,
    response: { partition: 1, lifetime: 1, round: 1, started: 7, deadline: 30, admittedBlock: false }
  })
  run.applyControl({
    kind: "collectionResponse",
    action: "attempt",
    agent,
    target: { id: 2, partition: 1, lifetime: 1, round: 1 },
    currentBlock: false
  })
  run.advance({ untilTime: 8, maxEvents: 200 })
  expect(terminal(run)).toHaveLength(1)
  expect(
    run.observations.filter((frame) => frame.event.kind === "submissionBegin").map((frame) => frame.event)
  ).toEqual([expect.objectContaining({ surface: "edit" })])
  expect(run.projection.collection.claims).toEqual([{ group: 1, owner: 51 }])
  replay(run)
})

it("Stop collection uses its independent original path while a background writer waits", () => {
  const run = opened()
  run.schedule({ at: 8, kind: "finish", agent })
  run.advance({ untilTime: 9, maxEvents: 300 })
  expect(
    run.observations.some(
      (frame) =>
        frame.event.kind === "finishReserve" && frame.commands.some((command) => command.kind === "finishReserved")
    )
  ).toBe(true)
  expect(run.observations.some((frame) => frame.event.kind === "finishTerminal")).toBe(true)
  expect(run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")).toHaveLength(1)
  replay(run)
})

it("wrong response scope refuses declaration without suppressing ordinary Edit progress", () => {
  const run = createRun({
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    inputs: [{ at: 0, kind: "edit", agent, bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  run.advance({ untilTime: 0, maxEvents: 100 })
  apply(run, {
    kind: "backgroundWriter",
    action: "claim",
    agent,
    capture: { ...capture(), target: { ...target, lifetime: 2 }, response: { ...capture().response, lifetime: 2 } }
  })
  expect(run.observe().writerReports.at(-1)?.result).toBe("wrongScope")
  run.advance({ untilTime: 8, maxEvents: 200 })
  expect(terminal(run)).toHaveLength(1)
  expect(run.projection.collection.claims).toEqual([])
  replay(run)
})
