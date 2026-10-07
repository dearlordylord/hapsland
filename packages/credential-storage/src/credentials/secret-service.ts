import { packageAssetPath } from "@hapsland/runtime-environment/runtime/package-runtime"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import { runSecretServiceProcess, type SecretServiceOperation } from "./secret-service-process.ts"

export const CREDENTIAL_LOOKUP_DEADLINE_MS = 750

export type SecretServiceStatus =
  | "available"
  | "stored"
  | "deleted"
  | "present"
  | "missing"
  | "locked"
  | "interaction-required"
  | "invalid"
  | "unavailable"
  | "indeterminate"
  | "timed-out"
  | "cancelled"

export type SecretServiceResult = { readonly status: SecretServiceStatus; readonly value?: string }

const packagedHelper = packageAssetPath(
  "native",
  "prebuilt",
  `${process.platform}-${process.arch}`,
  "credential-secret-service"
)

const helperPathConfig = Config.NonEmptyString("REVIEW_CREDENTIAL_HELPER").pipe(Config.withDefault(packagedHelper))
export const runSecretService = Effect.fn("Credentials.runHelper")(
  (
    operation: SecretServiceOperation,
    options: {
      readonly input?: string
      readonly deadlineMs?: number
      readonly signal?: AbortSignal
      readonly allowInteraction?: boolean
    } = {}
  ) =>
    Effect.gen(function* () {
      const helper = yield* helperPathConfig
      return yield* runSecretServiceProcess(helper, operation, {
        ...options,
        deadlineMs: options.deadlineMs ?? CREDENTIAL_LOOKUP_DEADLINE_MS
      })
    }).pipe(Effect.catch(() => Effect.succeed<SecretServiceResult>({ status: "unavailable" })))
)
