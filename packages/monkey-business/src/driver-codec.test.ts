import { encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/canonical-boundary"
import { expect, it } from "vitest"
import { decodeDriverEvent, decodePreparedDriverContext } from "./driver-codec.ts"
const member = (state: unknown) => ({
  $: "Canonical.ReuseMemberCheck",
  joined_state: state,
  stale_unavailable: false,
  has_revision: true,
  has_advice_id: true
})
it.each(["Pending", "Clear", "Finding", "Unavailable"])("decodes exact joined %s facts immutably", (state) => {
  const event = decodeDriverEvent(member({ $: `Reuse.Joined${state}` }))
  expect(event).toEqual({
    kind: "reuseMemberCheck",
    state: state.toLowerCase(),
    staleUnavailable: false,
    hasRevision: true,
    hasAdviceId: true
  })
  expect(Object.isFrozen(event)).toBe(true)
  expect(() => decodeDriverEvent(member({ $: `Reuse.Joined${state}`, extra: 1 }))).toThrow()
})
it("rejects unknown joined tags and malformed whole events", () => {
  expect(() => decodeDriverEvent(member({ $: "Reuse.toString" }))).toThrow()
  expect(() => decodeDriverEvent({ ...member({ $: "Reuse.JoinedFinding" }), has_revision: 1 })).toThrow()
  expect(() =>
    decodeDriverEvent({ $: "Canonical.StartReview", partition: 1, lifetime: 1, round: 1, operation: 0 })
  ).toThrow()
})

const quietFacts = {
  $: "Quiescence.Facts",
  native_work_idle: true,
  advice_empty: false,
  handoff_idle: true,
  stop_absent: false
}
const quietTick = (facts: unknown) => ({
  $: "Canonical.QuietRoundTick",
  partition: 1,
  lifetime: 2,
  round: 3,
  now: 10,
  window: 5,
  facts
})
it("decodes complete quiet ownership facts without changing scope or clock", () => {
  const event = decodeDriverEvent(quietTick(quietFacts))
  expect(event).toEqual({
    kind: "quietRoundTick",
    partition: 1,
    lifetime: 2,
    round: 3,
    now: 10,
    window: 5,
    facts: { nativeWorkIdle: true, adviceEmpty: false, handoffIdle: true, stopAbsent: false }
  })
  expect(Object.isFrozen(event)).toBe(true)
  if (event.kind !== "quietRoundTick") throw new Error("wrong event")
  expect(Object.isFrozen(event.facts)).toBe(true)
  for (const field of ["native_work_idle", "advice_empty", "handoff_idle", "stop_absent"]) {
    const missing: Record<string, unknown> = { ...quietFacts }
    delete missing[field]
    expect(() => decodeDriverEvent(quietTick(missing))).toThrow()
    expect(() => decodeDriverEvent(quietTick({ ...quietFacts, [field]: 1 }))).toThrow()
  }
  expect(() => decodeDriverEvent(quietTick({ ...quietFacts, extra: 1 }))).toThrow()
  expect(() => decodeDriverEvent(quietTick({ ...quietFacts, $: "Admission.ProspectiveFacts" }))).toThrow()
})
it("keeps permit facts distinct from quiet facts and validates the complete permit shape", () => {
  const facts = {
    $: "Admission.ProspectiveFacts",
    clock_valid: true,
    hook_window: 10,
    started_upper: 0,
    now_lower: 0,
    advicee_permit_limit: 2,
    resident_permit_limit: 4
  }
  const permit = (facts: unknown) => ({
    $: "Canonical.IssuePermit",
    partition: 1,
    lifetime: 1,
    tool: 7,
    started: 0,
    deadline: 10,
    now: 0,
    minimum_started: 0,
    facts
  })
  expect(decodeDriverEvent(permit(facts))).toEqual({
    kind: "issuePermit",
    partition: 1,
    lifetime: 1,
    tool: 7,
    started: 0,
    deadline: 10,
    now: 0,
    minimumStarted: 0,
    facts: {
      clockValid: true,
      hookWindow: 10,
      startedUpper: 0,
      nowLower: 0,
      adviceePermitLimit: 2,
      residentPermitLimit: 4
    }
  })
  expect(() => decodeDriverEvent(permit(quietFacts))).toThrow()
  expect(() => decodeDriverEvent(permit({ ...facts, extra: 1 }))).toThrow()
  expect(() => decodeDriverEvent(quietTick(facts))).toThrow()
  for (const field of [
    "clock_valid",
    "hook_window",
    "started_upper",
    "now_lower",
    "advicee_permit_limit",
    "resident_permit_limit"
  ]) {
    const missing: Record<string, unknown> = { ...facts }
    delete missing[field]
    expect(() => decodeDriverEvent(permit(missing))).toThrow()
  }
  expect(() => decodeDriverEvent(permit({ ...facts, clock_valid: 1 }))).toThrow()
  expect(() => decodeDriverEvent(permit({ ...facts, hook_window: -1 }))).toThrow()
  expect(() => decodeDriverEvent({ ...quietTick(quietFacts), $: "Canonical.CompleteObservation" })).toThrow()
})

it("decodes complete original Finish reservation facts and rejects malformed boundaries", () => {
  const wire = {
    $: "Canonical.FinishReserve",
    group: 7,
    lifetime: 2,
    round: 3,
    attempt: 4,
    token: 5,
    selected: { $: "Con", head: 11, tail: { $: "Con", head: 13, tail: { $: "Nil" } } },
    has_notice: true,
    pass_notices: false,
    can_write: true,
    binding_valid: false,
    deadline_reached: true
  }
  const event = decodeDriverEvent(wire)
  expect(event).toEqual({
    kind: "finishReserve",
    group: 7,
    lifetime: 2,
    round: 3,
    attempt: 4,
    token: 5,
    selected: [11, 13],
    hasNotice: true,
    passNotices: false,
    canWrite: true,
    bindingValid: false,
    deadlineReached: true
  })
  expect(Object.isFrozen(event)).toBe(true)
  if (event.kind !== "finishReserve") throw new Error("wrong event")
  expect(Object.isFrozen(event.selected)).toBe(true)
  for (const field of ["has_notice", "pass_notices", "can_write", "binding_valid", "deadline_reached"]) {
    const missing: Record<string, unknown> = { ...wire }
    delete missing[field]
    expect(() => decodeDriverEvent(missing)).toThrow()
    expect(() => decodeDriverEvent({ ...wire, [field]: 1 })).toThrow()
  }
  expect(() => decodeDriverEvent({ ...wire, extra: 1 })).toThrow()
  expect(() => decodeDriverEvent({ ...wire, group: 0 })).toThrow()
})

it.each(["StopGroupPolled", "StopGroupEnded"])("decodes exact %s scope lists and rejects malformed scopes", (tag) => {
  const scope = { $: "Canonical.StopScope", partition: 7, round: 3 }
  const list = (items: unknown[]) =>
    items.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const wire = {
    $: `Canonical.${tag}`,
    group: 9,
    lifetime: 2,
    round: 4,
    scopes: list([scope]),
    ...(tag === "StopGroupPolled" ? { deadline: true, extra_pending: false, continuations: 2 } : {})
  }
  const event = decodeDriverEvent(wire)
  expect(event).toEqual({
    kind: tag === "StopGroupPolled" ? "stopGroupPolled" : "stopGroupEnded",
    group: 9,
    lifetime: 2,
    round: 4,
    scopes: [{ partition: 7, round: 3 }],
    ...(tag === "StopGroupPolled" ? { deadline: true, extraPending: false, continuations: 2 } : {})
  })
  expect(Object.isFrozen(event)).toBe(true)
  if (event.kind !== "stopGroupPolled" && event.kind !== "stopGroupEnded") throw new Error("wrong event")
  expect(Object.isFrozen(event.scopes)).toBe(true)
  expect(Object.isFrozen(event.scopes[0])).toBe(true)
  for (const malformed of [
    { ...scope, $: "Canonical.StopPolled" },
    { $: "Canonical.StopScope", partition: 7 },
    { ...scope, extra: 1 },
    { ...scope, round: false },
    { ...scope, partition: 0 },
    7
  ]) {
    expect(() => decodeDriverEvent({ ...wire, scopes: list([malformed]) })).toThrow()
  }
  expect(() => decodeDriverEvent({ ...wire, scopes: 7 })).toThrow()
  expect(() => decodeDriverEvent({ ...wire, scopes: list(Array.from({ length: 1025 }, () => scope)) })).toThrow()
  expect(() => decodeDriverEvent({ ...wire, extra: 1 })).toThrow()
  if (tag === "StopGroupPolled") expect(() => decodeDriverEvent({ ...wire, extra_pending: 1 })).toThrow()
})

it("preserves a complete sampled receipt and rejects malformed provenance", () => {
  const none = { $: "None" }
  const selected = { $: "Canonical.RequestFinding" }
  const context = {
    $: "Driver.Context",
    partition: 2,
    lifetime: 3,
    round: 4,
    bytes: 10,
    job: false,
    jev_delay: 8,
    outcome: { $: "Some", value: selected },
    current_work: true,
    credential_ready: true,
    credential_generation: true,
    source_readable: true,
    advice_lifetime: 600000,
    candidate: none,
    automatic_collection: true,
    automatic_review: false,
    automatic_output: true,
    output_certain: true,
    output_delay: 0,
    output_lease: 30,
    background: false,
    automatic_dispatch: true
  }
  const receipt = {
    $: "Some",
    value: {
      $: "Driver.OutcomeReceipt",
      partition: 2,
      lifetime: 3,
      round: 4,
      operation: 5,
      request: 6,
      outcome: selected,
      source: { $: "Driver.Sampled" },
      job: {
        $: "Some",
        value: {
          $: "Driver.SourceJob",
          partition: 1,
          lifetime: 7,
          bytes: 10,
          units: { $: "Con", head: 5, tail: { $: "Nil" } },
          outcome: none
        }
      },
      stream_before: { $: "Some", value: 123 },
      stream_after: { $: "Some", value: 456 }
    }
  }
  const result = decodePreparedDriverContext(context, receipt)
  expect(result).toEqual({ context, receipt })
  expect(Object.isFrozen(result)).toBe(true)
  for (const malformed of [
    { ...receipt, extra: true },
    { $: "Some", value: { ...receipt.value, source: { $: "Driver.Unknown" } } },
    { $: "Some", value: { ...receipt.value, stream_after: { $: "Some", value: 2 ** 32 } } },
    { $: "Some", value: { ...receipt.value, job: { $: "Some", value: { ...receipt.value.job.value, units: false } } } }
  ])
    expect(() => decodePreparedDriverContext(context, malformed)).toThrow()
  expect(() => decodePreparedDriverContext({ ...context, job: 1 }, receipt)).toThrow()
  expect(() =>
    decodePreparedDriverContext({ ...context, outcome: { $: "Some", value: { ...selected, extra: 1 } } }, receipt)
  ).toThrow()
})

it("decodes collection order facts without accepting extra fields", () => {
  const facts = { $: "Canonical.CollectionOrderCheck", left_sequence: 1, right_sequence: 2 }
  expect(decodeDriverEvent(facts)).toEqual({ kind: "collectionOrderCheck", leftSequence: 1, rightSequence: 2 })
  expect(() => decodeDriverEvent({ ...facts, unrelated: 1 })).toThrow()
})

// Public collection decisions transport every issuance and current-state field exactly.
it("round-trips collection finding facts without accepting excess event fields", () => {
  const event = {
    kind: "collectionFindingCheck" as const,
    selectionPartition: 1,
    selectionRound: 3,
    unit: 2,
    partition: 1,
    round: 3,
    snapshot: 7,
    currentSnapshot: 8,
    credential: 2,
    currentCredential: 3,
    ageMs: 599999,
    soloBytes: 100,
    collectionReady: true,
    selectedCount: 1,
    prospectiveBytes: 200
  }
  const encoded = encodeCanonicalEvent(event)
  expect(decodeDriverEvent(encoded)).toEqual(event)
  expect(() => decodeDriverEvent({ ...(encoded as Record<string, unknown>), unexpected: 1 })).toThrow()
})
