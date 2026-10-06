import type { RoundRecords, RoundWork } from "@hapsland/resident-runtime/resident/round-records"
import { it } from "@effect/vitest"
import { expect } from "vitest"
import { Cause, Deferred, Effect, Exit } from "effect"
import { makeDispatcher } from "@hapsland/resident-runtime/resident/dispatch"
import { makeResidentState } from "@hapsland/resident-runtime/resident/capacity"
import { advicee } from "../direct-event/test-fixtures.ts"

const defectMessage = <A>(effect: Effect.Effect<A>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    if (Exit.isSuccess(exit)) throw new Error("expected a resident invariant defect")
    return Cause.pretty(exit.cause)
  })

const snapshotRound = (rounds: RoundRecords, round: RoundWork) =>
  Effect.gen(function* () {
    const snapshot = yield* rounds.snapshot(round)
    if (snapshot === undefined) throw new Error("missing fixture round snapshot")
    return snapshot
  })

const activity = { root: "/fixture", advicee: advicee(), activityPath: undefined }
const counts = { named: { queued: 1, running: 0 }, all: { queued: 2, running: 3 }, cancelled: 1, hasUnnamed: false }

it.effect("serializes concurrent round binding, replacement and retirement without losing ownership", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0))?.generation
    if (generation === undefined) throw new Error("fixture edit admission refused")
    const bound = yield* Effect.all(
      Array.from({ length: 16 }, (_, index) => owner.rounds.bind("agent", generation, activity, `cohort-${index}`)),
      { concurrency: "unbounded" }
    )
    const round = bound[0]
    if (round === undefined) throw new Error("missing bound round")
    expect(bound.every((capability) => capability === round)).toBe(true)
    const replacements = yield* Effect.all(
      Array.from({ length: 16 }, (_, index) =>
        owner.rounds.replaceWork(round, { id: `replacement-${index}`, controller: new AbortController() }, counts)
      ),
      { concurrency: "unbounded" }
    )
    expect(replacements.every((replacement) => replacement?.matched === true)).toBe(true)
    expect(new Set(replacements.map((replacement) => replacement?.previousWork)).size).toBe(16)
    expect((yield* snapshotRound(owner.rounds, round)).discarded).toEqual({ queued: 16, running: 0 })
    const retired = yield* Effect.all(
      Array.from({ length: 16 }, () => owner.rounds.retire(round)),
      { concurrency: "unbounded" }
    )
    expect(retired.filter(Boolean)).toHaveLength(1)
    expect(yield* owner.rounds.entries()).toEqual([])
    expect((yield* owner.canonicalProjection()).rounds).toEqual([])
  })
)

it.effect("binds immutable handles and activity to the canonical admission generation", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0))?.generation
    if (generation === undefined) throw new Error("fixture edit admission refused")
    const round = yield* owner.rounds.bind("agent", generation, activity, "first-cohort")
    expect(round.canonicalRound).toBe(yield* owner.currentRoundId("agent"))
    expect(yield* owner.rounds.get("agent")).toBe(round)
    expect(Object.isFrozen(round)).toBe(true)
    expect(Object.isFrozen((yield* snapshotRound(owner.rounds, round)).work)).toBe(true)
    expect(Object.isFrozen((yield* snapshotRound(owner.rounds, round)).discarded)).toBe(true)
    expect(Object.isFrozen((yield* owner.rounds.activity(round))?.advicee)).toBe(true)
    expect(Reflect.set(round, "work", { id: "forged", controller: new AbortController() })).toBe(false)
    const updated = yield* owner.rounds.bind(
      "agent",
      generation,
      { ...activity, activityPath: "/new/activity" },
      "unused-cohort"
    )
    expect(updated).toBe(round)
    expect((yield* snapshotRound(owner.rounds, updated)).work.id).toBe("first-cohort")
    expect((yield* owner.rounds.activity(round))?.activityPath).toBe("/new/activity")
  })
)

