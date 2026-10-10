import { readCredentialCommand } from "../credentials/read-command.ts"
import { explainCommand } from "../explanation/command.ts"
import type { InvocationSession } from "../invocation/session.ts"
import * as Effect from "effect/Effect"
import { discoverWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import {
  type ReviewOperation,
  assertNever,
  decodeOperation,
  forcedOperation,
  forcedStatusFormat
} from "./read-request.ts"
import { runStatusOperation } from "../status/command.ts"

export const runOperation = Effect.fn("Cli.runOperation")(function* (
  operation: ReviewOperation,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined
): Effect.fn.Return<unknown, Error> {
  switch (operation.operation) {
    case "status":
      return yield* runStatusOperation(
        operation,
        yield* discoverWorkingTreeRoot(operation.cwd),
        activityPath,
        userConfigPath
      )
    case "credentials":
      return yield* readCredentialCommand(operation, userConfigPath)
    case "explain":
      return yield* explainCommand(operation, userConfigPath)
    default:
      return assertNever(operation)
  }
})

export const runAdministrativeOperation = Effect.fn("Cli.runAdministrativeOperation")(function* (
  session: InvocationSession,
  input: string,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined
) {
  const decodedOperation = yield* decodeOperation(input, forcedOperation(session))
  const operation =
    forcedStatusFormat(session) !== undefined && decodedOperation.operation === "status"
      ? { ...decodedOperation, format: "human" as const }
      : decodedOperation
  return yield* runOperation(operation, statePath, activityPath, userConfigPath)
})
