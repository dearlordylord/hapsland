import { Deferred, Effect, Layer, Ref } from "effect"
import { ResidentDispatchControls, type DispatchBoundary } from "../resident/dispatch-controls.ts"

/** One selected boundary can be held; its resident-owned layer retires the gate. */
export const makeDispatchControls = Effect.fn("DispatchControlsFixture.make")(function* () {
  const selected = yield* Ref.make<DispatchBoundary | undefined>(undefined)
  const entered = yield* Deferred.make<DispatchBoundary>()
  const release = yield* Deferred.make<void>()
  const retired = yield* Deferred.make<void>()
  const layer = Layer.effect(
    ResidentDispatchControls,
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Deferred.succeed(release, undefined).pipe(Effect.andThen(Deferred.succeed(retired, undefined)), Effect.asVoid)
      )
      return ResidentDispatchControls.of({
        atBoundary: Effect.fn("DispatchControlsFixture.atBoundary")(function* (phase) {
          const held = yield* Ref.modify(selected, (selected) =>
            selected === phase ? [true, undefined] : [false, selected]
          )
          if (held) {
            yield* Deferred.succeed(entered, phase)
            yield* Deferred.await(release)
          }
        })
      })
    })
  )
  return {
    layer,
    holdNext: Effect.fn("DispatchControlsFixture.holdNext")((phase: DispatchBoundary) => Ref.set(selected, phase)),
    entered: Deferred.await(entered),
    release: Deferred.succeed(release, undefined).pipe(Effect.asVoid),
    retired: Deferred.await(retired)
  }
})
