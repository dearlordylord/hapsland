import * as Effect from "effect/Effect"
import { discoverWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import { resolveCredential } from "@hapsland/credential-storage/credentials/owner"
import type { CredentialsRequest } from "./request.ts"

export const readCredentialCommand = Effect.fn("Cli.readCredentialCommand")(function* (
  operation: CredentialsRequest,
  userConfigPath: string | undefined
): Effect.fn.Return<unknown, Error> {
  const root = yield* discoverWorkingTreeRoot(operation.cwd)
  const settings = yield* loadReviewSettings(root, userConfigPath === undefined ? {} : { userConfigPath })
  const credentialEnvVar = settings.credentialEnvVar
  const resolution = yield* resolveCredential({
    envVar: credentialEnvVar,
    root,
    environmentOnly: settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  })
  return {
    version: 1,
    operation: "credentials",
    credentialEnvVar,
    present: resolution.status === "present",
    source: resolution.source,
    ...(resolution.file === undefined ? {} : { file: resolution.file }),
    status: resolution.status
  }
})
