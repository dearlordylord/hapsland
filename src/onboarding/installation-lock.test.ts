import { expect, it } from "@effect/vitest"
import { Clock, ConfigProvider, Deferred, Effect, Fiber } from "effect"
import * as TestClock from "effect/testing/TestClock"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { InstallationLockError, withInstallationLock } from "@hapsland/administration/onboarding/installation-lock"

const fixture = Effect.acquireRelease(
  Effect.sync(() => mkdtempSync(join(tmpdir(), "hapsland-installation-lock-"))),
  (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true }))
)
const currentOwner = (path: string) => {
  const generations = join(path, "generations")
  const latest = readdirSync(generations).sort().at(-1)
  if (latest === undefined) throw new Error("fixture has no published generation")
  return resolve(generations, readlinkSync(join(generations, latest)))
}
const configuration = ConfigProvider.layer(ConfigProvider.fromUnknown({}))

it.effect("releases the published generation on typed failure and allows its successor", () =>
  Effect.gen(function* () {
    const path = yield* fixture
    const failure = yield* withInstallationLock(path, Effect.fail("synthetic-use-failure")).pipe(Effect.result)
    expect(failure).toMatchObject({ _tag: "Failure", failure: "synthetic-use-failure" })
    const first = currentOwner(path)
    expect(existsSync(join(first, "released"))).toBe(true)
    expect(yield* withInstallationLock(path, Effect.succeed("successor"))).toBe("successor")
    expect(currentOwner(path)).not.toBe(first)
    expect(readdirSync(join(path, "generations"))).toEqual(["0000000000000001", "0000000000000002"])
  }).pipe(Effect.provide(configuration))
)

it.effect("interruption releases its published owner without deleting the generation fence", () =>
  Effect.gen(function* () {
    const path = yield* fixture
    const entered = yield* Deferred.make<void>()
    const holding = yield* Effect.forkChild(
      withInstallationLock(path, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))),
      { startImmediately: true }
    )
    yield* Deferred.await(entered)
    const owner = currentOwner(path)
    expect(existsSync(join(owner, "released"))).toBe(false)
    yield* Fiber.interrupt(holding)
    expect((yield* Fiber.await(holding))._tag).toBe("Failure")
    expect(existsSync(join(owner, "released"))).toBe(true)
    expect(currentOwner(path)).toBe(owner)
  }).pipe(Effect.provide(configuration))
)

it.effect("interrupting a waiting candidate preserves the current live owner", () =>
  Effect.gen(function* () {
    const path = yield* fixture
    const entered = yield* Deferred.make<void>()
    const holding = yield* Effect.forkChild(
      withInstallationLock(path, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))),
      { startImmediately: true }
    )
    yield* Deferred.await(entered)
    const owner = currentOwner(path)
    const waiting = yield* Effect.forkChild(withInstallationLock(path, Effect.succeed("must-not-enter")), {
      startImmediately: true
    })
    yield* TestClock.adjust("0 millis")
    expect(readdirSync(join(path, "owners"))).toHaveLength(2)
    yield* Fiber.interrupt(waiting)
    expect(readdirSync(join(path, "owners"))).toHaveLength(1)
    expect(currentOwner(path)).toBe(owner)
    expect(existsSync(join(owner, "released"))).toBe(false)
    yield* Fiber.interrupt(holding)
  }).pipe(Effect.provide(configuration))
)

it.effect("the unchanged 1500ms deadline cleans the losing candidate and reports typed busy failure", () =>
  Effect.gen(function* () {
    const path = yield* fixture
    const entered = yield* Deferred.make<void>()
    const holding = yield* Effect.forkChild(
      withInstallationLock(path, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))),
      { startImmediately: true }
    )
    yield* Deferred.await(entered)
    const waiting = yield* Effect.forkChild(
      withInstallationLock(path, Effect.succeed("must-not-enter")).pipe(Effect.result),
      { startImmediately: true }
    )
    yield* TestClock.adjust("1500 millis")
    const result = yield* Fiber.join(waiting)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(InstallationLockError)
      expect(result.failure.message).toBe("configuration lock remained busy for 1500ms")
    }
    expect(readdirSync(join(path, "owners"))).toHaveLength(1)
    expect(existsSync(join(currentOwner(path), "released"))).toBe(false)
    yield* Fiber.interrupt(holding)
  }).pipe(Effect.provide(configuration))
)

