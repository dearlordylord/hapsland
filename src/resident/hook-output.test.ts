import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Deferred, Effect, Fiber } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { makeHookOutput } from "./hook-output.ts";

it.effect("refuses output before writing when the native deadline or stream is unavailable", () => Effect.gen(function* () {
  let writes = 0;
  const output = makeHookOutput({
    writable: () => false,
    write: () => { writes += 1; },
    onError: () => { throw new Error("no listener should be acquired"); },
  });
  expect(yield* output.write({}, performance.now() + 1_000)).toBe("failed");
  expect(yield* output.write({}, performance.now())).toBe("failed");
  expect(writes).toBe(0);
}));

it.effect("records native callback completion and releases its error observer", () => Effect.gen(function* () {
  let encoded = "";
  let observers = 0;
  const output = makeHookOutput({
    writable: () => true,
    write: (value, complete) => { encoded = value; complete(); },
    onError: () => { observers += 1; return () => { observers -= 1; }; },
  });
  expect(yield* output.write({ decision: "block" }, performance.now() + 1_000)).toBe("written");
  expect(encoded).toBe('{"decision":"block"}\n');
  expect(observers).toBe(0);
}));

it.effect("keeps submitted bytes uncertain on deadline and ignores a late callback", () => Effect.gen(function* () {
  const started = yield* Deferred.make<void>();
  let complete: (error?: Error | null) => void = () => {};
  let observers = 0;
  let writes = 0;
  const output = makeHookOutput({
    writable: () => true,
    write: (_encoded, callback) => {
      writes += 1;
      complete = callback;
      Deferred.doneUnsafe(started, Effect.void);
    },
    onError: () => { observers += 1; return () => { observers -= 1; }; },
  });
  const writing = yield* output.write({ decision: "block" }, performance.now() + 1_000).pipe(Effect.forkChild);
  yield* Deferred.await(started);
  yield* TestClock.adjust("1 second");
  expect(yield* Fiber.join(writing)).toBe("uncertain");
  expect(observers).toBe(0);
  complete();
  expect(writes).toBe(1);
  expect(yield* Fiber.join(writing)).toBe("uncertain");
}));

it.effect("interrupts observation without retrying or treating submitted bytes as refused", () => Effect.gen(function* () {
  const started = yield* Deferred.make<void>();
  let observers = 0;
  let writes = 0;
  const output = makeHookOutput({
    writable: () => true,
    write: () => { writes += 1; Deferred.doneUnsafe(started, Effect.void); },
    onError: () => { observers += 1; return () => { observers -= 1; }; },
  });
  const writing = yield* output.write({}, performance.now() + 1_000).pipe(Effect.forkChild);
  yield* Deferred.await(started);
  yield* Fiber.interrupt(writing);
  expect(observers).toBe(0);
  expect(writes).toBe(1);
}));
