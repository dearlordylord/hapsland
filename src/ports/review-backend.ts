import * as Context from "effect/Context";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { Decision, DecisionModel } from "effect/unstable/ai";
import { BackendError } from "../domain/errors.ts";
import type { Rule } from "../policy/rules.ts";

export type BackendAnswer = unknown;

export type BackendResponse = {
  readonly answers: Readonly<Record<string, BackendAnswer>>;
  readonly backend: {
    readonly id: string;
    readonly model?: string;
    readonly durationMs: number;
    readonly retries: number;
    readonly usage: {
      readonly inputTokens?: number;
      readonly outputTokens?: number;
    };
  };
};

export interface Interface {
  readonly evaluate: (options: {
    readonly path: string;
    readonly source: string;
    readonly rules: ReadonlyArray<Rule>;
  }) => Effect.Effect<BackendResponse, BackendError>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@review/ReviewBackend",
) {}

export type ReviewBackendLayerOptions = {
  readonly transientRetries?: number;
};

export const layerWithOptions = (layerOptions: ReviewBackendLayerOptions = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
    const model = yield* DecisionModel.DecisionModel;

    const evaluate = Effect.fn("ReviewBackend.evaluate")(function* (options: {
      readonly path: string;
      readonly source: string;
      readonly rules: ReadonlyArray<Rule>;
    }) {
      const input = yield* Schema.decodeUnknownEffect(Schema.Json)({
        artifact: { domain: options.path, source: options.source },
      }).pipe(
        Effect.mapError(
          () =>
            new BackendError({
              reason: "could not encode the review artifact as JSON",
              retryable: false,
            }),
        ),
      );
      const decisions: Record<string, Decision.Probability> = {};
      for (const rule of options.rules) decisions[rule.id] = rule.decision;
      const definition = Decision.make({ input: Schema.Json, decisions });
      const started = yield* Clock.currentTimeMillis;
      let attempts = 0;
      const response = yield* Effect.sync(() => {
        attempts += 1;
      }).pipe(
        Effect.andThen(model.decide(definition, { input })),
        Effect.mapError(
          (cause) =>
            new BackendError({
              // Provider errors are deliberately not copied into protocol output: an
              // upstream diagnostic can include request material or credentials.
              reason: "review backend request failed",
              retryable:
                cause.reason._tag !== "InvalidOutputError" && cause.isRetryable,
            }),
        ),
        Effect.retry({
          times: layerOptions.transientRetries ?? 2,
          while: (error) => error.retryable,
          schedule: Schedule.exponential("50 millis"),
        }),
      );
      return {
        answers: response.answers,
        backend: {
          id: "jev",
          model: "jev-latest",
          durationMs: Math.max(0, (yield* Clock.currentTimeMillis) - started),
          retries: Math.max(0, attempts - 1),
          usage: {
            ...(response.usage.inputTokens === undefined
              ? undefined
              : { inputTokens: response.usage.inputTokens }),
            ...(response.usage.outputTokens === undefined
              ? undefined
              : { outputTokens: response.usage.outputTokens }),
          },
        },
      };
    });

      return Service.of({ evaluate });
    }),
  );

export const layer = layerWithOptions();

export * as ReviewBackend from "./review-backend.ts";
