import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import * as Result from "effect/Result"
import {
  nativeFailureAggregate,
  nativeFailureValue,
  withNativeSignal,
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

describe("noninterruptible native Effect cleanup", () => {
  it.each([false, true])(
    "settles cleanup before exit and retains interruption with cleanup failure=%s",
    async (fails) => {
      const trace: string[] = []
      let release!: () => void, notify!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      const started = new Promise<void>((resolve) => {
        notify = resolve
      })
      const failure = new Error("cleanup failure")
      const running = Effect.runPromiseExit(
        Effect.withFiber((fiber) => {
          function* flow(): NativeFlow<void> {
            try {
              yield effectNative(Effect.sync(() => fiber.interruptUnsafe()))
            } finally {
              yield effectNative(
                Effect.gen(function* () {
                  trace.push("cleanup:start")
                  notify()
                  yield* Effect.promise(() => pending)
                  trace.push("cleanup:settled")
                  if (fails) return yield* Effect.die(failure)
                }),
                false
              )
            }
          }
          return runNativeEffect(flow(), () => {}).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                trace.push("closed")
              })
            )
          )
        })
      )
      await started
      expect(trace).toEqual(["cleanup:start"])
      release()
      const exit = await running
      expect(trace).toEqual(["cleanup:start", "cleanup:settled", "closed"])
      expect(exit._tag).toBe("Failure")
      if (exit._tag !== "Failure") throw new Error("missing interruption")
      expect(Cause.hasInterrupts(exit.cause)).toBe(true)
      const defects = exit.cause.reasons.filter((reason) => reason._tag === "Die").map((reason) => reason.defect)
      expect(defects).toEqual(fails ? [failure] : [])
      if (fails) expect(exit.cause.reasons[0]?._tag).toBe("Interrupt")
    }
  )
})

describe("retained cleanup flows", () => {
  it("retains construction successes across a falsy Promise cleanup failure", async () => {
    const registry = createNativeSessionRegistry()
    const session = { invocation: 1, close() {} }
    const calls: [number, number] = [0, 0]
    registry.retainCleanup(session, () => {
      calls[0]++
    })
    registry.retainConstructionCleanup(1, session, () => {
      if (++calls[1] === 1) throw undefined
    })
    const failed = await registry.retryCleanup().then(
      () => undefined,
      (error: unknown) => error
    )
    expect(failed).toBeInstanceOf(AggregateError)
    expect((failed as AggregateError).errors).toEqual([undefined])
    expect(registry.pendingCleanup).toBe(1)
    await registry.retryCleanup()
    expect(calls).toEqual([1, 2])
    expect(registry.pendingCleanup).toBe(0)
  })
  it("runs reusable Effect retry in the cleanup caller fiber and context, preserving composite Cause", async () => {
    const registry = createNativeSessionRegistry()
    const marker = Context.Reference<string>("NativeCleanup.marker", { defaultValue: () => "default" })
    const cause = Cause.combine(Cause.die(undefined), Cause.die(false))
    let fail = true,
      observedFiber: unknown,
      observedMarker: string | undefined
    registry.retainCleanupFlow({ invocation: 1, close() {} }, function* (): NativeFlow<void> {
      yield effectNative(
        Effect.gen(function* () {
          observedFiber = yield* Effect.fiber
          observedMarker = yield* marker
          if (fail) return yield* Effect.failCause(cause)
        })
      )
    })
    const retry = registry.retryCleanupEffect()
    await Effect.runPromise(
      Effect.gen(function* () {
        const caller = yield* Effect.fiber
        const exit = yield* Effect.exit(retry)
        expect(exit._tag).toBe("Failure")
        if (exit._tag !== "Failure") throw new Error("missing cleanup failure")
        expect(exit.cause.reasons).toEqual(cause.reasons)
        expect(observedFiber).toBe(caller)
        expect(observedMarker).toBe("caller")
        expect(registry.pendingCleanup).toBe(1)
        fail = false
        yield* retry
        expect(registry.pendingCleanup).toBe(0)
      }).pipe(Effect.provideService(marker, "caller"))
    )
  })
  it("does not discharge a replacement obligation installed during cleanup", async () => {
    const registry = createNativeSessionRegistry()
    const session = { invocation: 1, close() {} }
    let replacement = 0
    registry.retainCleanup(session, () => {
      registry.retainCleanup(session, () => {
        replacement++
      })
    })
    await registry.retryCleanup()
    expect(registry.pendingCleanup).toBe(1)
    expect(replacement).toBe(0)
    await registry.retryCleanup()
    expect(replacement).toBe(1)
    expect(registry.pendingCleanup).toBe(0)
  })
})

