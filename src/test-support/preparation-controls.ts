import { Deferred, Effect, Layer, Ref } from "effect";
import { ResidentPreparationControls } from "../resident/preparation-controls.ts";

/** One-shot fixture coordination; the resident layer owns gate retirement. */
export const makePreparationControls = Effect.fn("PreparationControlsFixture.make")(function* () {
  const holdOwner = yield* Ref.make(false);
  const ownerEntered = yield* Deferred.make<void>();
  const ownerRelease = yield* Deferred.make<void>();
  const joinedEntered = yield* Deferred.make<void>();
  const retired = yield* Deferred.make<void>();
  const layer = Layer.effect(ResidentPreparationControls, Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Deferred.succeed(ownerRelease, undefined).pipe(
      Effect.andThen(Deferred.succeed(retired, undefined)), Effect.asVoid));
    return ResidentPreparationControls.of({
      afterReuseBoundary: Effect.fn("PreparationControlsFixture.afterReuseBoundary")(function* (phase) {
        if (phase === "ownerClaimed" && (yield* Ref.getAndSet(holdOwner, false))) {
          yield* Deferred.succeed(ownerEntered, undefined);
          yield* Deferred.await(ownerRelease);
        }
        if (phase === "claimJoined") yield* Deferred.succeed(joinedEntered, undefined);
      }),
    });
  }));
  return {
    layer,
    holdNextOwner: Ref.set(holdOwner, true),
    ownerEntered: Deferred.await(ownerEntered),
    claimJoined: Deferred.await(joinedEntered),
    releaseOwner: Deferred.succeed(ownerRelease, undefined).pipe(Effect.asVoid),
    retired: Deferred.await(retired),
  };
});
