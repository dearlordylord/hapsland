import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import * as Result from "effect/Result"
import {
  awaitNative,
  effectNative,
  runNativeEffect,
  type NativeFlow
} from "@hapsland/runtime-environment/runtime/native-execution"

describe("continuing an already started native flow", () => {
  it("consumes the first suspension once in the caller fiber", async () => {
    let starts = 0
    function* flow(): NativeFlow<unknown> {
      starts++
      return yield effectNative(Effect.fiber)
    }
    const native = flow()
    const first = native.next()
    const same = await Effect.runPromise(
      Effect.gen(function* () {
        const caller = yield* Effect.fiber
        return (yield* runNativeEffect(native, () => {}, first)) === caller
      })
    )
    expect(same).toBe(true)
    expect(starts).toBe(1)
  })

  it("keeps an already fulfilled Promise suspended", async () => {
    const trace: string[] = []
    function* flow(): NativeFlow<unknown> {
      trace.push("start")
      const value = yield awaitNative(Promise.resolve(7))
      trace.push("resume")
      return value
    }
    const native = flow()
    const first = native.next()
    const pending = Effect.runPromise(runNativeEffect(native, () => {}, first))
    expect(trace).toEqual(["start"])
    expect(await pending).toBe(7)
    expect(trace).toEqual(["start", "resume"])
  })

  it.each([undefined, null, false, 0, ""])("preserves raw Promise rejection %s", async (failure) => {
    function* flow(): NativeFlow<unknown> {
      try {
        yield awaitNative(Promise.reject(failure))
        throw new Error("unexpected success")
      } catch (error) {
        return error
      }
    }
    const native = flow()
    expect(await Effect.runPromise(runNativeEffect(native, () => {}, native.next()))).toBe(failure)
  })

  it("preserves the Effect Cause through the started generator", async () => {
    const failure = { nativeDefect: true }
    function* flow(): NativeFlow<never> {
      yield effectNative(Effect.die(failure))
      throw new Error("unexpected success")
    }
    const native = flow()
    const exit = await Effect.runPromiseExit(runNativeEffect(native, () => {}, native.next()))
    expect(exit._tag).toBe("Failure")
    if (exit._tag !== "Failure") throw new Error("missing native failure")
    const found = Cause.findDefect(exit.cause)
    expect(Result.isSuccess(found) && found.success).toBe(failure)
  })

  it("notifies interruption before closing the started generator", async () => {
    const started = Deferred.makeUnsafe<void>()
    const trace: string[] = []
    function* flow(): NativeFlow<void> {
      try {
        yield effectNative(
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined)
            yield* Effect.never
          })
        )
      } finally {
        trace.push("finally")
      }
    }
    const native = flow()
    const fiber = Effect.runFork(
      runNativeEffect(
        native,
        () => {
          trace.push("interrupt")
        },
        native.next()
      )
    )
    await Effect.runPromise(Deferred.await(started))
    await Effect.runPromise(Fiber.interrupt(fiber))
    const exit = await Effect.runPromise(Fiber.await(fiber))
    expect(exit._tag).toBe("Failure")
    if (exit._tag !== "Failure") throw new Error("missing interruption")
    expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    expect(trace).toEqual(["interrupt", "finally"])
  })
})
