import type { InvocationSession } from "../invocation/session.ts"
import { controlledOptions } from "@hapsland/resident-transport/resident/controlled-options"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import { DEFAULT_CREDENTIAL_ENV_VAR } from "@hapsland/review-definition/runtime/review-config"
import { cliSwitch } from "../invocation/session-options.ts"
import { decodeJson } from "../invocation/json-input.ts"

export type EvaluationOperationName = "plan" | "run" | "report"

export const forcedEvaluationOperation = (session: InvocationSession): EvaluationOperationName | undefined => {
  if (cliSwitch(session, "evaluation-plan")) return "plan"
  if (cliSwitch(session, "evaluation-run")) return "run"
  if (cliSwitch(session, "evaluation-report")) return "report"
  return undefined
}

export const evaluationFlagMatches = (session: InvocationSession, value: unknown): boolean => {
  if (typeof value !== "object" || value === null || !("operation" in value)) return false
  return forcedEvaluationOperation(session) === undefined || value.operation === forcedEvaluationOperation(session)
}

export const runJsonEvaluation = Effect.fn("Cli.runJsonEvaluation")(function* (
  session: InvocationSession,
  input: string
) {
  const { runEvaluationCommand } = yield* Effect.promise(() => import("./command.ts"))
  const evaluationInput = yield* decodeJson(input)
  if (!evaluationFlagMatches(session, evaluationInput)) {
    return {
      version: 1,
      error: {
        code: "invalid_request",
        message: "evaluation operation flag does not match the version-1 evaluation contract"
      }
    }
  }
  return yield* runEvaluationCommand(evaluationInput, {
    allowLive: cliSwitch(session, "evaluation-live"),
    credentialEnvVar: yield* Config.NonEmptyString("EVALUATION_CREDENTIAL_ENV").pipe(
      Config.withDefault(DEFAULT_CREDENTIAL_ENV_VAR)
    ),
    ...(cliSwitch(session, "controlled-reviewer") ? { controlled: yield* controlledOptions } : {})
  })
})
