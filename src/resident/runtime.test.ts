import { expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Scope } from "effect"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeResidentRuntime, residentRuntimeLayer, ResidentRuntimeService } from "./server.ts"
import { residentPaths, resolveResidentPaths } from "./paths.ts"

it.effect("separate acquisitions own separate resident lifetimes", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const first = yield* makeResidentRuntime()
      const second = yield* makeResidentRuntime()
      expect(first.lifetime).not.toBe(second.lifetime)
      expect(yield* first.accountingMetrics()).toEqual(yield* second.accountingMetrics())
    })
  )
)

it.effect("a provided layer shares one runtime within its scope", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const first = yield* ResidentRuntimeService
      const second = yield* ResidentRuntimeService
      expect(first).toBe(second)
      const hello = yield* first.handle({ requestRoute: "shared", operation: "hello" })
      expect(hello).toMatchObject({ status: "ready", lifetime: first.lifetime })
      expect((yield* first.stats()).running).toBe(0)
      yield* first.whenIdle()
    }).pipe(Effect.provide(Layer.unwrap(resolveResidentPaths().pipe(Effect.map(residentRuntimeLayer)))))
  )
)

it.effect("scope closure removes owned endpoints and fences the retired lifetime", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "hapsland-runtime-scope-")))
    yield* Effect.acquireUseRelease(
      Scope.make(),
      (scope) =>
        Effect.gen(function* () {
          const paths = residentPaths(directory)
          const runtime = yield* makeResidentRuntime(paths).pipe(Effect.provideService(Scope.Scope, scope))
          yield* runtime.listen()
          expect(existsSync(paths.socket)).toBe(true)
          expect(existsSync(paths.owner)).toBe(true)
          yield* Scope.close(scope, Exit.void)
          expect(existsSync(paths.socket)).toBe(false)
          expect(existsSync(paths.owner)).toBe(false)
          expect(yield* runtime.handle({ requestRoute: "shared", operation: "hello" })).toMatchObject({
            status: "obsolete-lifetime"
          })
        }),
      (scope) =>
        Scope.close(scope, Exit.void).pipe(
          Effect.ensuring(Effect.promise(() => rm(directory, { recursive: true, force: true })))
        )
    )
  })
)
