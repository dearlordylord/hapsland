import assert from "node:assert/strict"
import { it } from "node:test"
import { join } from "node:path"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Result from "effect/Result"
import { settingsSource } from "@hapsland/review-definition/runtime/review-settings"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import { makeResidentResources } from "../../../../../dist/resident/composition/resources.js"
import { makeResidentAdmission } from "../../../../../dist/resident/review-work/admission.js"
import { makeDispatcher } from "../../../../../dist/resident/state/dispatch.js"
import { recipientPartition, editPermitIdentity } from "../../../../../dist/resident/recipient/identity.js"

const fixture = async (t) => {
  const root = await mkdtemp(join(tmpdir(), "haps-admission-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync("git", ["init", "-q", root])
  const path = join(root, "value.ts"),
    userConfigPath = join(root, "user.jsonc")
  const content = "type Value = number\n"
  await Promise.all([
    writeFile(path, content),
    writeFile(userConfigPath, JSON.stringify({ version: 1 })),
    writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, rules: [] }))
  ])
  const observation = await Effect.runPromise(
    adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      cwd: root,
      session_id: "session",
      tool_use_id: "admission",
      tool_input: { file_path: path, content },
      tool_response: { filePath: path, content, originalFile: null, userModified: false }
    })
  )
  assert.notEqual(observation, undefined)
  return { root, userConfigPath, observation }
}

it("a real enqueue refusal releases its reservation without pinning a rejected edit", async (t) => {
  const { root, userConfigPath, observation } = await fixture(t)
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const resources = yield* makeResidentResources(residentPaths(join(root, "runtime")), monotonicNow, {})
        const dispatcher = yield* makeDispatcher(
          resources.residentLedger,
          (job) => ({ operation: job.canonicalObservationId, round: job.canonicalRound }),
          () => Effect.die(new Error("a refused ingress must not execute"))
        )
        yield* dispatcher.close()
        const admission = makeResidentAdmission({
          ...resources,
          residentDispatcher: dispatcher,
          residentPublishAdmission: resources.residentPublishAdmission,
          residentOptionalUserConfig: (dispatch) => dispatch.userConfigPath,
          residentRecordAnalytics: () => Effect.void,
          residentExpirePending: () => Effect.void,
          residentPruneNoticeCooldowns: () => Effect.void
        })
        const response = yield* admission.admit(
          observation,
          { statePath: join(root, "state"), userConfigPath, credential: null, controlled: { answers: {} } },
          true
        )
        assert.equal(response.status, "rejected-capacity")
        assert.deepEqual(yield* dispatcher.snapshot(), { queued: 0, running: 0 })
        const projection = yield* resources.residentLedger.canonicalProjection()
        const capacity = yield* resources.residentLedger.snapshot()
        const round = yield* resources.residentLedger.rounds.get(recipientPartition(observation.advicee))
        assert.equal(capacity.items, 0, "refused admission must release its observation reservation")
        assert.equal(projection.work.length, 0, "refused admission must retain no Canonical observation")
        assert.deepEqual(
          { pinned: round !== undefined, activeAdmission: projection.admissions.some((item) => item.active) },
          { pinned: false, activeAdmission: false },
          "a rejected edit must publish neither a native pin nor a logical admission round"
        )
      })
    )
  )
})

