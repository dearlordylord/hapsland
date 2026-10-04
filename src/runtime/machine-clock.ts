import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** Linux CLOCK_MONOTONIC timespec, shared by the pinned Node/libuv and Bun processes. */
export const makeLinuxMachineClock = (read: (timespec: BigInt64Array) => number): (() => bigint) => {
  const timespec = new BigInt64Array(2);
  return () => {
    if (read(timespec) !== 0) throw new Error("machine monotonic clock read failed");
    const seconds = timespec[0]!;
    const nanos = timespec[1]!;
    if (seconds < 0n || nanos < 0n || nanos >= 1_000_000_000n) throw new Error("machine monotonic timespec is invalid");
    return seconds * 1_000_000_000n + nanos;
  };
};

/** Darwin libuv 1.52.1 uses mach_continuous_time scaled by mach_timebase_info. */
export const makeDarwinMachineClock = (readTimebase: (timebase: Uint32Array) => number,
  readTicks: () => number | bigint): (() => bigint) => {
  const timebase = new Uint32Array(2);
  if (readTimebase(timebase) !== 0 || timebase[0] === 0 || timebase[1] === 0) throw new Error("machine monotonic timebase is unavailable");
  const numerator = BigInt(timebase[0]!);
  const denominator = BigInt(timebase[1]!);
  return () => {
    const ticks = readTicks();
    if (typeof ticks === "number" && !Number.isSafeInteger(ticks)) throw new Error("machine monotonic ticks are invalid");
    const value = BigInt(ticks);
    if (value < 0n) throw new Error("machine monotonic ticks are invalid");
    return value * numerator / denominator;
  };
};

type NativeClockFfi = Pick<typeof import("bun:ffi"), "dlopen" | "ptr">;
export const createBunMachineClock = (platform: string, { dlopen, ptr }: NativeClockFfi): (() => bigint) => {
  if (platform === "linux") {
    const library = dlopen("libc.so.6", { clock_gettime: { args: ["i32", "ptr"], returns: "i32" } });
    return makeLinuxMachineClock(timespec => library.symbols.clock_gettime(1, ptr(timespec)));
  }
  if (platform === "darwin") {
    const library = dlopen("/usr/lib/libSystem.B.dylib", {
      mach_continuous_time: { args: [], returns: "u64" },
      mach_timebase_info: { args: ["ptr"], returns: "i32" },
    });
    return makeDarwinMachineClock(timebase => library.symbols.mach_timebase_info(ptr(timebase)),
      () => library.symbols.mach_continuous_time());
  }
  throw new Error("machine monotonic clock is unsupported on this platform");
};
const bunMachineClock = async (): Promise<() => bigint> => {
  // This built-in is loaded only inside Bun; Node development/tests keep their native hrtime domain.
  const ffi = await import(/* @vite-ignore */ "bun:ffi");
  return createBunMachineClock(process.platform, ffi);
};

const readMachineClock = typeof process.versions.bun === "string" ? await bunMachineClock() : () => process.hrtime.bigint();
export const machineMonotonicNanos = (): bigint => readMachineClock();

/** Production roots opt into the IPC clock domain; component tests retain their injected Clock. */
export const machineClockLayer = Layer.effect(Clock.Clock, Clock.Clock.pipe(Effect.map(clock => ({
  currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe(),
  currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe(),
  currentTimeMillis: clock.currentTimeMillis,
  currentTimeNanos: clock.currentTimeNanos,
  sleep: duration => clock.sleep(duration),
  monotonicTimeNanosUnsafe: machineMonotonicNanos,
  monotonicTimeNanos: Effect.sync(machineMonotonicNanos),
}))));
