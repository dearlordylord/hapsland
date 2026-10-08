import { expect, it } from "vitest"
import { createRun, restoreReplay, type Run, type RunInput } from "./index.ts"
import { validateSharingControl, type SharingControl, type SharingScope } from "./sharing-controls.ts"

// Source-only central seam. Shared preparation must route BEFORE allocating
// unit reservations; joined members must not acquire a second review charge.
const apply = (run: Run, value: SharingControl) => run.applyControl(validateSharingControl(value))
const edit = (
  agent: string,
  at = 0,
  input = "same-prepared-identity",
  subject = "same-subject",
  revision = "same-input"
): RunInput => ({
  at,
  kind: "edit",
  agent,
  bytes: 10,
  unitBytes: [5],
  evaluationInputs: [input],
  revisionSubject: subject,
  revisionInput: revision
})
const config = (inputs: RunInput[], jevDelay = 30) => ({
  retention: 3000,
  inputs,
  sessions: [...new Set(inputs.flatMap((input) => ("agent" in input && input.agent ? [input.agent] : [])))].map(
    (agent, index) => ({
      agent,
      seed: index + 11,
      editIntervalMs: 1000000,
      variationMs: 0,
      editsPerTask: 1000,
      bytes: 10,
      unitBytes: [5]
    })
  ),
  preparationDelay: 2,
  jevDelay,
  outcome: "finding" as const,
  lifecycles: { reuse: { entryLimit: 8, byteLimit: 1 } }
})
const replay = (run: Run) =>
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
const member = (run: Run, index: number): SharingScope => {
  const frames = run.observations.filter((f) => f.event.kind === "beginObservedPreparation")
  const event = frames[index]?.event
  if (event?.kind !== "beginObservedPreparation") throw new Error("missing original admission")
  return { partition: event.partition, lifetime: event.lifetime, round: event.round, operation: event.observation }
}

it.each(["owner", "joined"] as const)(
  "leaving the %s member preserves the remaining evaluation and original physical request",
  (which) => {
    const run = createRun(config([edit("a"), edit("a")]))
    run.advance({ untilTime: 2, maxEvents: 500 })
    expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(1)
    expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
    expect(run.projection.revision.entries).toEqual([expect.objectContaining({ members: 2 })])
    const original = run.projection.dispatch.requests.map((r) => ({ ...r }))
    expect(original).toHaveLength(1)
    apply(run, { kind: "sharingMember", action: "leave", agent: "a", target: member(run, which === "owner" ? 0 : 1) })
    run.advance({ untilTime: 3, maxEvents: 100 })
    expect(run.projection.revision.entries).toEqual([expect.objectContaining({ members: 1 })])
    expect(run.projection.reuse.claims).toHaveLength(1)
    expect(run.projection.dispatch.requests).toEqual(original)
    expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
    run.advance({ untilTime: 33, maxEvents: 500 })
    expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(1)
    expect(run.projection.dispatch.requests).toEqual([])
    expect(run.projection.pendingFindings).toHaveLength(1)
    expect(
      run.observations.some(
        (f) => f.event.kind === "reuseMemberCheck" && f.outputs.some((c) => c.kind === "reuseSetMemberFinding")
      )
    ).toBe(true)
    replay(run)
  }
)

it("last-member departure removes logical ownership without fabricating physical settlement", () => {
  const run = createRun(config([edit("a"), edit("a")]))
  run.advance({ untilTime: 2, maxEvents: 500 })
  const original = run.projection.dispatch.requests.map((r) => ({ ...r }))
  apply(run, { kind: "sharingMember", action: "leaveAll", agent: "a", partition: 1, lifetime: 1 })
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(run.projection.reuse.claims).toEqual([])
  expect(run.projection.revision.entries).toEqual([])
  expect(run.projection.global).toEqual({ items: 0, bytes: 0 })
  expect(run.projection.dispatch.requests).toEqual(original)
  expect(run.observations.filter((f) => f.event.kind === "jevRequestSettled")).toEqual([])
  run.advance({ untilTime: 33, maxEvents: 500 })
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.projection.pendingFindings).toEqual([])
  expect(run.observations.some((f) => f.outputs.some((c) => c.kind === "jevObservationIgnored"))).toBe(true)
  expect(run.observations.some((f) => f.event.kind === "submissionTerminal")).toBe(false)
  replay(run)
})

