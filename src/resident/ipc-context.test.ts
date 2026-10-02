import { expect, it } from "@effect/vitest";
import { Clock, Config, ConfigProvider, Effect, Layer, Ref } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { residentRequestEffect } from "./client.ts";
import { residentPaths } from "./paths.ts";
import { defaultReviewControls, ResidentReviewControls, ReviewControlError } from "./review-controls.ts";
import { makeResidentRuntime } from "./server.ts";

it.live("native IPC request fibers preserve the listener's caller Clock and ConfigProvider", () =>
  Effect.gen(function* () {
    const base = yield* Clock.Clock;
    const clock: Clock.Clock = {
      currentTimeMillis: Effect.succeed(42_424),
      currentTimeMillisUnsafe: () => 42_424,
      currentTimeNanos: base.currentTimeNanos,
      currentTimeNanosUnsafe: () => base.currentTimeNanosUnsafe(),
      monotonicTimeNanos: base.monotonicTimeNanos,
      monotonicTimeNanosUnsafe: () => base.monotonicTimeNanosUnsafe(),
      sleep: duration => base.sleep(duration),
    };
    const observed = yield* Ref.make<{ readonly epoch: number; readonly setting: string } | undefined>(undefined);
    const controls = Layer.succeed(ResidentReviewControls, ResidentReviewControls.of({
      ...defaultReviewControls,
      beforeResponseHandoff: Effect.fn("IpcContextTest.observe")(function* () {
        const epoch = yield* Clock.currentTimeMillis;
        const setting = yield* Config.NonEmptyString("HAPSLAND_TEST_IPC_CONTEXT").pipe(
          Effect.mapError(() => new ReviewControlError({ phase: "beforeResponseHandoff" })),
        );
        yield* Ref.set(observed, { epoch, setting });
      }),
    }));
    yield* Effect.scoped(Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "hapsland-ipc-context-"))),
        directory => Effect.promise(() => rm(directory, { recursive: true, force: true })),
      );
      const paths = residentPaths(directory);
      const runtime = yield* makeResidentRuntime(paths, undefined, { reviewControls: controls });
      yield* runtime.listen();
      const response = yield* residentRequestEffect(paths, { requestRoute: "shared", operation: "hello" });
      expect(response).toMatchObject({ status: "ready", lifetime: runtime.lifetime });
      expect(yield* Ref.get(observed)).toEqual({ epoch: 42_424, setting: "listener-owned" });
    }).pipe(
      Effect.provideService(Clock.Clock, clock),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ HAPSLAND_TEST_IPC_CONTEXT: "listener-owned" }))),
    ));
  }),
);
