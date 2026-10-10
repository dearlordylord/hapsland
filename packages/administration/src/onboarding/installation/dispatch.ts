import type { InvocationSession } from "../../invocation/session.ts"
import * as Effect from "effect/Effect"
import { packageCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import { type InstallationOperation, decodeInstallationOperation, forcedInstallationOperation } from "./request.ts"
import { dispatchPiInstallation } from "./pi.ts"
import { dispatchClaudeInstallation } from "./claude.ts"
import { dispatchOpencodeInstallation } from "./opencode.ts"
import { dispatchCodexInstallation } from "./codex.ts"
import { type ProgramInput } from "../../invocation/json-input.ts"

export const dispatchInstallation = Effect.fn("Cli.dispatchInstallation")(function* (
  operation: InstallationOperation,
  userConfigPath: string | undefined
) {
  if (operation.host === "resident") {
    const { previewResidentUpdate, applyResidentUpdate } = yield* Effect.promise(() => import("../resident-update.ts"))
    const executable = packageCommand("cli").executable
    const result =
      operation.operation === "update-preview"
        ? yield* previewResidentUpdate(executable)
        : yield* applyResidentUpdate(executable, operation.proposalDigest)
    return { version: 1, operation: operation.operation, ...result }
  }
  if (operation.host === "pi") return yield* dispatchPiInstallation(operation, userConfigPath)
  if (operation.host === "claude") return yield* dispatchClaudeInstallation(operation)
  if (operation.host === "opencode") return yield* dispatchOpencodeInstallation(operation)
  return yield* dispatchCodexInstallation(operation, userConfigPath)
})

export const runJsonInstallation = Effect.fn("Cli.runJsonInstallation")(function* (
  session: InvocationSession,
  context: ProgramInput
) {
  const operation = yield* decodeInstallationOperation(context.input, forcedInstallationOperation(session))
  return yield* dispatchInstallation(operation, context.userConfigPath)
})
