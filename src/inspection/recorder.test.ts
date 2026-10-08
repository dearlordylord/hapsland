import { describe, expect, it } from "vitest"
import { Deferred, Effect } from "effect"
import { makeInspectionRecorder } from "@hapsland/inspection-records/inspection/recorder"
import { MAX_INSPECTION_RECORDING_BYTES, type InspectionRecord } from "@hapsland/inspection-records/inspection/contract"

const scope = {
  root: "/project",
  runtime: "codex-cli" as const,
  runtimeVersion: "0.155.1",
  sessionId: "session",
  subagentId: null
}
const source = { endpoint: "/private/resident.sock", lifetime: "lifetime" }
const edit = {
  kind: "edit-received" as const,
  candidates: [
    { position: 0, selection: { status: "not-evaluated" as const }, operation: "update" as const, path: "a.ts" }
  ]
}

describe("optional inspection recording", () => {
  it.each([{ items: 0 }, { items: 1000000 }, { bytes: 0 }, { bytes: Number.NaN }])(
    "rejects invalid queue limits %j before starting persistence",
    async (limits) => {
      let writes = 0
      await expect(
        Effect.runPromise(
          Effect.scoped(
            makeInspectionRecorder(
              source,
              {
                write: () =>
                  Effect.sync(() => {
                    writes += 1
                  })
              },
              limits
            )
          )
        )
      ).rejects.toThrow("invalid inspection queue bounds")
      expect(writes).toBe(0)
    }
  )
  it("bounds source-free current root states independently of retained history", async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const recorder = yield* makeInspectionRecorder(source, { write: () => Effect.void })
          const roots = Array.from({ length: 128 }, (_, index) => "/" + "日".repeat(2700) + index)
          for (const root of roots) recorder.observeRecording(root, true)
          recorder.observeRecording("/outside-root-bound", true)
          const snapshot = recorder.currentRecording()
          expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThanOrEqual(MAX_INSPECTION_RECORDING_BYTES)
          expect(snapshot.roots.length + snapshot.omittedRoots).toBe(128)
          expect(snapshot.omittedRoots).toBeGreaterThan(0)
          const first = snapshot.roots[0]!
          expect(first).toEqual({ root: roots[0], state: "enabled", epoch: 1 })
          recorder.observeRecording(first.root, undefined)
          expect(recorder.currentRecording().roots[0]).toEqual({ ...first, state: "unavailable" })
          expect(recorder.isEnabled(first.root)).toBe(false)
        })
      )
    )
  })
  it("keeps offers bounded when persistence cannot settle and revokes unpublished source data on disable", async () => {
    const saved: InspectionRecord[] = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const finished = yield* Deferred.make<void>()
          const recorder = yield* makeInspectionRecorder(
            source,
            {
              write: (record, _encoded, publishable) =>
                Effect.gen(function* () {
                  if (record.fact.kind === "edit-received") {
                    yield* Deferred.succeed(started, undefined)
                    yield* Deferred.await(release)
                  }
                  if (publishable.commit()) saved.push(record)
                  if (record.fact.kind === "recording-state" && record.fact.state === "disabled")
                    yield* Deferred.succeed(finished, undefined)
                })
            },
            { items: 2, bytes: 4096 }
          )
          expect(recorder.offer(scope, { receiptId: "before-consent" }, edit)).toBe("disabled")
          recorder.observeRecording(scope.root, true)
          expect(recorder.offer(scope, { receiptId: "first" }, edit)).toBe("queued")
          yield* Deferred.await(started)
          expect(recorder.offer(scope, { receiptId: "second" }, edit)).toBe("queued")
          expect(recorder.offer(scope, { receiptId: "overflow" }, edit)).toBe("overflow")
          recorder.observeRecording(scope.root, false)
          expect(recorder.offer(scope, { receiptId: "after-disable" }, edit)).toBe("disabled")
          yield* Deferred.succeed(release, undefined)
          yield* Deferred.await(finished)
          expect(saved.some((record) => record.fact.kind === "edit-received")).toBe(false)
          expect(
            saved.some((record) => record.fact.kind === "recording-state" && record.fact.state === "disabled")
          ).toBe(true)
        })
      )
    )
  })
  it("preserves captured data when the producer mutates its input and continues after a failed write", async () => {
    const saved: InspectionRecord[] = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const completed = yield* Deferred.make<void>()
          const recorder = yield* makeInspectionRecorder(source, {
            write: (record, encoded, publishable) =>
              Effect.gen(function* () {
                if (record.correlation.receiptId === "failure") return yield* Effect.fail("storage unavailable")
                if (record.correlation.receiptId === "immutable") {
                  yield* Deferred.succeed(entered, undefined)
                  yield* Deferred.await(release)
                  void encoded
                }
                if (publishable.commit()) saved.push(record)
                if (record.correlation.receiptId === "immutable") yield* Deferred.succeed(completed, undefined)
              })
          })
          recorder.observeRecording(scope.root, true)
          expect(recorder.offer(scope, { receiptId: "failure" }, edit)).toBe("queued")
          const candidate = {
            position: 0,
            selection: { status: "not-evaluated" as const },
            operation: "update" as const,
            path: "original-日本語.ts"
          }
          expect(
            recorder.offer(scope, { receiptId: "immutable" }, { kind: "edit-received", candidates: [candidate] })
          ).toBe("queued")
          yield* Deferred.await(entered)
          candidate.path = "changed.ts"
          yield* Deferred.succeed(release, undefined)
          yield* Deferred.await(completed)
          const captured = saved.find((record) => record.correlation.receiptId === "immutable")
          expect(captured?.fact).toEqual({
            kind: "edit-received",
            candidates: [
              {
                position: 0,
                selection: { status: "not-evaluated" as const },
                operation: "update",
                path: "original-日本語.ts"
              }
            ]
          })
          expect(saved.some((record) => record.correlation.receiptId === "failure")).toBe(false)
        })
      )
    )
  })

  it("interrupts a permanently stalled writer on scope exit and distinguishes unavailable settings", async () => {
    const saved: InspectionRecord[] = []
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>()
          const recorder = yield* makeInspectionRecorder(source, {
            write: (record) =>
              Effect.gen(function* () {
                saved.push(record)
                if (record.fact.kind === "edit-received") {
                  yield* Deferred.succeed(started, undefined)
                  yield* Effect.never
                }
              })
          })
          recorder.observeRecording(scope.root, true)
          recorder.observeRecording(scope.root, undefined)
          recorder.observeRecording(scope.root, true)
          expect(recorder.offer(scope, { receiptId: "stalled" }, edit)).toBe("queued")
          yield* Deferred.await(started)
          expect(recorder.offer(scope, { receiptId: "still-progressing" }, edit)).toBe("queued")
        })
      )
    )
    expect(saved.some((record) => record.fact.kind === "recording-state" && record.fact.state === "unavailable")).toBe(
      true
    )
  })
})
