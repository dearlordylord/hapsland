import { reviewHttpTransport } from "./transport.ts"
import { assertReviewEngineBoundary } from "@hapsland/runtime-environment/runtime/review-engine-boundary"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { AiError, DecisionModel } from "effect/ai"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import type { ProviderIdentity } from "@hapsland/review-definition/review-providers/catalog"
import { OPENAI_DESTINATION, OPENAI_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"
import { probabilityRequest, requestLimitViolation, type ProbabilityRule } from "./request.ts"

assertReviewEngineBoundary(OPENAI_PROVIDER.id)

const TokenCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const ResponseBody = Schema.Struct({
  model: Schema.String,
  answers: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("predicate"),
      name: Schema.String,
      probability: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
    })
  ),
  usage: Schema.Struct({ input_tokens: TokenCount, output_tokens: TokenCount })
})

const inputError = (description: string) =>
  AiError.make({
    module: "OpenAIDecisionModel",
    method: "decide",
    reason: new AiError.InvalidUserInputError({ description })
  })
const outputError = () =>
  AiError.make({
    module: "OpenAIDecisionModel",
    method: "decide",
    reason: new AiError.InvalidOutputError({ description: "OpenAI returned an invalid decision response" })
  })

const probabilityRules = Effect.fn("OpenAIDecisionModel.probabilityRules")(function* (
  decisions: Readonly<Record<string, import("effect/ai").Decision.Any>>
) {
  const rules: ProbabilityRule[] = []
  for (const [id, decision] of Object.entries(decisions)) {
    if (decision._tag !== "Probability")
      return yield* Effect.fail(inputError("only probability decisions are supported"))
    rules.push({ id, decision })
  }
  return rules
})

const decodeAnswers = Effect.fn("OpenAIDecisionModel.decodeAnswers")(function* (
  response: typeof ResponseBody.Type,
  ids: Readonly<Record<string, string>>,
  model: string
) {
  if (response.model !== model || response.answers.length !== Object.keys(ids).length)
    return yield* Effect.fail(outputError())
  const seen = new Set<string>()
  const answers: Record<string, DecisionModel.ProviderAnswer> = Object.create(null)
  for (const answer of response.answers) {
    if (!Object.hasOwn(ids, answer.name) || seen.has(answer.name)) return yield* Effect.fail(outputError())
    seen.add(answer.name)
    const id = ids[answer.name]
    if (id === undefined) return yield* Effect.fail(outputError())
    answers[id] = { _tag: "Probability", probability: answer.probability }
  }
  return answers
})

/** One OpenAI Decisions request. Refusal of any question fails the complete review unit. */
export const liveLayer = (options: {
  readonly identity: ProviderIdentity
  readonly credentialEnvVar: string
  readonly httpClient?: HttpClient.HttpClient
}) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted(options.credentialEnvVar)
      const transport = yield* HttpClient.HttpClient
      const client = HttpClient.filterStatusOk(transport)
      return yield* DecisionModel.make({
        decide: Effect.fn("OpenAIDecisionModel.decide")(function* ({ state, decisions }) {
          if (
            options.identity.provider !== OPENAI_PROVIDER.id ||
            !Schema.is(OPENAI_PROVIDER.model)(options.identity.model) ||
            options.identity.destination !== OPENAI_DESTINATION
          ) {
            return yield* Effect.fail(inputError("invalid OpenAI model selection"))
          }
          const rules = yield* probabilityRules(decisions)
          const request = probabilityRequest(options.identity.model, state, rules)
          const violation = requestLimitViolation(options.identity.model, request)
          if (violation !== undefined || request === undefined) {
            return yield* Effect.fail(inputError(`request limit: ${violation ?? "invalid-input"}`))
          }
          const response = yield* client
            .execute(
              HttpClientRequest.post(options.identity.destination).pipe(
                HttpClientRequest.bearerToken(Redacted.value(apiKey)),
                HttpClientRequest.acceptJson,
                HttpClientRequest.bodyText(request.body, "application/json")
              )
            )
            .pipe(
              Effect.flatMap(HttpClientResponse.schemaBodyJson(ResponseBody)),
              // Deliberately omit raw HTTP/schema errors, which can contain credentials or source.
              Effect.mapError(outputError)
            )
          const answers = yield* decodeAnswers(response, request.ids, options.identity.model)
          return {
            answers,
            usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
          }
        })
      })
    })
  ).pipe(
    Layer.provide(
      options.httpClient === undefined
        ? Layer.effect(
            HttpClient.HttpClient,
            Effect.map(HttpClient.HttpClient, (client) => reviewHttpTransport(client, OPENAI_PROVIDER.requestContent))
          ).pipe(Layer.provide(FetchHttpClient.layer))
        : Layer.succeed(HttpClient.HttpClient, reviewHttpTransport(options.httpClient, OPENAI_PROVIDER.requestContent))
    )
  )
