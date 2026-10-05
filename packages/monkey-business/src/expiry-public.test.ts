import { expect, it } from "vitest"
import { createRun, replayRun } from "./index.ts"
import { collectNotice as collect, reportNotice as report, makeExpiryRun as makeRun } from "./expiry-public.fixture.ts"

it("repeated lease after a profile change keeps the original deadline", () => {
  const run = makeRun([2, 3, 4], 100, 20)
  report(run, 1, 101)
  run.advance({ untilTime: 2, maxEvents: 100 })
  const lease = { kind: "noticeLease", target: { partition: 1, group: 7, key: 101 } } as const
  run.applyControl(lease)
  run.advance({ untilTime: 2, maxEvents: 100 })
  run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 1000, leaseMs: 20, cooldownMs: 1000 } })
  run.advance({ untilTime: 3, maxEvents: 100 })
  run.applyControl(lease)
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [] })
  run.advance({ untilTime: 4, maxEvents: 100 })
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [101] })
  expect(run.projection.notices[0]?.pending?.leased).toBe(false)
  const replay = replayRun(JSON.parse(JSON.stringify(run.exportReplay())))
  replay.advance({ untilTime: run.now, maxEvents: 1000 })
  expect(replay.observe()).toEqual(run.observe())
})

it("a lease after a factual release captures the current profile", () => {
  const run = createRun({
    sessions: [{ agent: "first" }, { agent: "second" }],
    expiryProfile: { pendingMs: 100, leaseMs: 2, cooldownMs: 20 },
    inputs: [
      { at: 2, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } },
      { at: 3, kind: "canonical", event: { kind: "noticeLease", key: 101, leased: false } },
      { at: 4, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } },
      { at: 23, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } }
    ]
  })
  run.applyControl({ kind: "suspendArrivals", suspended: true })
  run.advance({ untilTime: 0, maxEvents: 100 })
  report(run, 1, 101)
  const lease = { kind: "noticeLease", target: { partition: 1, group: 7, key: 101 } } as const
  run.advance({ untilTime: 2, maxEvents: 100 })
  run.applyControl(lease)
  run.advance({ untilTime: 2, maxEvents: 100 })
  run.advance({ untilTime: 3, maxEvents: 100 })
  expect(run.projection.notices[0]?.pending?.leased).toBe(false)
  run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 100, leaseMs: 20, cooldownMs: 20 } })
  run.applyControl(lease)
  run.advance({ untilTime: 3, maxEvents: 100 })
  run.advance({ untilTime: 4, maxEvents: 100 })
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [] })
  expect(run.projection.notices[0]?.pending?.leased).toBe(true)
  run.advance({ untilTime: 23, maxEvents: 100 })
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [101] })
  expect(run.projection.notices[0]?.pending?.leased).toBe(false)
  const replay = replayRun(JSON.parse(JSON.stringify(run.exportReplay())))
  replay.advance({ untilTime: run.now, maxEvents: 1000 })
  expect(replay.observe()).toEqual(run.observe())
})

it.each([9, 10, 11])("ordinary public notice collection at %i preserves the other advicee", (time) => {
  const run = makeRun([time, 20], 10, 20)
  report(run, 1, 101)
  report(run, 2, 202)
  expect(run.projection.notices.map((notice) => notice.partition)).toEqual([2, 1])
  expect(run.projection.global.bytes).toBe(256)
  run.advance({ untilTime: time, maxEvents: 100 })
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: time < 10 ? [101] : [] })
  expect(run.projection.notices.find((notice) => notice.partition === 2)?.pending).toBeDefined()
  expect(run.projection.global.bytes).toBe(256)
  expect(run.projection.notices.find((notice) => notice.partition === 1)?.pending !== undefined).toBe(time < 10)
  run.advance({ untilTime: 20, maxEvents: 100 })
  collect(run, 1)
  expect(run.projection.notices.map((notice) => notice.partition)).toEqual([2])
  expect(run.projection.global.bytes).toBe(128)
  expect(run.projection.work).toEqual([])
  const replay = replayRun(JSON.parse(JSON.stringify(run.exportReplay())))
  replay.advance({ untilTime: run.now, maxEvents: 1000 })
  expect(replay.observe()).toEqual(run.observe())
})

it.each([3, 17, 41, 97])("actual public expiry campaign keeps original pending lifetime (seed %i)", (seed) => {
  const deadline = 10 + (seed % 7)
  const run = makeRun([deadline - 1, deadline, deadline + 1], deadline, 2)
  report(run, 1, 100 + seed)
  run.advance({ untilTime: deadline - 1, maxEvents: 100 })
  report(run, 1, 100 + seed) // Actual merge refreshes cooldown, not pendingAt.
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [100 + seed] })
  run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 1000, leaseMs: 20, cooldownMs: 1000 } })
  run.advance({ untilTime: deadline, maxEvents: 100 })
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: [] })
  expect(run.projection.notices[0]?.pending).toBeUndefined()
  expect(run.projection.global.bytes).toBe(128)
  run.advance({ untilTime: deadline + 1, maxEvents: 100 })
  collect(run, 1)
  expect(run.projection.notices).toEqual([])
  expect(run.projection.global.bytes).toBe(0)
  const replay = replayRun(JSON.parse(JSON.stringify(run.exportReplay())))
  replay.advance({ untilTime: run.now, maxEvents: 1000 })
  expect(replay.observe()).toEqual(run.observe())
})

it.each([3, 4, 5])("notice lease collection at %i follows its original two-ms lease", (time) => {
  const run = makeRun([2, time], 100, 20)
  report(run, 1, 101)
  report(run, 2, 202)
  run.advance({ untilTime: 2, maxEvents: 100 })
  run.applyControl({ kind: "noticeLease", target: { partition: 1, group: 7, key: 101 } })
  run.advance({ untilTime: 2, maxEvents: 100 })
  expect(run.projection.notices.find((notice) => notice.partition === 1)?.pending?.leased).toBe(true)
  run.applyControl({ kind: "expiryProfile", profile: { pendingMs: 1000, leaseMs: 20, cooldownMs: 1000 } })
  run.advance({ untilTime: time, maxEvents: 100 })
  expect(collect(run, 1)).toContainEqual({ kind: "noticeSelected", ids: time < 4 ? [] : [101] })
  expect(run.projection.notices.find((notice) => notice.partition === 1)?.pending?.leased).toBe(time < 4)
  expect(run.projection.notices.find((notice) => notice.partition === 2)?.pending?.leased).toBe(false)
  expect(run.projection.global.bytes).toBe(256)
  const replay = replayRun(JSON.parse(JSON.stringify(run.exportReplay())))
  replay.advance({ untilTime: run.now, maxEvents: 1000 })
  expect(replay.observe()).toEqual(run.observe())
})
