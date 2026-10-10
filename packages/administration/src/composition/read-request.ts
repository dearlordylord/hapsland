import { CredentialsRequest } from "../credentials/request.ts"
import { StatusRequest } from "../status/request.ts"
import { ExplainRequest } from "../explanation/request.ts"
import type { InvocationSession } from "../invocation/session.ts"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { cliSwitch } from "../invocation/session-options.ts"
import { decodeJson } from "../invocation/json-input.ts"

export const ReviewOperation = Schema.Union([CredentialsRequest, StatusRequest, ExplainRequest])

export type ReviewOperation = typeof ReviewOperation.Type

export const forcedOperation = (session: InvocationSession): ReviewOperation["operation"] | undefined => {
  if (cliSwitch(session, "credentials")) {
    return "credentials"
  }
  if (cliSwitch(session, "status")) {
    return "status"
  }
  if (cliSwitch(session, "explain")) {
    return "explain"
  }
  return undefined
}

export const forcedStatusFormat = (session: InvocationSession): "human" | undefined =>
  cliSwitch(session, "human") ? "human" : undefined

export const decodeOperation = (input: string, forced: ReviewOperation["operation"] | undefined) =>
  decodeJson(input).pipe(
    Effect.flatMap((value) => Schema.decodeUnknownEffect(ReviewOperation, { onExcessProperty: "error" })(value)),
    Effect.flatMap((operation) =>
      forced !== undefined && operation.operation !== forced
        ? Effect.fail(new Error("operation flag does not match the request"))
        : Effect.succeed(operation)
    )
  )

export const assertNever = (value: never): never => {
  throw new Error(`unsupported consent operation: ${String(value)}`)
}
