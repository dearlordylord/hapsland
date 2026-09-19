import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as DecisionModel from "effect/unstable/ai/DecisionModel";
import * as AiError from "effect/unstable/ai/AiError";

export type ControlledDecisionModelOptions = {
  readonly answers?: Readonly<Record<string, DecisionModel.ProviderAnswer>>;
  readonly delayMs?: number;
  readonly failure?: string;
  readonly onRequest?: Effect.Effect<void>;
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
        return (options.onRequest ?? Effect.succeed(undefined)).pipe(
          Effect.andThen(delayed),
        );
      },
    }),
  );
