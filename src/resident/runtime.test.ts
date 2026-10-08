import { createConnection } from "node:net"
import * as TestClock from "effect/testing/TestClock"
import { reviewControlsLayer } from "@hapsland/build-tooling/test-support/review-controls"
import { expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Layer, Scope, Deferred } from "effect"
import { packageBuildIdentity } from "@hapsland/runtime-environment/runtime/package-runtime"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  makeResidentRuntime,
  residentRuntimeLayer,
  ResidentRuntimeService
} from "@hapsland/resident-runtime/resident/server"
import { advicee } from "@hapsland/build-tooling/test-support/test-fixtures"
import { decodeCurrentResidentRequest, MAX_UPDATE_NOTICE_KEYS } from "@hapsland/resident-transport/resident/protocol"
import { residentPaths, resolveResidentPaths } from "@hapsland/resident-transport/resident/paths"

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
      expect(hello).toMatchObject({ status: "ready", lifetime: first.lifetime, build: packageBuildIdentity })
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
          const completed = yield* Effect.forkChild(runtime.operations.whenClosed)
          yield* runtime.listen()
          expect(existsSync(paths.socket)).toBe(true)
          expect(existsSync(paths.owner)).toBe(true)
          expect(completed.pollUnsafe()).toBeUndefined()
          yield* Scope.close(scope, Exit.void)
          yield* Fiber.join(completed)
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

it.effect("an update fences its own lifetime before acknowledging replacement", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* makeResidentRuntime()
      const request = decodeCurrentResidentRequest(
        JSON.stringify({ version: 1, operation: "replace", lifetime: runtime.lifetime })
      )
      expect(request).toBeDefined()
      if (request === undefined) throw new Error("replacement request unavailable")
      expect(yield* runtime.handle(request)).toEqual({ status: "replacing" })
      expect(yield* runtime.handle({ requestRoute: "shared", operation: "hello" })).toEqual({
        status: "obsolete-lifetime"
      })
    })
  )
)

it.effect("incompatible callers have independent ten-minute warning budgets across events and turns", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let clock = 0
      const runtime = yield* makeResidentRuntime(undefined, () => clock)
      const request = (sessionId = "one", subagentId: string | null = null) =>
        decodeCurrentResidentRequest(
          JSON.stringify({
            version: 1,
            hookContract: 2,
            operation: "register-edit",
            lifetime: runtime.lifetime,
            root: "/unused",
            advicee: advicee({ sessionId, subagentId }),
            startedAt: 1
          })
        )
      const warn = (sessionId = "one", subagentId: string | null = null) => {
        const decoded = request(sessionId, subagentId)
        expect(decoded).toBeDefined()
        if (decoded === undefined) throw new Error("caller contract unavailable")
        return runtime.handle(decoded)
      }
      expect(yield* warn()).toEqual({ status: "update-required", warn: true })
      expect(yield* warn()).toEqual({ status: "update-required", warn: false })
      expect(yield* warn("two")).toEqual({ status: "update-required", warn: true })
      expect(yield* warn("one", "child")).toEqual({ status: "update-required", warn: true })
      const changedEvent = decodeCurrentResidentRequest(
        JSON.stringify({
          version: 1,
          hookContract: 3,
          operation: "prompt-marker",
          lifetime: runtime.lifetime,
          root: "/other-root",
          advicee: advicee({ sessionId: "one", turnId: "later-turn", hostVersion: "0.156.0" }),
          marker: "a".repeat(64)
        })
      )
      if (changedEvent === undefined) throw new Error("prompt request unavailable")
      expect(yield* runtime.handle(changedEvent)).toEqual({ status: "update-required", warn: false })
      const concurrent = yield* Effect.all(
        Array.from({ length: 8 }, () => warn("concurrent")),
        { concurrency: "unbounded" }
      )
      expect(concurrent.filter((response) => response.status === "update-required" && response.warn)).toHaveLength(1)
      clock = 599_999
      expect(yield* warn()).toEqual({ status: "update-required", warn: false })
      clock = 600_000
      expect(yield* warn()).toEqual({ status: "update-required", warn: true })
    })
  )
)

it.effect("warning capacity suppresses new recipients without evicting live budgets; restart resets them", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* makeResidentRuntime(undefined, () => 0)
      const warn = (index: number) =>
        runtime.handle({
          requestRoute: "shared",
          operation: "register-edit",
          lifetime: runtime.lifetime,
          hookContract: 2,
          root: "/unused",
          advicee: advicee({ sessionId: String(index) }),
          startedAt: 1
        })
      const grants = yield* Effect.all(
        Array.from({ length: MAX_UPDATE_NOTICE_KEYS }, (_, index) => warn(index)),
        { concurrency: 16 }
      )
      expect(grants.every((response) => response.status === "update-required" && response.warn)).toBe(true)
      expect(yield* warn(MAX_UPDATE_NOTICE_KEYS)).toEqual({ status: "update-required", warn: false })
      expect(yield* warn(0)).toEqual({ status: "update-required", warn: false })
      const restarted = yield* makeResidentRuntime(undefined, () => 0)
      expect(
        yield* restarted.handle({
          requestRoute: "shared",
          operation: "register-edit",
          lifetime: restarted.lifetime,
          hookContract: 2,
          root: "/unused",
          advicee: advicee({ sessionId: "0" }),
          startedAt: 1
        })
      ).toEqual({ status: "update-required", warn: true })
    })
  )
)

it.effect("disconnected update disposes the fenced owner even when its acknowledgment is blocked", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "haps-update-disconnect-"))),
        (path) => Effect.promise(() => rm(path, { recursive: true, force: true }))
      )
      const reached = yield* Deferred.make<void>()
      const paths = residentPaths(directory)
      const runtime = yield* makeResidentRuntime(paths, undefined, {
        reviewControls: reviewControlsLayer({
          beforeResponseHandoff: () => Deferred.succeed(reached, undefined).pipe(Effect.andThen(Effect.never))
        })
      })
      yield* runtime.listen()
      const socket = yield* Effect.acquireRelease(
        Effect.sync(() => createConnection(paths.socket)),
        (socket) => Effect.sync(() => socket.destroy())
      )
      yield* Effect.promise(
        () =>
          new Promise<void>((resolve, reject) => {
            socket.once("error", reject)
            socket.once("connect", () =>
              socket.write(
                JSON.stringify({ version: 1, hookContract: 1, operation: "replace", lifetime: runtime.lifetime }) +
                  "\n",
                () => resolve()
              )
            )
          })
      )
      yield* Deferred.await(reached)
      yield* Effect.sync(() => socket.destroy())
      yield* TestClock.adjust("10 millis")
      yield* runtime.operations.whenClosed
      expect(existsSync(paths.socket)).toBe(false)
      expect(existsSync(paths.owner)).toBe(false)
    })
  )
)
