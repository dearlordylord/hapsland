import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Deferred, Exit, Fiber, Scope } from "effect"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { makeResidentResources } from "../../../../dist/resident/composition/resources.js"
import { makeResidentLifecycle } from "../../../../dist/resident/endpoint-lifecycle/lifecycle.js"

// Exercise normal compiled resource/lifecycle owners. Empty work ports isolate
// the retained-cleanup failure without introducing a product fault-injection API.
const fixture = async (cleanup, transfer = true) => {
  const directory = await mkdtemp(join(tmpdir(), "hapsland-cleanup-custody-"))
  const scope = await Effect.runPromise(Scope.make())
  const resources = await Effect.runPromise(
    makeResidentResources(residentPaths(directory), () => 0, {}).pipe(Effect.provideService(Scope.Scope, scope))
  )
  const retired = []
  for (const [name, child] of [
    ["ipc", resources.residentIpcScope],
    ["dispatch", resources.residentDispatchScope],
    ["controls", resources.residentControlScope]
  ])
    await Effect.runPromise(
      Scope.addFinalizer(
        child,
        Effect.sync(() => retired.push(name))
      )
    )
  const workflows = {
    admission: { residentRoundSnapshot: () => Effect.die(new Error("unexpected round")) },
    workLifecycle: {
      sweepQuietRounds: () => Effect.succeed(0),
      residentReleaseReuseClaim: () => Effect.void,
      residentReleaseUnit: () => Effect.void,
      residentRemoveAdvice: () => Effect.succeed(false),
      residentReleaseNoticeCooldown: () => Effect.void
    },
    ipc: { residentAccept: () => Effect.void, inspectionAccept: () => Effect.void }
  }
  const lifecycle = await Effect.runPromise(
    makeResidentLifecycle({ ...resources, residentPreparationCleanup: () => cleanup }, workflows, {
      residentDispatcher: { close: () => Effect.succeed([]), whenIdle: () => Effect.void },
      cleanup: () => Effect.succeed("cleaned"),
      residentAdvice: () => Effect.succeed([])
    })
  )
  if (transfer)
    await Effect.runPromise(
      resources.residentOwnLifecycleScopes(lifecycle.close).pipe(Effect.provideService(Scope.Scope, scope))
    )
  return {
    scope,
    resources,
    lifecycle,
    retired,
    async dispose() {
      if (transfer) await Effect.runPromise(lifecycle.close)
      await Effect.runPromiseExit(Scope.close(scope, Exit.void))
      await rm(directory, { recursive: true, force: true })
    }
  }
}
const assertOriginalFailure = (exit, original) => {
  assert.ok(Exit.isFailure(exit))
  assert.ok(exit.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === original))
}

for (const outerScope of [false, true])
  test(`failed ${outerScope ? "enclosing Scope" : "explicit close"} retains services for actual close retry`, async () => {
    const original = new Error("native cleanup failed once")
    let attempts = 0
    const owned = await fixture(
      Effect.sync(() => {
        if (++attempts === 1) throw original
      })
    )
    try {
      const exit = await Effect.runPromiseExit(outerScope ? Scope.close(owned.scope, Exit.void) : owned.lifecycle.close)
      assertOriginalFailure(exit, original)
      assert.equal(attempts, 1)
      assert.deepEqual(owned.retired, [])
      assert.equal(await Effect.runPromise(Deferred.isDone(owned.resources.closed)), false)
      await Effect.runPromise(owned.lifecycle.close)
      assert.equal(attempts, 2)
      assert.deepEqual([...owned.retired].sort(), ["controls", "dispatch", "ipc"])
      assert.equal(await Effect.runPromise(Deferred.isDone(owned.resources.closed)), true)
      await Effect.runPromise(owned.lifecycle.close)
      assert.equal(attempts, 2)
    } finally {
      await owned.dispose()
    }
  })

test("concurrent close performs cleanup once and remembers only successful teardown", async () => {
  const entered = Deferred.makeUnsafe()
  const released = Deferred.makeUnsafe()
  let attempts = 0
  const owned = await fixture(
    Effect.gen(function* () {
      attempts++
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(released)
    })
  )
  try {
    const first = Effect.runFork(owned.lifecycle.close)
    await Effect.runPromise(Deferred.await(entered))
    const second = Effect.runFork(owned.lifecycle.close)
    assert.equal(attempts, 1)
    await Effect.runPromise(Deferred.succeed(released, undefined))
    await Effect.runPromise(Fiber.join(first).pipe(Effect.andThen(Fiber.join(second))))
    assert.equal(attempts, 1)
    assert.equal(await Effect.runPromise(Deferred.isDone(owned.resources.closed)), true)
    assert.equal(owned.retired.length, 3)
  } finally {
    await Effect.runPromise(Deferred.succeed(released, undefined))
    await owned.dispose()
  }
})

test("interrupted successful close records completion before releasing ownership", async () => {
  const entered = Deferred.makeUnsafe()
  const released = Deferred.makeUnsafe()
  let attempts = 0
  const owned = await fixture(
    Effect.gen(function* () {
      attempts++
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(released)
    })
  )
  const controller = new AbortController()
  try {
    const closing = Effect.runPromiseExit(owned.lifecycle.close, { signal: controller.signal })
    await Effect.runPromise(Deferred.await(entered))
    controller.abort()
    await Effect.runPromise(Deferred.succeed(released, undefined))
    await closing
    assert.equal(attempts, 1)
    assert.equal(owned.retired.length, 3)
    assert.equal(await Effect.runPromise(Deferred.isDone(owned.resources.closed)), true)
    await Effect.runPromise(owned.lifecycle.close)
    assert.equal(attempts, 1)
  } finally {
    await Effect.runPromise(Deferred.succeed(released, undefined))
    await owned.dispose()
  }
})

test("construction failure before lifecycle ownership transfer closes child services", async () => {
  let cleanupCalls = 0
  const owned = await fixture(
    Effect.sync(() => {
      cleanupCalls++
    }),
    false
  )
  const original = new Error("composition failed before ownership transfer")
  try {
    const exit = await Effect.runPromiseExit(
      Effect.fail(original).pipe(Effect.ensuring(Scope.close(owned.scope, Exit.void)))
    )
    assert.ok(Exit.isFailure(exit))
    assert.ok(exit.cause.reasons.some((reason) => reason._tag === "Fail" && reason.error === original))
    assert.deepEqual([...owned.retired].sort(), ["controls", "dispatch", "ipc"])
    assert.equal(cleanupCalls, 0)
  } finally {
    await owned.dispose()
  }
})
