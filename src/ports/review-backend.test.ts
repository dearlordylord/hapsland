import { describe, expect, it } from "@effect/vitest";
import * as AiError from "effect/unstable/ai/AiError";
import * as DecisionModel from "effect/unstable/ai/DecisionModel";
import * as Decision from "effect/unstable/ai/Decision";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import { configuredRules } from "../policy/rules.ts";
import { BackendError } from "../domain/errors.ts";
import {
  REVIEW_RETRY_BACKOFF_MS,
  ReviewBackend,
} from "./review-backend.ts";

const input = {
  path: "src/example.ts",
  source: "export type Count = { value: number; unit: string };\n",
  rules: configuredRules,
};

const providerAnswers = (
  decisions: Readonly<Record<string, Decision.Any>>,
): Readonly<Record<string, DecisionModel.ProviderAnswer>> =>
  Object.fromEntries(
    Object.keys(decisions).map((key) => [
      key,
      { _tag: "Probability" as const, probability: 0 },
    ]),
  );

const transientError = () =>
  AiError.make({
    module: "ReviewBackendTest",
    method: "decide",
    reason: new AiError.InternalProviderError({ description: "transient" }),
  });

describe("review backend retry policy", () => {
  it.effect("rechecks the credential capability at each provider dispatch", () =>
    Effect.gen(function* () {
      const generationCurrent = yield* Ref.make(true);
      const providerCalls = yield* Ref.make(0);
      const modelLayer = Layer.effect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: (request) =>
            Ref.update(providerCalls, (value) => value + 1).pipe(
              Effect.as({
                answers: providerAnswers(request.decisions),
                usage: { inputTokens: 0, outputTokens: 0 },
              }),
            ),
        }),
      );
      const backendLayer = ReviewBackend.layerWithOptions({
        transientRetries: 2,
        beforeDispatch: Ref.get(generationCurrent).pipe(
          Effect.flatMap((current) => current
            ? Effect.void
            : Effect.fail(new BackendError({
                reason: "credential generation changed after authorization",
                retryable: false,
              }))),
        ),
      }).pipe(Layer.provide(modelLayer));
      const program = Effect.gen(function* () {
        const backend = yield* ReviewBackend.Service;
        yield* backend.evaluate(input);
        // Models an invalidation in another process after the request's
        // credential snapshot and authorization but before its next path.
        yield* Ref.set(generationCurrent, false);
        return yield* backend.evaluate({ ...input, path: "src/second.ts" }).pipe(Effect.result);
      });

      const result = yield* program.pipe(Effect.provide(backendLayer));
      expect(result._tag).toBe("Failure");
      expect(yield* Ref.get(providerCalls)).toBe(1);
    }),
  );

  it.effect("uses a fixed backoff and stops after the configured retry count", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const attempts = yield* Ref.make(0);
        const first = yield* Deferred.make<void>();
        const second = yield* Deferred.make<void>();
        const third = yield* Deferred.make<void>();
        const modelLayer = Layer.effect(
          DecisionModel.DecisionModel,
          DecisionModel.make({
            decide: (request) =>
              Effect.gen(function* () {
                const attempt = yield* Ref.updateAndGet(attempts, (value) => value + 1);
                if (attempt === 1) yield* Deferred.succeed(first, undefined);
                if (attempt === 2) yield* Deferred.succeed(second, undefined);
                if (attempt === 3) yield* Deferred.succeed(third, undefined);
                if (attempt < 3) return yield* Effect.fail(transientError());
                return {
                  answers: providerAnswers(request.decisions),
                  usage: { inputTokens: 0, outputTokens: 0 },
                };
              }),
          }),
        );
        const backendLayer = ReviewBackend.layerWithOptions({ transientRetries: 2 }).pipe(
          Layer.provide(modelLayer),
        );
        const fiber = yield* Effect.gen(function* () {
          const backend = yield* ReviewBackend.Service;
          return yield* backend.evaluate(input);
        }).pipe(Effect.provide(backendLayer), Effect.forkChild);

        yield* Deferred.await(first);
        yield* Effect.yieldNow;
        expect(yield* Ref.get(attempts)).toBe(1);
        yield* TestClock.adjust(`${REVIEW_RETRY_BACKOFF_MS - 1} millis`);
        expect(yield* Ref.get(attempts)).toBe(1);
        yield* TestClock.adjust("1 millis");
        yield* Deferred.await(second);
        expect(yield* Ref.get(attempts)).toBe(2);
        yield* TestClock.adjust(`${REVIEW_RETRY_BACKOFF_MS} millis`);
        yield* Deferred.await(third);

        const result = yield* Fiber.join(fiber);
        expect(result.backend.retries).toBe(2);
        expect(result.backend.durationMs).toBe(REVIEW_RETRY_BACKOFF_MS * 2);
        expect(yield* Ref.get(attempts)).toBe(3);
      }),
    ),
  );

  it.effect("counts retry backoff against the per-file deadline", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const attempts = yield* Ref.make(0);
        const first = yield* Deferred.make<void>();
        const second = yield* Deferred.make<void>();
        const modelLayer = Layer.effect(
          DecisionModel.DecisionModel,
          DecisionModel.make({
            decide: () =>
              Effect.gen(function* () {
                const attempt = yield* Ref.updateAndGet(attempts, (value) => value + 1);
                if (attempt === 1) yield* Deferred.succeed(first, undefined);
                if (attempt === 2) yield* Deferred.succeed(second, undefined);
                return yield* Effect.fail(transientError());
              }),
          }),
        );
        const backendLayer = ReviewBackend.layerWithOptions({ transientRetries: 2 }).pipe(
          Layer.provide(modelLayer),
        );
        const fiber = yield* Effect.gen(function* () {
          const backend = yield* ReviewBackend.Service;
          return yield* backend.evaluate(input).pipe(
            Effect.timeoutOption("75 millis"),
          );
        }).pipe(Effect.provide(backendLayer), Effect.forkChild);

        yield* Deferred.await(first);
        yield* Effect.yieldNow;
        yield* TestClock.adjust(`${REVIEW_RETRY_BACKOFF_MS} millis`);
        yield* Deferred.await(second);
        yield* TestClock.adjust("25 millis");
        const result = yield* Fiber.join(fiber);
        expect(Option.isNone(result)).toBe(true);
        expect(yield* Ref.get(attempts)).toBe(2);
      }),
    ),
  );

  it.effect("does not retry a permanent provider failure", () =>
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const modelLayer = Layer.effect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          decide: () =>
            Effect.gen(function* () {
              yield* Ref.update(attempts, (value) => value + 1);
              return yield* Effect.fail(
                AiError.make({
                  module: "ReviewBackendTest",
                  method: "decide",
                  reason: new AiError.AuthenticationError({ kind: "InvalidKey" }),
                }),
              );
            }),
        }),
      );
      const backendLayer = ReviewBackend.layerWithOptions({ transientRetries: 2 }).pipe(
        Layer.provide(modelLayer),
      );
      const result = yield* Effect.gen(function* () {
        const backend = yield* ReviewBackend.Service;
        return yield* backend.evaluate(input).pipe(Effect.result);
      }).pipe(Effect.provide(backendLayer));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.retryable).toBe(false);
      }
      expect(yield* Ref.get(attempts)).toBe(1);
    }),
  );
});
