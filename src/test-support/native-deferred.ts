import { Deferred, Effect } from "effect"

/** Async OS fixtures enter Effect at their boundary; service callbacks use wait/complete directly. */
export const nativeDeferred = <A = void>() => {
  const deferred = Effect.runSync(Deferred.make<A>())
  const wait = Deferred.await(deferred)
  const complete = (value: A) => Deferred.succeed(deferred, value).pipe(Effect.asVoid)
  return {
    wait,
    complete,
    get promise(): Promise<A> {
      return Effect.runPromise(wait)
    },
    resolve: (value: A): void => Effect.runSync(complete(value))
  }
}
