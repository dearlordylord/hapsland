import { Deferred, Effect, Layer, Queue, Ref } from "effect"
import { ResidentPreparationControls } from "@hapsland/resident-runtime/resident/preparation-controls"

/** One-shot fixture coordination; the resident layer owns gate retirement. */
export const makePreparationControls = Effect.fn("PreparationControlsFixture.make")(function* () {
  const holdOwner = yield* Ref.make(false)
  const ownerEntered = yield* Deferred.make<void>()
  const ownerRelease = yield* Deferred.make<void>()
  const joinedEntered = yield* Deferred.make<void>()
  const holdPreparation = yield* Ref.make(false)
  const preparationRelease = yield* Deferred.make<void>()
  const preparationCount = yield* Ref.make(0)
  const preparations = yield* Queue.unbounded<number>()
  const retired = yield* Deferred.make<void>()
  const layer = Layer.effect(
    ResidentPreparationControls,
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(ownerRelease, undefined).pipe(
          Effect.andThen(Deferred.succeed(preparationRelease, undefined)),
          Effect.andThen(Queue.shutdown(preparations)),
          Effect.andThen(Deferred.succeed(retired, undefined)),
          Effect.asVoid
        )
      )
      return ResidentPreparationControls.of({
        afterPrepare: Effect.gen(function* () {
          const count = yield* Ref.updateAndGet(preparationCount, (count) => count + 1)
          yield* Queue.offer(preparations, count)
          if (yield* Ref.getAndSet(holdPreparation, false)) yield* Deferred.await(preparationRelease)
        }).pipe(Effect.withSpan("PreparationControlsFixture.afterPrepare")),
        afterReuseBoundary: Effect.fn("PreparationControlsFixture.afterReuseBoundary")(function* (phase) {
          if (phase === "ownerClaimed" && (yield* Ref.getAndSet(holdOwner, false))) {
            yield* Deferred.succeed(ownerEntered, undefined)
            yield* Deferred.await(ownerRelease)
          }
          if (phase === "claimJoined") yield* Deferred.succeed(joinedEntered, undefined)
        })
      })
    })
  )
  return {
    layer,
    holdNextOwner: Ref.set(holdOwner, true),
    ownerEntered: Deferred.await(ownerEntered),
    claimJoined: Deferred.await(joinedEntered),
    releaseOwner: Deferred.succeed(ownerRelease, undefined).pipe(Effect.asVoid),
    holdNextPreparation: Ref.set(holdPreparation, true),
    nextPreparation: Queue.take(preparations),
    preparationCount: Ref.get(preparationCount),
    releasePreparation: Deferred.succeed(preparationRelease, undefined).pipe(Effect.asVoid),
    retired: Deferred.await(retired)
  }
})
