import { hookMonotonicMillis } from "./hook-clock.ts";
import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Deferred, Effect, Fiber } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { Writable } from "node:stream";
import { makeHookOutput, makeWritableHookOutput } from "./hook-output.ts";

it.effect("uses caller monotonic time for expired output and the unchanged 50ms write reserve", () => Effect.gen(function* () {
  let writes = 0;
  const output = makeHookOutput({
    settleErrors: () => Effect.void, writable: () => true,
    write: (_encoded, complete) => { writes += 1; complete(); },
    onError: () => () => {},
  });
  yield* TestClock.adjust("5 seconds");
  const now = yield* hookMonotonicMillis;
  expect(yield* output.writeEncoded("fixture\n", now)).toBe("timed-out");
  expect(yield* output.write({}, now + 50)).toBe("failed");
  expect(writes).toBe(0);
  expect(yield* output.write({}, now + 51)).toBe("written");
  expect(writes).toBe(1);
}));

it.effect("refuses output before writing when the native deadline or stream is unavailable", () => Effect.gen(function* () {
  let writes = 0;
  const output = makeHookOutput({
    settleErrors: () => Effect.void,
    writable: () => false,
    write: () => { writes += 1; },
    onError: () => { throw new Error("no listener should be acquired"); },
  });
  expect(yield* output.write({}, (yield* hookMonotonicMillis) + 1_000)).toBe("failed");
  expect(yield* output.write({}, (yield* hookMonotonicMillis))).toBe("failed");
  expect(writes).toBe(0);
}));

it.effect("records native callback completion and releases its error observer", () => Effect.gen(function* () {
  let encoded = "";
  let observers = 0;
  const output = makeHookOutput({
    settleErrors: () => Effect.void,
    writable: () => true,
    write: (value, complete) => { encoded = value; complete(); },
    onError: () => { observers += 1; return () => { observers -= 1; }; },
  });
  expect(yield* output.write({ decision: "block" }, (yield* hookMonotonicMillis) + 1_000)).toBe("written");
  expect(encoded).toBe('{"decision":"block"}\n');
  expect(observers).toBe(0);
}));

it.effect("keeps submitted bytes uncertain on deadline and ignores a late callback", () => Effect.gen(function* () {
  const started = yield* Deferred.make<void>();
  let complete: (error?: Error | null) => void = () => {};
  let observers = 0;
  let writes = 0;
  const output = makeHookOutput({
    settleErrors: () => Effect.void,
    writable: () => true,
    write: (_encoded, callback) => {
      writes += 1;
      complete = callback;
      Deferred.doneUnsafe(started, Effect.void);
    },
    onError: () => { observers += 1; return () => { observers -= 1; }; },
  });
  const writing = yield* output.write({ decision: "block" }, (yield* hookMonotonicMillis) + 1_000).pipe(Effect.forkChild);
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
    settleErrors: () => Effect.void,
    writable: () => true,
    write: () => { writes += 1; Deferred.doneUnsafe(started, Effect.void); },
    onError: () => { observers += 1; return () => { observers -= 1; }; },
  });
  const writing = yield* output.write({}, (yield* hookMonotonicMillis) + 1_000).pipe(Effect.forkChild);
  yield* Deferred.await(started);
  yield* Fiber.interrupt(writing);
  expect(observers).toBe(0);
  expect(writes).toBe(1);
}));

it.live("settles a native Writable error event before removing its observer", () => Effect.gen(function* () {
  const stream = new Writable({ write: (_chunk, _encoding, complete) => complete(new Error("fixture write failure")) });
  const output = makeWritableHookOutput(stream);
  expect(yield* output.writeEncoded("fixture\n", (yield* hookMonotonicMillis) + 1_000)).toBe("error");
  expect(stream.listenerCount("error")).toBe(0);
  expect(stream.destroyed).toBe(true);
}));
