import { randomUUID } from "node:crypto"
import { Deferred, Effect } from "effect"
import { expect, it } from "vitest"
import { advicee } from "../direct-event/test-fixtures.ts"
import { makeInspectionRecorder } from "./recorder.ts"
import { makeInspectionSubmissionRecorder } from "./submission-recorder.ts"
import type { InspectionRecord } from "./contract.ts"

const source = { endpoint: "/private/resident.sock", lifetime: "resident" }
const recipient = advicee()
const batch = {
  root: "/project",
  advicee: recipient,
  findingIds: ["a".repeat(64)],
  evaluations: [{ semanticIdentity: "b".repeat(64), evaluationId: "original" }]
}
const attempt = (batchId: string) => ({
  ...source,
  batchId,
  attemptId: randomUUID(),
  root: batch.root,
  advicee: recipient,
  findingCount: 1,
  noticeOnly: false
})

it("revokes replaced batch observers before recording final membership", async () => {
  const saved: Array<InspectionRecord> = []
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const finished = yield* Deferred.make<void>()
        const recorder = yield* makeInspectionRecorder(source, {
          write: (record, _encoded, publication) =>
            Effect.sync(() => {
              if (publication.commit()) saved.push(record)
              if (record.fact.kind === "writer-evidence" && record.fact.state === "written")
                Deferred.doneUnsafe(finished, Effect.void)
            })
        })
        recorder.observeRecording(batch.root, true)
        const reporting = makeInspectionSubmissionRecorder(recorder, source)
        reporting.register("same-batch", batch)
        const old = reporting.observation.forAttempt(attempt("same-batch"))
        if (!old) throw new Error("missing original observer")
        reporting.register("same-batch", { ...batch, findingIds: ["c".repeat(64)] })
        old.observe({ state: "write-started", encoded: "obsolete membership" })
        const current = reporting.observation.forAttempt(attempt("same-batch"))
        if (!current) throw new Error("missing replacement observer")
        current.observe({ state: "written", encoded: "final membership" })
        yield* Deferred.await(finished)
        const evidence = saved.filter((record) => record.fact.kind === "writer-evidence")
        expect(evidence).toHaveLength(1)
        expect(evidence[0]?.fact).toMatchObject({ state: "written", findingIds: ["c".repeat(64)] })
        expect(JSON.stringify(saved)).not.toContain(Buffer.from("obsolete membership").toString("base64"))
      })
    )
  )
})

it("revokes old writer capabilities across opt-out and re-enable, preserving explicit oversized absence", async () => {
  const saved: Array<InspectionRecord> = []
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const ready = yield* Deferred.make<void>()
        const finished = yield* Deferred.make<void>()
        const recorder = yield* makeInspectionRecorder(source, {
          write: (record, _encoded, publication) =>
            Effect.sync(() => {
              if (publication.commit()) saved.push(record)
              if (record.fact.kind === "writer-evidence" && record.fact.state === "ready")
                Deferred.doneUnsafe(ready, Effect.void)
              if (record.fact.kind === "writer-evidence" && record.fact.state === "written")
                Deferred.doneUnsafe(finished, Effect.void)
            })
        })
        const reporting = makeInspectionSubmissionRecorder(recorder, source)
        reporting.register("disabled", batch)
        expect(reporting.observation.forAttempt(attempt("disabled"))).toBeUndefined()
        recorder.observeRecording(batch.root, true)
        reporting.register("first", batch)
        const original = reporting.observation.forAttempt(attempt("first"))
        if (!original) throw new Error("missing capability")
        original.observe({ state: "ready" })
        original.observe({ state: "ready" })
        yield* Deferred.await(ready)
        recorder.observeRecording(batch.root, false)
        recorder.observeRecording(batch.root, true)
        original.observe({ state: "written", encoded: "revoked source" })
        expect(reporting.observation.forAttempt(attempt("first"))).toBeUndefined()
        reporting.register("current", batch)
        const current = reporting.observation.forAttempt(attempt("current"))
        if (!current) throw new Error("missing current capability")
        current.observe({ state: "written", encoded: "oversized source".repeat(2000) })
        yield* Deferred.await(finished)
        const evidence = saved.filter((record) => record.fact.kind === "writer-evidence")
        expect(evidence.map((record) => record.fact)).toMatchObject([
          { state: "ready", output: { status: "missing", reason: "not-captured" } },
          { state: "written", output: { status: "missing", reason: "oversized" } }
        ])
        expect(JSON.stringify(saved)).not.toContain("revoked source")
        expect(JSON.stringify(saved)).not.toContain("oversized source")
      })
    )
  )
})

it("rejects foreign ownership and recipients, bounds attempts and releases expired batch slots", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const recorder = yield* makeInspectionRecorder(source, { write: () => Effect.void })
        recorder.observeRecording(batch.root, true)
        let clock = 1000
        const reporting = makeInspectionSubmissionRecorder(recorder, source, () => clock)
        reporting.register("original", batch)
        const owner = attempt("original")
        expect(reporting.observation.forAttempt({ ...owner, lifetime: "foreign" })).toBeUndefined()
        expect(reporting.observation.forAttempt({ ...owner, endpoint: "/other.sock" })).toBeUndefined()
        expect(
          reporting.observation.forAttempt({ ...owner, advicee: { ...recipient, toolUseId: "another-edit" } })
        ).toBeUndefined()
        for (let index = 0; index < 8; index++)
          expect(reporting.observation.forAttempt(attempt("original"))).toBeDefined()
        expect(reporting.observation.forAttempt(attempt("original"))).toBeUndefined()
        for (let index = 1; index < 128; index++) reporting.register(String(index), batch)
        reporting.register("overflow", batch)
        expect(reporting.observation.forAttempt(attempt("overflow"))).toBeUndefined()
        clock += 30000
        expect(reporting.observation.forAttempt(owner)).toBeUndefined()
        reporting.register("after-expiry", batch)
        expect(reporting.observation.forAttempt(attempt("after-expiry"))).toBeDefined()
      })
    )
  )
})
