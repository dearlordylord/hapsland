import { afterEach } from "vitest"
import { Effect, Exit, Scope } from "effect"
import { makeResidentRuntime, type ResidentRuntime } from "@hapsland/resident-runtime/resident/server"
export type { ResidentRuntime } from "@hapsland/resident-runtime/resident/server"

const scopes = new Set<Scope.Closeable>()
afterEach(async () => {
  for (const scope of scopes) {
    await Effect.runPromise(Scope.close(scope, Exit.void))
    scopes.delete(scope)
  }
})

/** Fixture Promise boundary; production acquires the runtime through its layer. */
export const acquireResidentFixture = (...args: Parameters<typeof makeResidentRuntime>): Promise<ResidentRuntime> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const runtime = yield* makeResidentRuntime(...args).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.onError(() => Scope.close(scope, Exit.void))
      )
      scopes.add(scope)
      return Object.freeze({ ...runtime, close: Scope.close(scope, Exit.void) })
    })
  )