it.effect("rejects missing or mismatched canonical authority without publishing identities", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const before = yield* owner.canonicalProjection()
    expect(yield* defectMessage(owner.rounds.bind("agent", 1, activity, "cohort"))).toContain(
      "canonical admission generation"
    )
    expect(yield* owner.canonicalProjection()).toEqual(before)
    expect(yield* owner.knownPartitionId("agent")).toBeUndefined()
    expect(yield* owner.currentRoundId("agent")).toBeUndefined()
    expect(yield* owner.rounds.entries()).toEqual([])
    const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0))?.generation
    if (generation === undefined) throw new Error("fixture edit admission refused")
    const admitted = yield* owner.canonicalProjection()
    expect(yield* defectMessage(owner.rounds.bind("agent", generation + 1, activity, "cohort"))).toContain(
      "canonical admission generation"
    )
    expect(yield* owner.canonicalProjection()).toEqual(admitted)
    expect(yield* owner.rounds.entries()).toEqual([])
  })
)

it.effect("rolls back native binding and preserves a prior activity snapshot on construction failure", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0))?.generation
    if (generation === undefined) throw new Error("fixture edit admission refused")
    const before = yield* owner.canonicalProjection()
    const broken = {
      ...activity,
      get root(): string {
        throw new Error("activity construction failed")
      }
    }
    expect(yield* defectMessage(owner.rounds.bind("agent", generation, broken, "failed-cohort"))).toContain(
      "activity construction failed"
    )
    expect(yield* owner.canonicalProjection()).toEqual(before)
    expect(yield* owner.rounds.get("agent")).toBeUndefined()
    const round = yield* owner.rounds.bind("agent", generation, activity, "cohort")
    const snapshot = yield* owner.rounds.activity(round)
    expect(yield* defectMessage(owner.rounds.bind("agent", generation, broken, "unused"))).toContain(
      "activity construction failed"
    )
    expect(yield* owner.rounds.activity(round)).toBe(snapshot)
    expect(yield* owner.rounds.get("agent")).toBe(round)
  })
)

it.effect("publishes cohort replacement and the Bend-selected discard counts together", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0))?.generation
    if (generation === undefined) throw new Error("fixture edit admission refused")
    const round = yield* owner.rounds.bind("agent", generation, activity, "first")
    const before = yield* snapshotRound(owner.rounds, round)
    const first = before.work
    const next = { id: "next", controller: new AbortController() }
    expect(yield* owner.rounds.replaceWork(round, next, counts)).toEqual({ matched: true, previousWork: first })
    expect((yield* snapshotRound(owner.rounds, round)).work).toEqual(next)
    expect((yield* snapshotRound(owner.rounds, round)).discarded).toEqual({ queued: 1, running: 0 })
    expect(first.controller.signal.aborted).toBe(false)
    expect(before.work).toBe(first)
    expect(before.discarded).toEqual({ queued: 0, running: 0 })
    expect(Object.isFrozen(before)).toBe(true)
    expect(
      (yield* owner.rounds.replaceWork(
        round,
        { id: "last", controller: new AbortController() },
        { ...counts, named: { queued: 0, running: 0 }, hasUnnamed: true }
      ))?.matched
    ).toBe(false)
    expect((yield* snapshotRound(owner.rounds, round)).discarded).toEqual({ queued: 3, running: 3 })
    expect((yield* snapshotRound(owner.rounds, round)).work.id).toBe("last")
  })
)

it.effect("publishes no replacement or discarded counts when native cohort construction fails", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0))?.generation
    if (generation === undefined) throw new Error("fixture edit admission refused")
    const round = yield* owner.rounds.bind("agent", generation, activity, "cohort")
    const first = (yield* snapshotRound(owner.rounds, round)).work
    const before = yield* owner.canonicalProjection()
    expect(
      yield* defectMessage(
        owner.rounds.replaceWork(
          round,
          {
            get id(): string {
              throw new Error("cohort construction failed")
            },
            controller: new AbortController()
          },
          counts
        )
      )
    ).toContain("cohort construction failed")
    expect((yield* snapshotRound(owner.rounds, round)).work).toBe(first)
    expect((yield* snapshotRound(owner.rounds, round)).discarded).toEqual({ queued: 0, running: 0 })
    expect(yield* owner.canonicalProjection()).toEqual(before)
  })
)

