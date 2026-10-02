import { it, expect } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { PassThrough } from "node:stream";
import { askConfirmation } from "./confirmation.ts";

const streams = (ready: Deferred.Deferred<void>) => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.on("data", () => { Deferred.doneUnsafe(ready, Effect.void); });
  return { input, output };
};

it.effect("accepts only explicit y and detaches readline input after response", () => Effect.gen(function* () {
  for (const answer of [" Y \n", "yes\n", "\n"]) {
    const ready = yield* Deferred.make<void>();
    const native = streams(ready);
    const asking = yield* askConfirmation("Apply?", native).pipe(Effect.forkScoped);
    yield* Deferred.await(ready);
    native.input.write(answer);
    expect(yield* Fiber.join(asking)).toBe(answer.trim().toLowerCase() === "y");
    expect(native.input.listenerCount("data")).toBe(0);
    expect(native.input.listenerCount("end")).toBe(0);
    native.input.destroy(); native.output.destroy();
  }
}));

it.effect("interruption aborts question and releases readline listeners", () => Effect.gen(function* () {
  const ready = yield* Deferred.make<void>();
  const native = streams(ready);
  const asking = yield* askConfirmation("Apply?", native).pipe(Effect.forkScoped);
  yield* Deferred.await(ready);
  yield* Fiber.interrupt(asking);
  expect((yield* Fiber.await(asking))._tag).toBe("Failure");
  expect(native.input.listenerCount("data")).toBe(0);
  expect(native.input.listenerCount("end")).toBe(0);
  native.input.destroy(); native.output.destroy();
}));
