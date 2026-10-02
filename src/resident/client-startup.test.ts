import * as TestClock from "effect/testing/TestClock";
import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Clock, Deferred, Effect, Exit, Fiber, Layer, Ref } from "effect";
import { ResidentIpcError, ResidentLauncher, makeResidentStartup } from "./client.ts";
import { residentPaths } from "./paths.ts";

const paths = residentPaths("/controlled-resident");

it.effect("shares launch throttling in one acquisition and isolates another acquisition", () => Effect.gen(function* () {
  const clock = yield* Ref.make(0);
  const spawned = yield* Ref.make<ReadonlyArray<string>>([]);
  const platform = Layer.succeed(ResidentLauncher, ResidentLauncher.of({
    now: Ref.get(clock),
    spawn: (endpoint) => Ref.update(spawned, (values) => [...values, endpoint.lock]),
  }));
  const recipe = makeResidentStartup.pipe(Effect.provide(platform));
  const first = yield* recipe;
  yield* Effect.all(Array.from({ length: 8 }, () => first.launch(paths, 10_000)), { concurrency: "unbounded" });
  expect(yield* Ref.get(spawned)).toEqual([paths.lock]);
  yield* Ref.set(clock, 1_999);
  yield* first.launch(paths, 10_000);
  expect(yield* Ref.get(spawned)).toHaveLength(1);
  yield* Ref.set(clock, 2_000);
  yield* first.launch(paths, 10_000);
  expect(yield* Ref.get(spawned)).toHaveLength(2);
  const second = yield* recipe;
  yield* second.launch(paths, 10_000);
  expect(yield* Ref.get(spawned)).toHaveLength(3);
}));

it.effect("releases a failed launch claim so the same endpoint can retry immediately", () => Effect.gen(function* () {
  const calls = yield* Ref.make(0);
  const startup = yield* makeResidentStartup.pipe(Effect.provideService(ResidentLauncher, ResidentLauncher.of({
    now: Effect.succeed(0),
    spawn: () => Ref.updateAndGet(calls, (count) => count + 1).pipe(Effect.flatMap((count) =>
      count === 1 ? Effect.fail(new ResidentIpcError({ message: "controlled launch failure" })) : Effect.void)),
  })));
  expect(yield* startup.launch(paths, 10_000).pipe(Effect.flip)).toBeInstanceOf(ResidentIpcError);
  yield* startup.launch(paths, 10_000);
  expect(yield* Ref.get(calls)).toBe(2);
}));

it.effect("an old launch failure cannot erase a newer claim after expiry", () => Effect.gen(function* () {
  const clock = yield* Ref.make(0);
  const calls = yield* Ref.make(0);
  const started = yield* Deferred.make<void>();
  const finish = yield* Deferred.make<void>();
  const startup = yield* makeResidentStartup.pipe(Effect.provideService(ResidentLauncher, ResidentLauncher.of({
    now: Ref.get(clock),
    spawn: () => Effect.gen(function* () {
      const count = yield* Ref.updateAndGet(calls, (value) => value + 1);
      if (count !== 1) return;
      yield* Deferred.succeed(started, undefined);
      yield* Deferred.await(finish);
      return yield* Effect.fail(new ResidentIpcError({ message: "old launch failed" }));
    }),
  })));
  const old = yield* startup.launch(paths, 10_000).pipe(Effect.forkScoped);
  yield* Deferred.await(started);
  yield* Ref.set(clock, 2_000);
  yield* startup.launch(paths, 10_000);
  yield* Deferred.succeed(finish, undefined);
  expect(Exit.isFailure(yield* Fiber.await(old))).toBe(true);
  yield* startup.launch(paths, 10_000);
  expect(yield* Ref.get(calls)).toBe(2);
}));

it.effect("waits for native spawn acknowledgement through interruption", () => Effect.gen(function* () {
  const started = yield* Deferred.make<void>();
  const finish = yield* Deferred.make<void>();
  const calls = yield* Ref.make(0);
  const acknowledged = yield* Ref.make(false);
  const startup = yield* makeResidentStartup.pipe(Effect.provideService(ResidentLauncher, ResidentLauncher.of({
    now: Effect.succeed(0),
    spawn: () => Effect.gen(function* () {
      yield* Ref.update(calls, (count) => count + 1);
      yield* Deferred.succeed(started, undefined);
      yield* Deferred.await(finish);
      yield* Ref.set(acknowledged, true);
    }),
  })));
  const launch = yield* startup.launch(paths, 10_000).pipe(Effect.forkScoped);
  yield* Deferred.await(started);
  const interrupting = yield* Fiber.interrupt(launch).pipe(Effect.forkScoped);
  yield* startup.launch(paths, 10_000);
  expect(yield* Ref.get(calls)).toBe(1);
  expect(yield* Ref.get(acknowledged)).toBe(false);
  yield* Deferred.succeed(finish, undefined);
  yield* Fiber.join(interrupting);
  expect(yield* Ref.get(acknowledged)).toBe(true);
}));

it.effect("launch claim expiry follows the caller Effect clock", () => Effect.gen(function* () {
  const calls = yield* Ref.make(0);
  const startup = yield* makeResidentStartup.pipe(Effect.provideService(ResidentLauncher, ResidentLauncher.of({
    now: Clock.monotonicTimeNanos.pipe(Effect.map((now) => Number(now / 1_000_000n))),
    spawn: () => Ref.update(calls, (count) => count + 1),
  })));
  yield* startup.launch(paths, 10_000);
  yield* TestClock.adjust("1999 millis");
  yield* startup.launch(paths, 10_000);
  expect(yield* Ref.get(calls)).toBe(1);
  yield* TestClock.adjust("1 millis");
  yield* startup.launch(paths, 10_000);
  expect(yield* Ref.get(calls)).toBe(2);
}));