it.effect("invalid published owner targets fail without leaving a new candidate", () =>
  Effect.gen(function* () {
    const path = yield* fixture
    mkdirSync(join(path, "generations"))
    symlinkSync("../owners/invalid", join(path, "generations", "0000000000000001"))
    const result = yield* withInstallationLock(path, Effect.succeed("must-not-enter")).pipe(Effect.result)
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "InstallationLockError", reason: "configuration lock generation has an invalid owner target" }
    })
    expect(readdirSync(join(path, "owners"))).toEqual([])
  }).pipe(Effect.provide(configuration))
)

it.effect("wall-clock nanos jumps cannot expire a waiting lock before its 1500ms monotonic budget", () =>
  Effect.gen(function* () {
    const path = yield* fixture
    const base = yield* Clock.Clock
    let wallNanos = 0n
    let wallReads = 0
    let finished = false
    const clock: Clock.Clock = {
      currentTimeMillis: base.currentTimeMillis,
      currentTimeMillisUnsafe: () => base.currentTimeMillisUnsafe(),
      currentTimeNanos: Effect.sync(() => {
        wallReads += 1
        return wallNanos
      }),
      currentTimeNanosUnsafe: () => wallNanos,
      monotonicTimeNanos: base.monotonicTimeNanos,
      monotonicTimeNanosUnsafe: () => base.monotonicTimeNanosUnsafe(),
      sleep: (duration) => base.sleep(duration)
    }
    const entered = yield* Deferred.make<void>()
    const holding = yield* Effect.forkChild(
      withInstallationLock(path, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))),
      { startImmediately: true }
    )
    yield* Deferred.await(entered)
    const waiting = yield* Effect.forkChild(
      withInstallationLock(path, Effect.succeed("must-not-enter")).pipe(
        Effect.provideService(Clock.Clock, clock),
        Effect.result,
        Effect.tap(() =>
          Effect.sync(() => {
            finished = true
          })
        )
      ),
      { startImmediately: true }
    )
    wallNanos = 1_000_000_000_000_000_000n
    yield* TestClock.adjust("1499 millis")
    expect(finished).toBe(false)
    yield* TestClock.adjust("1 millis")
    expect(yield* Fiber.join(waiting)).toMatchObject({
      _tag: "Failure",
      failure: { reason: "configuration lock remained busy for 1500ms" }
    })
    expect(wallReads).toBe(0)
    expect(readdirSync(join(path, "owners"))).toHaveLength(1)
    yield* Fiber.interrupt(holding)
  }).pipe(Effect.provide(configuration))
)

it.effect("configuration source failures are sanitized before creating any owner", () =>
  Effect.gen(function* () {
    const path = yield* fixture
    const provider = ConfigProvider.layer(
      ConfigProvider.make(() =>
        Effect.fail(new ConfigProvider.SourceError({ message: "synthetic-private-provider-detail" }))
      )
    )
    const result = yield* withInstallationLock(path, Effect.succeed("must-not-enter")).pipe(
      Effect.provide(provider),
      Effect.result
    )
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "InstallationLockError", reason: "configuration lock configuration unavailable" }
    })
    expect(JSON.stringify(result)).not.toContain("synthetic-private-provider-detail")
    expect(readdirSync(path)).toEqual([])
  })
)

it.effect("malformed owner records fail closed without replacing their generation", () =>
  Effect.gen(function* () {
    const root = yield* fixture
    const owner = "12345678-1234-4123-8123-123456789abc"
    const invalids = [
      { version: 2 },
      { pid: 0 },
      { pid: 1.5 },
      { createdAt: "invalid-date" },
      { owner: "invalid-owner" }
    ]
    for (const [index, invalid] of invalids.entries()) {
      const path = join(root, String(index))
      const ownerDirectory = join(path, "owners", owner)
      mkdirSync(ownerDirectory, { recursive: true })
      mkdirSync(join(path, "generations"))
      writeFileSync(
        join(ownerDirectory, "record.json"),
        JSON.stringify({ version: 1, pid: process.pid, createdAt: "2026-10-02T00:00:00.000Z", owner, ...invalid })
      )
      symlinkSync(`../owners/${owner}`, join(path, "generations", "0000000000000001"))
      const result = yield* withInstallationLock(path, Effect.succeed("must-not-enter")).pipe(Effect.result)
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { reason: "configuration lock generation has an invalid owner record" }
      })
      expect(readdirSync(join(path, "owners"))).toEqual([owner])
      expect(readdirSync(join(path, "generations"))).toEqual(["0000000000000001"])
    }
  }).pipe(Effect.provide(configuration))
)
