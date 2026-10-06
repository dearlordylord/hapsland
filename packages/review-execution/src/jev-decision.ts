import { inspectHttpTransport } from "@hapsland/inspection-records/inspection/transport"
import { assertReviewEngineBoundary } from "@hapsland/runtime-environment/runtime/review-engine-boundary"
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { Decision, DecisionModel } from "effect/ai"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import { JEV_API_BASE, JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"

assertReviewEngineBoundary("jev-decision")

export const MODEL = "jev-latest"

type ProbabilityDecisions = Readonly<Record<string, Decision.Probability>>

/** Validate an unknown script fixture as JSON, then issue all decisions in one request. */
export const decide = <const Decisions extends ProbabilityDecisions>(options: {
  readonly state: unknown
  readonly decisions: Decisions
}) =>
  Effect.gen(function* () {
    const input = yield* Schema.decodeUnknownEffect(Schema.Json)(options.state)
    const definition = Decision.make({ input: Schema.Json, decisions: options.decisions })
    return yield* DecisionModel.decide(definition, { input })
  })

/**
 * Builds the Jev-backed DecisionModel for one explicit destination and credential
 * environment variable. The destination is part of consent identity; it is not
 * silently replaced by a provider default after dispatch authorization.
 */
export const liveLayer = (options: {
  readonly apiUrl: string
  readonly credentialEnvVar: string
  /** Explicit offline transport for resident conformance witnesses. */
  readonly httpClient?: HttpClient.HttpClient
}) => {
  const client = Layer.effect(
    TypeSafeClient.TypeSafeClient,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted(options.credentialEnvVar)
      return yield* TypeSafeClient.make({ apiKey, apiUrl: options.apiUrl })
    })
  ).pipe(
    Layer.provide(
      options.httpClient === undefined
        ? Layer.effect(HttpClient.HttpClient, Effect.map(HttpClient.HttpClient, inspectHttpTransport)).pipe(
            Layer.provide(FetchHttpClient.layer)
          )
        : Layer.succeed(HttpClient.HttpClient, inspectHttpTransport(options.httpClient))
    )
  )
  return TypeSafeDecisionModel.model(MODEL).pipe(Layer.provide(client))
}

/** Reads TYPESAFE_API_KEY and uses the TypeSafe service's default destination. */
export const Live = liveLayer({ apiUrl: JEV_API_BASE, credentialEnvVar: JEV_PROVIDER.credentialEnvVar })