it.effect("retires canonical and native ownership together and fences identity reuse after clear", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState()
    const firstGeneration = (yield* owner.delivery().admitEdit("agent", "first", 0))?.generation
    if (firstGeneration === undefined) throw new Error("fixture edit admission refused")
    const first = yield* owner.rounds.bind("agent", firstGeneration, activity, "first")
    expect(yield* owner.rounds.retire(first)).toBe(true)
    expect(yield* owner.currentRoundId("agent")).toBeUndefined()
    expect(yield* owner.rounds.entries()).toEqual([])
    expect((yield* owner.canonicalProjection()).rounds).toEqual([])
    yield* owner.clear()
    const nextGeneration = (yield* owner.delivery().admitEdit("agent", "next", 0))?.generation
    if (nextGeneration === undefined) throw new Error("fixture edit admission refused")
    const next = yield* owner.rounds.bind("agent", nextGeneration, activity, "next")
    expect(next.canonicalRound).toBe(first.canonicalRound)
    const beforeObservation = yield* owner.rounds.policyWork(next)
    yield* owner.admitObservation("agent", next.canonicalRound)
    expect(beforeObservation.unfinished()).toBe(0)
    expect((yield* owner.rounds.policyWork(next)).unfinished()).toBe(1)
    expect(yield* owner.rounds.snapshot(first)).toBeUndefined()
    expect(yield* owner.rounds.snapshot({ ...next })).toBeUndefined()
    expect((yield* owner.rounds.policyWork({ ...next })).unfinished()).toBe(0)
    expect((yield* owner.rounds.policyWork(first)).unfinished()).toBe(0)
    const before = yield* owner.canonicalProjection()
    expect(yield* owner.rounds.retire(first)).toBe(false)
    expect(
      yield* owner.rounds.replaceWork(first, { id: "forged", controller: new AbortController() }, counts)
    ).toBeUndefined()
    expect(yield* owner.rounds.activity(first)).toBeUndefined()
    expect(yield* owner.canonicalProjection()).toEqual(before)
    expect(yield* owner.rounds.get("agent")).toBe(next)
    expect((yield* snapshotRound(owner.rounds, next)).work.id).toBe("next")
  })
)

it.effect("retains round metadata until outstanding physical dispatch work settles before clear", () =>
  Effect.gen(function* () {
    const owner = yield* makeResidentState<never, string, { readonly operation: number; readonly round: number }>()
    const generation = (yield* owner.delivery().admitEdit("agent", "edit", 0))?.generation
    if (generation === undefined) throw new Error("fixture edit admission refused")
    const round = yield* owner.rounds.bind("agent", generation, activity, "cohort")
    const started = yield* Deferred.make<void>()
    const finish = yield* Deferred.make<void>()
    const dispatch = yield* makeDispatcher(
      owner,
      (job) => job,
      () =>
        Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(finish)
        })
    )
    yield* Effect.gen(function* () {
      const operation = yield* owner.admitObservation("agent", round.canonicalRound)
      expect(yield* dispatch.enqueue("agent", { operation, round: round.canonicalRound })).toBe(true)
      yield* Deferred.await(started)
      round.controller.abort()
      ;(yield* snapshotRound(owner.rounds, round)).work.controller.abort()
      yield* dispatch.close()
      expect(() => Effect.runSync(owner.clear())).toThrow("outstanding native dispatch jobs")
      expect(yield* owner.rounds.get("agent")).toBe(round)
      expect((yield* owner.rounds.activity(round))?.root).toBe("/fixture")
      expect((yield* dispatch.snapshot()).running).toBe(1)
      yield* Deferred.succeed(finish, undefined)
      yield* dispatch.whenIdle()
      yield* owner.clear()
      expect(yield* owner.rounds.entries()).toEqual([])
      expect(yield* owner.rounds.activity(round)).toBeUndefined()
      expect((yield* owner.rounds.policyWork(round)).unfinished()).toBe(0)
    }).pipe(Effect.ensuring(Deferred.succeed(finish, undefined)))
  })
)
