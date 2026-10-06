// THROWAWAY: process/session lifetime; no workflow transitions or owner policy.
import { Deferred, Effect, Semaphore, Terminal } from "effect"
import { acquireInteraction, type Interaction } from "./interaction.ts"
// A session owns a single input at a time and revokes its handle on scope exit.
export const scopeInteraction = (adapter: Interaction) =>
  Effect.gen(function* () {
    const gate = yield* Semaphore.make(1)
    const closed = yield* Deferred.make<void>()
    let released = false
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        released = true
        yield* Deferred.succeed(closed, undefined)
      })
    )
    const input = <A>(effect: Effect.Effect<A, Terminal.QuitError>) =>
      gate.withPermit(
        Effect.suspend(() =>
          released
            ? Effect.fail(new Terminal.QuitError({}))
            : Effect.raceFirst(
                effect,
                Deferred.await(closed).pipe(Effect.flatMap(() => Effect.fail(new Terminal.QuitError({}))))
              )
        )
      )
    const interaction: Interaction = {
      choose: (view) => input(Effect.suspend(() => adapter.choose(view))),
      chooseMany: (view) => input(Effect.suspend(() => adapter.chooseMany(view))),
      confirm: (view) => input(Effect.suspend(() => adapter.confirm(view))),
      hidden: (message) => input(Effect.suspend(() => adapter.hidden(message))),
      present: (text) => Effect.suspend(() => (released ? Effect.void : adapter.present(text)))
    }
    return interaction
  })
export const withInteractionSession = <A, E>(
  use: (interaction: Interaction) => Effect.Effect<A, E>,
  interrupted: Effect.Effect<A, E>,
  source: "stdin" | "controlling-terminal" = "stdin"
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const stop = yield* Deferred.make<void>()
      const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const
      const cancel = () => Deferred.doneUnsafe(stop, Effect.void)
      yield* Effect.acquireRelease(
        Effect.sync(() => signals.forEach((signal) => process.on(signal, cancel))),
        () => Effect.sync(() => signals.forEach((signal) => process.off(signal, cancel)))
      )
      return yield* Effect.raceFirst(
        Effect.gen(function* () {
          const interaction = yield* scopeInteraction(yield* acquireInteraction(source))
          return yield* use(interaction)
        }),
        Deferred.await(stop).pipe(Effect.flatMap(() => interrupted))
      )
    })
  )
