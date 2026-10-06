import { providerIdentity } from "@hapsland/review-definition/review-providers/catalog"
import { expect, it } from "@effect/vitest"
import { Cause, Effect } from "effect"
import {
  freezeInput,
  freezeRules,
  semanticIdentity,
  type PreparedUnit
} from "@hapsland/review-definition/direct-event/model"
import { advicee } from "../direct-event/test-fixtures.ts"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { makeResidentState } from "@hapsland/resident-runtime/resident/capacity"

it.effect("bounds connection leases and fences foreign and duplicate release", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState(undefined, "same-lifetime")
    const foreign = yield* makeResidentState(undefined, "same-lifetime")
    const read = owner.runtime.snapshot()
    const initial = yield* read
    expect(initial.connections).toBe(0)
    const connection = (yield* owner.runtime.openConnection(1))!
    const other = (yield* foreign.runtime.openConnection(1))!
    expect(Object.isFrozen(connection)).toBe(true)
    expect(yield* owner.runtime.openConnection(1)).toBeUndefined()
    expect(yield* owner.runtime.releaseConnection(other)).toBe(false)
    expect((yield* read).connections).toBe(1)
    expect(initial.connections).toBe(0)
    expect(yield* owner.runtime.releaseConnection(connection)).toBe(true)
    expect(yield* owner.runtime.releaseConnection(connection)).toBe(false)
    expect((yield* read).connections).toBe(0)
    expect((yield* foreign.runtime.snapshot()).connections).toBe(1)
  })
)

it.effect("publishes canonical cleanup and retirement together", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const outcome = yield* owner.runtime.cleanup(() => 10)
    expect(outcome).toBe("cleaned")
    expect((yield* owner.runtime.snapshot()).lifecycle).toBe("retiring")
    expect((yield* owner.canonicalProjection()).dispatch.closed).toBe(true)
    expect(yield* owner.runtime.scheduleRetirement()).toBe(true)
    expect(yield* owner.runtime.scheduleRetirement()).toBe(false)
    expect(yield* owner.runtime.cleanup(() => 10)).toBe("busy")
  })
)

it.effect("busy ownership does not retire the runtime or release reservations", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const reservation = (yield* owner.reserve("fixture", 10, "preparation"))!
    const before = yield* owner.canonicalProjection()
    const outcome = yield* owner.runtime.cleanup(() => 10)
    expect(outcome).toBe("busy")
    expect(yield* owner.canonicalProjection()).toEqual(before)
    expect((yield* owner.runtime.snapshot()).lifecycle).toBe("active")
    expect((yield* owner.snapshot()).bytes).toBe(10)
    expect(yield* owner.runtime.scheduleRetirement()).toBe(false)
    expect(yield* owner.release(reservation)).toBe(true)
    expect(yield* owner.runtime.cleanup(() => 10)).toBe("cleaned")
  })
)

it.effect("keeps connection ownership and immutable statistics through physical cleanup", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const connection = (yield* owner.runtime.openConnection(2))!
    const snapshot = yield* owner.runtime.snapshot()
    expect(Object.isFrozen(snapshot)).toBe(true)
    const reservation = (yield* owner.reserve("fixture", 20, "preparation"))!
    yield* owner.runtime.observePreparedUnits(3)
    yield* owner.runtime.rejectCapacity()
    expect(yield* owner.runtime.nextAuthoritySequence()).toBe(1)
    expect(yield* owner.runtime.nextAuthoritySequence()).toBe(2)
    expect(snapshot.peakLedgerBytes).toBe(0)
    yield* owner.release(reservation)
    yield* owner.runtime.close()
    yield* owner.clear()
    expect(yield* owner.runtime.snapshot()).toMatchObject({
      lifecycle: "closed",
      connections: 1,
      rejectedCapacity: 1,
      peakLedgerBytes: 20,
      maxMaterializedPreparedUnits: 3
    })
    expect(yield* owner.runtime.releaseConnection(connection)).toBe(true)
    expect((yield* owner.runtime.snapshot()).connections).toBe(0)
  })
)

