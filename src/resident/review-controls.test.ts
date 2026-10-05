import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Layer, Ref } from "effect"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeReviewGitFixture as makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { configuredRules } from "../test-support/default-rules.ts"
import { reviewControlsLayer } from "../test-support/review-controls.ts"
import {
  ResidentReviewControls,
  ReviewControlError,
  defaultReviewControls,
  type ReviewControls
} from "./review-controls.ts"
import { makeResidentRuntime } from "./server.ts"
import { residentPaths } from "./paths.ts"
import type { ResidentDispatchContext } from "./protocol.ts"

const fixture = Effect.fn("ReviewControlsFixture.acquire")(function* (controls: Layer.Layer<ResidentReviewControls>) {
  const root = yield* Effect.promise(() => makeGitFixture())
  yield* Effect.addFinalizer(() => Effect.promise(() => rm(root, { recursive: true, force: true })))
  yield* Effect.promise(() => put(root, "type.ts", "type OrderCount = number\n"))
  const observation = yield* adaptCodexDirectEvent(addEvent(root))
  if (observation === undefined) return yield* Effect.die(new Error("missing fixture observation"))
  const dispatch: ResidentDispatchContext = {
    statePath: join(root, "consent"),
    userConfigPath: null,
    credential: null,
    controlled: {
      answers: Object.fromEntries(
        configuredRules.map((rule) => [
          rule.id,
          { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 }
        ])
      )
    }
  }
  const runtime = yield* makeResidentRuntime(residentPaths(join(root, "runtime")), () => 100, {
    reviewControls: controls
  })
  return { root, observation, dispatch, runtime }
})

for (const phase of ["beforeEvaluate", "afterAdvicePending"] as const) {
  it.effect(`closes a held ${phase} control without releasing its gate`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const retired = yield* Ref.make(false)
        const controls = Layer.effect(
          ResidentReviewControls,
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Ref.set(retired, true))
            const hold = Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
            })
            return ResidentReviewControls.of({ ...defaultReviewControls, [phase]: () => hold })
          })
        )
        const { observation, dispatch, runtime } = yield* fixture(controls)
        expect((yield* runtime.admit(observation, dispatch)).status).toBe("accepted")
        yield* Deferred.await(entered)
        if (phase === "afterAdvicePending") expect(yield* runtime.pendingAdviceMetadata()).toHaveLength(1)
        yield* runtime.close
        expect(yield* Ref.get(retired)).toBe(true)
        expect(yield* Deferred.isDone(release)).toBe(false)
        expect(yield* runtime.stats()).toMatchObject({ queued: 0, running: 0, retainedBytes: 0, currentWork: 0 })
      })
    )
  )
}

it.effect("removes retained unpublished advice when its pending control fails", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { runtime, observation, dispatch } = yield* fixture(
        reviewControlsLayer({
          afterAdvicePending: () => Effect.fail(new ReviewControlError({ phase: "advicePending" }))
        })
      )
      expect((yield* runtime.admit(observation, dispatch)).status).toBe("accepted")
      yield* runtime.whenIdle()
      expect(yield* runtime.pendingAdviceMetadata()).toEqual([])
      expect(yield* runtime.stats()).toMatchObject({ queued: 0, running: 0, currentWork: 0 })
      const accounting = yield* runtime.accountingMetrics()
      expect((yield* runtime.stats()).retainedBytes).toBe(
        accounting.successfulCacheBytes + accounting.operationalNoticeBytes
      )
    })
  )
)

it.effect("releases revalidation workspace after its reserved control fails", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { runtime, root, observation, dispatch } = yield* fixture(
        reviewControlsLayer({
          afterRevalidationWorkspaceReserved: () => Effect.fail(new ReviewControlError({ phase: "workspaceReserved" }))
        })
      )
      yield* runtime.admit(observation, dispatch)
      yield* runtime.whenIdle()
      const before = (yield* runtime.stats()).retainedBytes
      expect((yield* runtime.collect(root, observation.advicee, dispatch)).status).toBe("empty")
      expect(yield* runtime.pendingAdviceMetadata()).toHaveLength(1)
      expect((yield* runtime.stats()).retainedBytes).toBe(before)
    })
  )
)

for (const phase of ["beforeRevalidate", "beforeFinalRevalidate"] as const) {
  it.effect(`releases the provisional lease when ${phase} fails`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fail = yield* Ref.make(true)
        const callback: ReviewControls[typeof phase] = () =>
          Ref.get(fail).pipe(
            Effect.flatMap((fail) => (fail ? Effect.fail(new ReviewControlError({ phase })) : Effect.void))
          )
        const { runtime, root, observation, dispatch } = yield* fixture(reviewControlsLayer({ [phase]: callback }))
        yield* runtime.admit(observation, dispatch)
        yield* runtime.whenIdle()
        const failed = yield* Effect.exit(runtime.collect(root, observation.advicee, dispatch))
        expect(Exit.isFailure(failed)).toBe(true)
        expect(yield* runtime.pendingAdviceMetadata()).toHaveLength(1)
        yield* Ref.set(fail, false)
        expect((yield* runtime.collect(root, observation.advicee, dispatch)).status).toBe("advice")
      })
    )
  )
}
