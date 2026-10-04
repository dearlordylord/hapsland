import { it } from "@effect/vitest";
import { expect } from "vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import { machineClockLayer } from "../runtime/machine-clock.ts";
import { hookMonotonicMillis, monotonicNow, PRE_EDIT_ADMISSION_DEADLINE_MS } from "./hook-clock.ts";

it.effect("keeps hook deadlines on the injected caller Clock", () => Effect.gen(function* () {
  const before = yield* hookMonotonicMillis;
  yield* TestClock.adjust(PRE_EDIT_ADMISSION_DEADLINE_MS + 1);
  expect((yield* hookMonotonicMillis) - before).toBe(2_501);
}));

it.effect("uses the OS monotonic coordinate only when the production clock layer is provided", () => Effect.gen(function* () {
  yield* TestClock.adjust("42 seconds");
  const injectedWall = yield* Clock.currentTimeMillis;
  const lower = monotonicNow();
  const observed = yield* Effect.gen(function* () {
    return { monotonic: yield* hookMonotonicMillis, wall: yield* Clock.currentTimeMillis };
  }).pipe(Effect.provide(machineClockLayer));
  const upper = monotonicNow();
  expect(observed.monotonic).toBeGreaterThanOrEqual(lower);
  expect(observed.monotonic).toBeLessThanOrEqual(upper);
  expect(observed.wall).toBe(injectedWall);
  expect(yield* hookMonotonicMillis).toBe(42_000);
}));