it.effect("two connected clients keep cleanup busy until one physically closes", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const first = (yield* owner.runtime.openConnection(2))!
    yield* owner.runtime.openConnection(2)
    expect(yield* owner.runtime.cleanup(() => 10)).toBe("busy")
    yield* owner.runtime.releaseConnection(first)
    expect(yield* owner.runtime.cleanup(() => 10)).toBe("cleaned")
  })
)

it.effect("records transient reservation peaks without a server sampling checkpoint", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const capture = (yield* owner.reserve("capture", 128, "preparation"))!
    expect((yield* owner.runtime.snapshot()).peakLedgerBytes).toBe(128)
    expect(yield* owner.resize(capture, 5)).toBe(true)
    const concurrent = (yield* owner.reserve("other", 200, "preparation"))!
    expect((yield* owner.runtime.snapshot()).peakLedgerBytes).toBe(205)
    yield* owner.release(capture)
    yield* owner.release(concurrent)
    expect((yield* owner.snapshot()).bytes).toBe(0)
    expect(yield* owner.reserve("other", 1_000_000_000, "preparation")).toBeUndefined()
    expect(yield* owner.resize(concurrent, 1_000)).toBe(false)
    yield* owner.clear()
    expect((yield* owner.runtime.snapshot()).peakLedgerBytes).toBe(205)
  })
)

const cacheFixture = Effect.gen(function* () {
  const owner = yield* makeResidentState()
  const declaration = {
    id: "count.ts::Count",
    kind: "type-alias" as const,
    name: "Count",
    source: "type Count = number",
    sourceHash: "source"
  }
  const input = freezeInput({
    providerIdentity: providerIdentity({ provider: "jev" }),
    contract: TYPE_INPUT_CONTRACT,
    completeness: "complete",
    path: "count.ts",
    declaration,
    unit: { root: { artifact: declaration, references: [] } },
    rules: freezeRules([]),
    interpretation: "probability-strictly-greater-than-threshold"
  })
  const prepared: PreparedUnit = { root: "/fixture", advicee: advicee(), input, identity: semanticIdentity(input) }
  const reuse = owner.reuse(() => 10)
  const key = reuse.key("agent", prepared)
  const evaluation = { prepared, findings: [] }
  expect(yield* reuse.put("agent", key, evaluation)).toBe(true)
  return { owner, reuse, key, evaluation }
})

it.effect("retires the cached payload and its reservation with canonical cleanup", () =>
  Effect.gen(function* () {
    const { owner, reuse, key } = yield* cacheFixture
    expect((yield* owner.snapshot()).bytes).toBe(10)
    expect(yield* owner.runtime.cleanup(() => 10)).toBe("cleaned")
    expect(yield* reuse.get(key)).toBeUndefined()
    expect(yield* reuse.snapshot()).toEqual({ entries: 0, bytes: 0, pending: 0 })
    expect((yield* owner.snapshot()).bytes).toBe(0)
    expect((yield* owner.canonicalProjection()).dispatch.closed).toBe(true)
    expect((yield* owner.runtime.snapshot()).lifecycle).toBe("retiring")
  })
)

it.effect("refuses retirement when canonical cache ownership disagrees with the native payload", () =>
  Effect.gen(function* () {
    const { owner, reuse, key, evaluation } = yield* cacheFixture
    // Fault injection: remove only the canonical cache record. The native payload
    // and reservation still belong to this resident and must not be released.
    yield* owner.transition({ kind: "cacheClear" })
    const before = yield* owner.canonicalProjection()
    const capacity = yield* owner.snapshot()
    const outcome = yield* Effect.exit(owner.runtime.cleanup(() => 10))
    expect(outcome._tag).toBe("Failure")
    if (outcome._tag === "Failure") expect(Cause.pretty(outcome.cause)).toContain("native evaluation handles")
    expect(yield* owner.canonicalProjection()).toEqual(before)
    expect(yield* owner.snapshot()).toEqual(capacity)
    expect((yield* reuse.cached(key))?.evaluation).toBe(evaluation)
    expect((yield* owner.runtime.snapshot()).lifecycle).toBe("active")
  })
)
