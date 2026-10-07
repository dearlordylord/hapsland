import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Redacted from "effect/Redacted"
import { type KeyVerification } from "./verification-model.ts"
import type * as AiError from "effect/ai/AiError"
import { Decision } from "effect/ai"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe"
import { decide, MODEL } from "@hapsland/review-execution/jev-decision"
import { JEV_API_BASE } from "@hapsland/runtime-environment/runtime/backend"
export { MAX_KEY_CHECKS, type KeyVerification } from "./verification-model.ts"

export const KEY_CHECK_TIMEOUT_SECONDS = 15
const failureResult = (error: AiError.AiError): KeyVerification => {
  if (error.reason._tag === "AuthenticationError")
    return error.reason.kind === "InsufficientPermissions" ? "forbidden" : "rejected"
  return error.reason._tag === "RateLimitError" ? "rate-limited" : "unconfirmed"
}

/** One synthetic decision, no retries or project input; only sanitized outcomes leave this boundary. */
export const verifyJevKey = Effect.fn("Onboarding.verifyJevKey")((
  key: Redacted.Redacted<string>,
  httpClient?: HttpClient.HttpClient
) => {
  const client = TypeSafeClient.layer({ apiKey: key, apiUrl: JEV_API_BASE }).pipe(
    Layer.provide(httpClient === undefined ? FetchHttpClient.layer : Layer.succeed(HttpClient.HttpClient, httpClient))
  )
  const model = TypeSafeDecisionModel.model(MODEL).pipe(Layer.provide(client))
  return decide({
    state: "Hapsland connection check: hello.",
    decisions: { greeting: Decision.probability({ instructions: "Does the message contain a greeting?" }) }
  }).pipe(
    Effect.provide(model),
    Effect.as<KeyVerification>("accepted"),
    Effect.catch((error) =>
      Effect.succeed(error._tag === "AiError" ? failureResult(error) : ("unconfirmed" as KeyVerification))
    ),
    Effect.timeoutOrElse({
      duration: `${KEY_CHECK_TIMEOUT_SECONDS} seconds`,
      orElse: () => Effect.succeed<KeyVerification>("unconfirmed")
    })
  )
})
