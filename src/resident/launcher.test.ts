import { expect, it } from "@effect/vitest"
import { vi } from "vitest"
import { Effect } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { EventEmitter } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ResidentStartup, residentStartupLayer } from "./client.ts"
import { residentPaths } from "./paths.ts"

const native = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: native.spawn
}))

it.effect("keeps one outstanding native launch per service endpoint and retries after physical close", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "hapsland-launch-coalescing-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true }))
    )
    const children: EventEmitter[] = []
    native.spawn.mockReset()
    native.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
      children.push(child)
      queueMicrotask(() => child.emit("spawn"))
      return child
    })
    const startup = yield* ResidentStartup
    const paths = residentPaths(directory)
    yield* startup.launch(paths, 10_000)
    yield* TestClock.adjust(2_001)
    yield* startup.launch(paths, 7_999)
    expect(native.spawn).toHaveBeenCalledTimes(1)
    // Endpoint-local coalescing does not serialize independent residents.
    yield* startup.launch({ ...paths, lock: `${paths.lock}.other` }, 7_999)
    expect(native.spawn).toHaveBeenCalledTimes(2)
    const first = children[0]
    if (first === undefined) throw new Error("missing launched child")
    first.emit("exit", 0)
    yield* TestClock.adjust(2_001)
    yield* startup.launch(paths, 5_998)
    expect(native.spawn).toHaveBeenCalledTimes(2)
    first.emit("close", 0)
    yield* TestClock.adjust(2_001)
    yield* startup.launch(paths, 3_997)
    expect(native.spawn).toHaveBeenCalledTimes(3)
    for (const child of children) child.emit("close", 0)
  }).pipe(Effect.provide(residentStartupLayer))
)

it.effect("retries a failed native spawn and keeps its late close from deleting the replacement", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "hapsland-launch-error-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true }))
    )
    native.spawn.mockReset()
    const failed = Object.assign(new EventEmitter(), { unref: vi.fn() })
    const replacement = Object.assign(new EventEmitter(), { unref: vi.fn() })
    native.spawn
      .mockImplementationOnce(() => {
        queueMicrotask(() => failed.emit("error", new Error("controlled spawn failure")))
        return failed
      })
      .mockImplementation(() => {
        queueMicrotask(() => replacement.emit("spawn"))
        return replacement
      })
    const startup = yield* ResidentStartup
    const paths = residentPaths(directory)
    expect((yield* Effect.exit(startup.launch(paths, 10_000)))._tag).toBe("Failure")
    yield* startup.launch(paths, 10_000)
    expect(native.spawn).toHaveBeenCalledTimes(2)
    failed.emit("close", -1)
    yield* TestClock.adjust(2_001)
    yield* startup.launch(paths, 7_999)
    expect(native.spawn).toHaveBeenCalledTimes(2)
    replacement.emit("close", 0)
  }).pipe(Effect.provide(residentStartupLayer))
)