describe("retained cleanup Cause transport", () => {
  it("retains exact composite reasons without changing Promise aggregate errors", async () => {
    const defect = new Error("cleanup defect")
    const cause = Cause.combine(Cause.fail(undefined), Cause.die(defect))
    const failure = nativeFailureAggregate([undefined, defect], "cleanup", { cause: undefined }, cause)
    function* flow(): NativeFlow<void> {
      throw failure
    }
    const exit = await Effect.runPromiseExit(runNativeEffect(flow(), () => {}))
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") expect(exit.cause.reasons).toEqual(cause.reasons)
    expect(failure.errors).toEqual([undefined, defect])
    expect(failure.cause).toBeUndefined()
  })
})

describe("independently cancellable native IO", () => {
  it("inherits Context and drains child finalization without interrupting its caller", async () => {
    const marker = Context.Reference("native-io-context", { defaultValue: () => "missing" })
    await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const finalizing = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const controller = new AbortController()
        let settled = false
        let caller: Fiber.Fiber<unknown, unknown> | undefined
        const service = Effect.gen(function* () {
          expect(yield* marker).toBe("caller")
          expect(yield* Effect.fiber).not.toBe(caller)
          yield* Deferred.succeed(started, undefined)
          yield* Effect.never
        }).pipe(Effect.ensuring(Effect.andThen(Deferred.succeed(finalizing, undefined), Deferred.await(release))))
        const task = yield* Effect.forkChild(
          Effect.withFiber((fiber) => {
            caller = fiber
            return Effect.exit(withNativeSignal(service, controller.signal)).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  settled = true
                })
              )
            )
          })
        )
        yield* Deferred.await(started)
        controller.abort()
        yield* Deferred.await(finalizing)
        expect(settled).toBe(false)
        yield* Deferred.succeed(release, undefined)
        const exit = yield* Fiber.join(task)
        expect(exit._tag).toBe("Failure")
        if (exit._tag === "Failure") {
          expect(Cause.hasDies(exit.cause)).toBe(true)
          expect(Cause.hasInterrupts(exit.cause)).toBe(false)
        }
        expect(settled).toBe(true)
        expect(yield* marker).toBe("caller")
      }).pipe(Effect.provideService(marker, "caller"))
    )
  })
  for (const cleanupFails of [false, true])
    it(`preserves caller interruption and ${cleanupFails ? "failed" : "successful"} service finalization`, async () => {
      const cleanupFailure = new Error("native IO finalizer")
      await Effect.runPromise(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>()
          const finalizing = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const service = Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
            Effect.ensuring(
              Effect.andThen(
                Deferred.succeed(finalizing, undefined),
                Effect.andThen(Deferred.await(release), cleanupFails ? Effect.die(cleanupFailure) : Effect.void)
              )
            )
          )
          const task = yield* Effect.forkChild(withNativeSignal(service, new AbortController().signal))
          yield* Deferred.await(started)
          task.interruptUnsafe(991)
          yield* Deferred.await(finalizing)
          yield* Deferred.succeed(release, undefined)
          const exit = yield* Fiber.await(task)
          expect(exit._tag).toBe("Failure")
          if (exit._tag === "Failure") {
            expect(exit.cause.reasons).toHaveLength(cleanupFails ? 2 : 1)
            if (cleanupFails) {
              const reason = exit.cause.reasons[1]
              expect(reason?._tag).toBe("Die")
              if (reason?._tag === "Die") expect(reason.defect).toBe(cleanupFailure)
            }
            expect([...Cause.interruptors(exit.cause)]).toEqual([991])
          }
        })
      )
    })
  it("keeps the direct caller fiber without a signal and never starts pre-aborted IO", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const caller = yield* Effect.fiber
        expect(yield* withNativeSignal(Effect.fiber)).toBe(caller)
        let starts = 0
        const controller = new AbortController()
        controller.abort()
        const exit = yield* Effect.exit(
          withNativeSignal(
            Effect.sync(() => {
              starts++
            }),
            controller.signal
          )
        )
        expect(exit._tag).toBe("Failure")
        expect(starts).toBe(0)
      })
    )
  })
  for (const value of [undefined, null, false, 0, ""]) {
    it(`keeps the raw provider token value ${String(value)}`, async () => {
      function* flow(): NativeFlow<unknown> {
        try {
          yield effectNative(Effect.die(value))
        } catch (error) {
          return nativeFailureValue(error)
        }
      }
      expect(await Effect.runPromise(runNativeEffect(flow(), () => {}))).toBe(value)
    })
  }
})
