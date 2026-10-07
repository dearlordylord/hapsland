import assert from "node:assert/strict"
import { Deferred, Effect } from "effect"
import { Event, Machine, State } from "effect-machine"
const S = State({ Idle: {}, Working: {}, Done: {} })
const E = Event({ Start: {}, Back: {}, Complete: {} })
const result = await Effect.runPromise(
  Effect.scoped(
    Machine.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const released = yield* Deferred.make<void>()
        const blocked = yield* Deferred.make<void>()
        const machine = Machine.make({ state: S, event: E, initial: S.Idle })
          .on(S.Idle, E.Start, () => S.Working)
          .on(S.Working, E.Back, () => S.Idle)
          .on(S.Working, E.Complete, () => S.Done)
          .task(
            S.Working,
            () =>
              Effect.acquireUseRelease(
                Deferred.succeed(started, undefined),
                () => Deferred.await(blocked),
                () => Deferred.succeed(released, undefined)
              ),
            { onSuccess: () => E.Complete }
          )
        const actor = yield* Machine.spawn(machine)
        yield* actor.start
        yield* actor.call(E.Start)
        yield* Deferred.await(started)
        yield* actor.call(E.Back)
        yield* Deferred.await(released)
        yield* Deferred.succeed(blocked, undefined)
        const snapshot = yield* actor.snapshot
        assert.equal(snapshot._tag, "Idle")
        return { state: snapshot._tag, stateOwnedTaskReleased: true, lateCompletionApplied: false }
      })
    )
  )
)
console.log(JSON.stringify(result))
