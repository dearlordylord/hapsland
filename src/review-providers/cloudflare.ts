import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { AiError, DecisionModel } from "effect/ai";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import type { ProviderIdentity } from "./catalog.ts";
import { probabilityRequest, requestLimitViolation, type ProbabilityRule } from "./request.ts";

const ResponseBody = Schema.Struct({
  success: Schema.Literal(true),
  errors: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(0)),
  result: Schema.Struct({
    model: Schema.String,
    answers: Schema.Record(Schema.String, Schema.Struct({
      type: Schema.Literal("noul"),
      noul: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
    })),
    usage: Schema.optionalKey(Schema.Struct({
      input_tokens: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
      output_tokens: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    })),
  }),
});

const inputError = (description: string) => AiError.make({
  module: "CloudflareDecisionModel", method: "decide",
  reason: new AiError.InvalidUserInputError({ description }),
});
const outputError = () => AiError.make({
  module: "CloudflareDecisionModel", method: "decide",
  reason: new AiError.InvalidOutputError({ description: "Cloudflare returned an invalid decision response" }),
});

/** One Workers AI REST request, without retries or alternate destinations. */
export const liveLayer = (options: {
  readonly identity: ProviderIdentity;
  readonly credentialEnvVar: string;
  readonly httpClient?: HttpClient.HttpClient;
}) => Layer.effect(DecisionModel.DecisionModel, Effect.gen(function* () {
  const apiKey = yield* Config.Redacted(options.credentialEnvVar);
  const transport = yield* HttpClient.HttpClient;
  const client = HttpClient.filterStatusOk(transport);
  return yield* DecisionModel.make({
    decide: Effect.fn("CloudflareDecisionModel.decide")(function* ({ state, decisions }) {
      if (options.identity.provider !== "cloudflare" || options.identity.model === "jev-latest") {
        return yield* Effect.fail(inputError("invalid Cloudflare model selection"));
      }
      const rules: ProbabilityRule[] = [];
      for (const [id, decision] of Object.entries(decisions)) {
        if (decision._tag !== "Probability") return yield* Effect.fail(inputError("only probability decisions are supported"));
        rules.push({ id, decision });
      }
      const request = probabilityRequest(options.identity.model, state, rules);
      const violation = requestLimitViolation(options.identity.model, request);
      if (violation !== undefined || request === undefined) {
        return yield* Effect.fail(inputError(`request limit: ${violation ?? "invalid-input"}`));
      }
      const response = yield* client.execute(HttpClientRequest.post(options.identity.destination).pipe(
        HttpClientRequest.bearerToken(Redacted.value(apiKey)),
        HttpClientRequest.acceptJson,
        HttpClientRequest.bodyText(request.body, "application/json"),
      )).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ResponseBody)),
        // Deliberately omit raw HTTP/schema errors, which can contain credentials or source.
        Effect.mapError(outputError),
      );
      const wireAnswers = response.result.answers;
      if (response.result.model !== options.identity.model ||
          Object.keys(wireAnswers).length !== Object.keys(request.ids).length ||
          Object.keys(wireAnswers).some((id) => !Object.hasOwn(request.ids, id))) {
        return yield* Effect.fail(outputError());
      }
      const answers: Record<string, DecisionModel.ProviderAnswer> = Object.create(null);
      for (const [wireId, id] of Object.entries(request.ids)) {
        const answer = wireAnswers[wireId];
        if (answer === undefined) return yield* Effect.fail(outputError());
        answers[id] = { _tag: "Probability", probability: answer.noul };
      }
      return { answers, usage: {
        inputTokens: response.result.usage?.input_tokens,
        outputTokens: response.result.usage?.output_tokens,
      } };
    }),
  });
})).pipe(Layer.provide(options.httpClient === undefined ? FetchHttpClient.layer :
  Layer.succeed(HttpClient.HttpClient, options.httpClient)));
