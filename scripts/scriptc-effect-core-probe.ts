import * as Effect from "effect/Effect"

// Matches upstream's Effect 4 core-all-record control; no hook claim.
Effect.runPromise(
  Effect.all({ one: Effect.succeed(1), two: Effect.succeed("two") }).pipe(
    Effect.tap((value) => Effect.sync(() => console.log(JSON.stringify(value))))
  )
)
