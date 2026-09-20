import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as DecisionModel from "effect/unstable/ai/DecisionModel";
import * as AiError from "effect/unstable/ai/AiError";
import { appendFile } from "node:fs/promises";

export type ControlledDecisionModelOptions = {
  readonly answers?: Readonly<Record<string, DecisionModel.ProviderAnswer>>;
  readonly delayMs?: number;
  readonly failure?: string;
  readonly onRequest?: Effect.Effect<void>;
  /** Test-only subprocess transcript path; never enabled by the live layer. */
  readonly capturePath?: string;
};

export const controlledDecisionModelLayer = (
  options: ControlledDecisionModelOptions,
) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({
      decide: (request) => {
        const answers =
          options.answers ??
          Object.fromEntries(
            Object.keys(request.decisions).map((key) => [
              key,
              { _tag: "Probability", probability: 0 },
            ]),
          );
        const result =
          options.failure === undefined
            ? Effect.succeed({
                answers,
                usage: { inputTokens: 0, outputTokens: 0 },
              })
            : Effect.fail(
                AiError.make({
                  module: "ControlledDecisionModel",
                  method: "decide",
                  reason: new AiError.UnknownError({ description: options.failure }),
                }),
              );
        const delayed =
          options.delayMs === undefined || options.delayMs === 0
            ? result
            : result.pipe(Effect.delay(`${options.delayMs} millis`));
        const capture =
          options.capturePath === undefined
            ? Effect.succeed(undefined)
            : Effect.tryPromise({
                try: () => appendFile(options.capturePath!, "called\n", "utf8"),
                catch: () => new Error("capture unavailable"),
              }).pipe(Effect.catch(() => Effect.succeed(undefined)));
        return (options.onRequest ?? Effect.succeed(undefined)).pipe(
          Effect.andThen(capture),
          Effect.andThen(delayed),
        );
      },
    }),
  );