it("the same complete prepared identity in another advicee partition owns a separate request", () => {
  const run = createRun(config([edit("a"), edit("b")]))
  run.advance({ untilTime: 2, maxEvents: 500 })
  expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(2)
  expect(run.projection.global).toEqual({ items: 2, bytes: 10 })
  const routes = run.observations.filter((f) => f.event.kind === "reuseRoute").map((f) => f.event)
  if (routes[0]?.kind !== "reuseRoute" || routes[1]?.kind !== "reuseRoute") throw new Error("missing original route")
  expect(routes[0].id).not.toBe(routes[1].id)
  apply(run, { kind: "sharingMember", action: "leaveAll", agent: "a", partition: 1, lifetime: 1 })
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  run.advance({ untilTime: 33, maxEvents: 500 })
  expect(run.observations.filter((f) => f.event.kind === "submissionTerminal").map((f) => f.partition)).toEqual([2])
  replay(run)
})

it("a new matching edit joins actual live advice without a second request or retained charge", () => {
  const run = createRun(config([edit("a"), edit("a", 10)], 5))
  run.advance({ untilTime: 7, maxEvents: 500 })
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  run.advance({ untilTime: 12, maxEvents: 500 })
  expect(run.observations.some((f) => f.outputs.some((c) => c.kind === "reuseAdviceJoined"))).toBe(true)
  expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(1)
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  replay(run)
})

it("a superseded joined member cannot consume the current owner's finding", () => {
  const run = createRun(
    config([
      edit("a", 0, "shared", "owner-subject", "owner-input"),
      edit("a", 0, "shared", "member-subject", "old"),
      edit("a", 3, "changed", "member-subject", "new")
    ])
  )
  run.advance({ untilTime: 2, maxEvents: 500 })
  const captured = member(run, 1)
  run.advance({ untilTime: 33, maxEvents: 800 })
  expect(
    run.observations.some(
      (f) => f.event.kind === "revisionRegister" && f.outputs.some((c) => c.kind === "revisionReplaced")
    )
  ).toBe(true)
  expect(
    run.observations.some(
      (f) => f.event.kind === "reuseMemberCheck" && f.outputs.some((c) => c.kind === "reuseKeepMember")
    )
  ).toBe(true)
  expect(
    run.projection.pendingFindings.filter((f) =>
      run.projection.work.some((w) => w.operation === f.operation && w.partition === captured.partition)
    )
  ).toHaveLength(1)
  expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(2)
  replay(run)
})

it.each([3, 17, 41, 97])("seeded finite member departure retains a healthy partition's progress (seed %i)", (seed) => {
  const delay = 10 + (seed % 7),
    run = createRun({ ...config([edit("a"), edit("a"), edit("b")], delay), seed })
  run.advance({ untilTime: 2, maxEvents: 600 })
  expect(run.projection.dispatch.requests).toHaveLength(2)
  expect(run.projection.global).toEqual({ items: 2, bytes: 10 })
  apply(run, { kind: "sharingMember", action: "leaveAll", agent: "a", partition: 1, lifetime: 1 })
  run.advance({ untilTime: 3, maxEvents: 200 })
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 })
  run.advance({ untilTime: delay + 3, maxEvents: 800 })
  expect(run.projection.dispatch.requests).toEqual([])
  expect(run.observations.filter((f) => f.event.kind === "submissionTerminal").map((f) => f.partition)).toEqual([2])
  expect(run.observations.filter((f) => f.event.kind === "jevRequestStarted")).toHaveLength(2)
  replay(run)
})
