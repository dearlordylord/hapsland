import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import { expect, it, vi } from "vitest"
import {
  createBunMachineClock,
  makeDarwinMachineClock,
  makeLinuxMachineClock,
  machineClockLayer,
  machineMonotonicNanos
} from "./machine-clock.ts"
import { hookMonotonicMillis } from "../resident/hook-clock.ts"
it("keeps Linux nanoseconds exact across second rollover and rejects native failure or invalid timespecs", () => {
  let seconds = 1n
  let nanos = 999_999_999n
  const clock = makeLinuxMachineClock((buffer) => {
    buffer.set([seconds, nanos])
    return 0
  })
  expect(clock()).toBe(1_999_999_999n)
  seconds = 2n
  nanos = 0n
  expect(clock()).toBe(2_000_000_000n)
  seconds = -1n
  expect(clock).toThrow("timespec is invalid")
  seconds = 1n
  nanos = -1n
  expect(clock).toThrow("timespec is invalid")
  nanos = 1_000_000_000n
  expect(clock).toThrow("timespec is invalid")
  expect(makeLinuxMachineClock(() => -1)).toThrow("clock read failed")
})
it("scales Darwin continuous ticks with integer precision and refuses unusable timebases or ticks", () => {
  const timebase = (buffer: Uint32Array) => {
    buffer.set([125, 3])
    return 0
  }
  const ticks = 90_071_992_547_409_933n
  expect(makeDarwinMachineClock(timebase, () => ticks)()).toBe((ticks * 125n) / 3n)
  expect(makeDarwinMachineClock(timebase, () => 12)()).toBe(500n)
  for (const value of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, -1n])
    expect(makeDarwinMachineClock(timebase, () => value)).toThrow("ticks are invalid")
  expect(() =>
    makeDarwinMachineClock(
      () => -1,
      () => 1n
    )
  ).toThrow("timebase is unavailable")
  expect(() =>
    makeDarwinMachineClock(
      (buffer) => {
        buffer.set([0, 1])
        return 0
      },
      () => 1n
    )
  ).toThrow("timebase is unavailable")
  expect(() =>
    makeDarwinMachineClock(
      (buffer) => {
        buffer.set([1, 0])
        return 0
      },
      () => 1n
    )
  ).toThrow("timebase is unavailable")
})
it("requests the pinned OS symbols, retains their buffers and refuses an unsupported platform", () => {
  const buffers = new Map<number, BigInt64Array | Uint32Array>()
  let id = 0
  const ptr = vi.fn((buffer: BigInt64Array | Uint32Array) => {
    buffers.set(++id, buffer)
    return id
  })
  const dlopen = vi.fn((path: string) => ({
    symbols:
      path === "libc.so.6"
        ? {
            clock_gettime: (clockId: number, pointer: number) => {
              expect(clockId).toBe(1)
              ;(buffers.get(pointer) as BigInt64Array).set([321n, 500n])
              return 0
            }
          }
        : {
            mach_timebase_info: (pointer: number) => {
              ;(buffers.get(pointer) as Uint32Array).set([1, 1])
              return 0
            },
            mach_continuous_time: () => 123n
          }
  }))
  const ffi = { dlopen, ptr } as unknown as Parameters<typeof createBunMachineClock>[1]
  expect(createBunMachineClock("linux", ffi)()).toBe(321_000_000_500n)
  expect(dlopen).toHaveBeenCalledWith("libc.so.6", { clock_gettime: { args: ["i32", "ptr"], returns: "i32" } })
  expect(createBunMachineClock("darwin", ffi)()).toBe(123n)
  expect(dlopen).toHaveBeenCalledWith("/usr/lib/libSystem.B.dylib", {
    mach_continuous_time: { args: [], returns: "u64" },
    mach_timebase_info: { args: ["ptr"], returns: "i32" }
  })
  expect(() => createBunMachineClock("win32", ffi)).toThrow("unsupported on this platform")
})
it("keeps component Clock injection intact while production roots use machine monotonic time", async () => {
  const clock = Clock.Clock.defaultValue()
  const injected = Object.create(clock) as Clock.Clock
  Object.assign(injected, {
    monotonicTimeNanos: Effect.succeed(42_000_000n),
    monotonicTimeNanosUnsafe: () => 42_000_000n
  })
  expect(await Effect.runPromise(hookMonotonicMillis.pipe(Effect.provideService(Clock.Clock, injected)))).toBe(42)
  const before = machineMonotonicNanos()
  const value = await Effect.runPromise(Clock.monotonicTimeNanos.pipe(Effect.provide(machineClockLayer)))
  const after = machineMonotonicNanos()
  expect(value >= before && value <= after).toBe(true)
  await Effect.runPromise(
    Effect.gen(function* () {
      const active = yield* Clock.Clock
      expect(Number.isFinite(active.currentTimeMillisUnsafe())).toBe(true)
      expect(active.currentTimeNanosUnsafe()).toBeGreaterThan(0n)
      expect(yield* active.currentTimeMillis).toBeGreaterThan(0)
      expect(yield* active.currentTimeNanos).toBeGreaterThan(0n)
      yield* Effect.sleep("1 millis")
    }).pipe(Effect.provide(machineClockLayer))
  )
})
