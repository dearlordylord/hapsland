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

describe("observing native suspension without priming", () => {
  it("starts once and records suspension in the caller fiber", async () => {
    let starts = 0
    function* flow(): NativeFlow<unknown> {
      starts++
      return yield effectNative(Effect.fiber)
    }
    const native = flow()
    const same = await Effect.runPromise(
      Effect.gen(function* () {
        const caller = yield* Effect.fiber
        return (
          (yield* runNativeEffect(
            native,
            () => {},
            () => {}
          )) === caller
        )
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
    const pending = Effect.runPromise(
      runNativeEffect(
        native,
        () => {},
        () => {}
      )
    )
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
    expect(
      await Effect.runPromise(
        runNativeEffect(
          native,
          () => {},
          () => {}
        )
      )
    ).toBe(failure)
  })

  it("preserves the Effect Cause through the native generator", async () => {
    const failure = { nativeDefect: true }
    function* flow(): NativeFlow<never> {
      yield effectNative(Effect.die(failure))
      throw new Error("unexpected success")
    }
    const native = flow()
    const exit = await Effect.runPromiseExit(
      runNativeEffect(
        native,
        () => {},
        () => {}
      )
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag !== "Failure") throw new Error("missing native failure")
    const found = Cause.findDefect(exit.cause)
    expect(Result.isSuccess(found) && found.success).toBe(failure)
  })

  it("notifies interruption before closing the native generator", async () => {
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
        () => {}
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
  it("settles started native work before finalization when interrupted during start", async () => {
    const trace: string[] = []
    const exit = await Effect.runPromiseExit(
      Effect.withFiber((fiber) => {
        function* flow(): NativeFlow<void> {
          const pending = Promise.resolve().then(() => {
            trace.push("settled")
          })
          fiber.interruptUnsafe()
          try {
            yield awaitNative(pending, true)
          } finally {
            trace.push("finally")
          }
        }
        return runNativeEffect(flow(), () => {
          trace.push("interrupt")
        })
      })
    )
    expect(exit._tag).toBe("Failure")
    if (exit._tag !== "Failure") throw new Error("missing startup interruption")
    expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    expect(trace.indexOf("settled")).toBeGreaterThanOrEqual(0)
    expect(trace.indexOf("finally")).toBeGreaterThan(trace.indexOf("settled"))
    expect(trace.filter((value) => value === "interrupt")).toHaveLength(1)
  })
})