it("a caller defect after enqueue publication preserves exactly one dispatcher-owned job", async (t) => {
  const { root, userConfigPath, observation } = await fixture(t)
  const failure = new Error("after committed admission")
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const resources = yield* makeResidentResources(residentPaths(join(root, "runtime")), monotonicNow, {})
        const ledger = resources.residentLedger
        const starts = []
        let releases = 0
        const dispatcher = yield* makeDispatcher(
          ledger,
          (job) => ({ operation: job.canonicalObservationId, round: job.canonicalRound }),
          ({ value: job }) =>
            Effect.gen(function* () {
              starts.push(job)
              yield* ledger.observation(
                job.partition,
                job.canonicalObservationId,
                "interruptObservation",
                job.canonicalRound
              )
              assert.equal(yield* ledger.release(job.reservation), true)
              releases++
            })
        )
        const partition = recipientPartition(observation.advicee)
        const reservation = yield* ledger.reserve(partition, 1024, "observationDispatch")
        assert.notEqual(reservation, undefined)
        const settings = yield* resources.reviewSettings.capture(settingsSource(root, userConfigPath))
        let publication
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            publication = yield* resources.residentPublishAdmission({
              observation,
              dispatch: { statePath: join(root, "state"), userConfigPath, credential: null },
              partition,
              reservation,
              settings,
              mode: {
                kind: "composed",
                requirePermit: false,
                eventId: editPermitIdentity(root, observation.advicee),
                now: monotonicNow(),
                cohortId: "published-cohort"
              }
            })
            return yield* Effect.die(failure)
          })
        )
        assert.equal(exit._tag, "Failure")
        assert.equal(Result.getOrThrow(Cause.findDefect(exit.cause)), failure)
        assert.equal(publication.kind, "accepted")
        assert.equal((yield* ledger.snapshot()).items, 1)
        assert.deepEqual(yield* dispatcher.snapshotWhere(({ value }) => value === publication.job), {
          queued: 0,
          running: 1
        })
        assert.equal(yield* ledger.rounds.get(partition), publication.job.round)
        yield* dispatcher.startCommitted()
        yield* dispatcher.whenIdle()
        assert.deepEqual(starts, [publication.job])
        assert.equal(releases, 1)
        assert.equal((yield* ledger.snapshot()).items, 0)
        assert.deepEqual(yield* dispatcher.snapshot(), { queued: 0, running: 0 })
      })
    )
  )
})

for (const existing of [false, true]) {
  it(`registered-permit refusal preserves ${existing ? "the existing round" : "an unpinned recipient"}`, async (t) => {
    const { root, userConfigPath, observation } = await fixture(t)
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const resources = yield* makeResidentResources(residentPaths(join(root, "runtime")), monotonicNow, {})
          const ledger = resources.residentLedger
          const delivery = resources.residentComposedDelivery
          const partition = recipientPartition(observation.advicee)
          const settings = yield* resources.reviewSettings.capture(settingsSource(root, userConfigPath))
          const dispatcher = yield* makeDispatcher(
            ledger,
            (job) => ({ operation: job.canonicalObservationId, round: job.canonicalRound }),
            () => Effect.die(new Error("closed dispatcher must not start work"))
          )
          const publish = (reservation, eventId, requirePermit) =>
            resources.residentPublishAdmission({
              observation,
              dispatch: { statePath: join(root, "state"), userConfigPath, credential: null },
              partition,
              reservation,
              settings,
              mode: { kind: "composed", requirePermit, eventId, now: monotonicNow(), cohortId: eventId }
            })
          if (existing) {
            const held = yield* ledger.reserve(partition, 1024, "observationDispatch")
            assert.notEqual(held, undefined)
            assert.equal((yield* publish(held, "existing-edit", false)).kind, "accepted")
          }
          yield* dispatcher.close()
          const priorRound = yield* ledger.rounds.get(partition)
          const prior = yield* ledger.canonicalProjection()
          const priorCapacity = yield* ledger.snapshot()
          const priorDispatch = yield* dispatcher.snapshot()
          const now = Math.floor(monotonicNow())
          assert.deepEqual(
            yield* delivery.registerEditDecision(partition, "refused-edit", now, now, undefined, undefined, settings),
            { accepted: true }
          )
          assert.equal((yield* delivery.closureCounts(partition)).editPermits, 1)
          assert.equal(yield* delivery.registeredEditSettings(partition, "refused-edit"), settings)
          const reservation = yield* ledger.reserve(partition, 1024, "observationDispatch")
          assert.notEqual(reservation, undefined)
          assert.equal((yield* publish(reservation, "refused-edit", true)).kind, "capacity")
          assert.equal(yield* ledger.release(reservation), true)
          assert.equal((yield* delivery.closureCounts(partition)).editPermits, 0)
          assert.deepEqual(yield* delivery.registerEditDecision(partition, "refused-edit", now, now), {
            accepted: false,
            reason: "DuplicateTool"
          })
          assert.equal(yield* ledger.rounds.get(partition), priorRound)
          const after = yield* ledger.canonicalProjection()
          assert.deepEqual(after.work, prior.work)
          assert.deepEqual(
            after.admissions.map(({ active, round }) => ({ active, round })),
            prior.admissions.length === 0
              ? [{ active: false, round: 0 }]
              : prior.admissions.map(({ active, round }) => ({ active, round }))
          )
          assert.deepEqual(yield* ledger.snapshot(), priorCapacity)
          assert.deepEqual(yield* dispatcher.snapshot(), priorDispatch)
        })
      )
    )
  })
}
