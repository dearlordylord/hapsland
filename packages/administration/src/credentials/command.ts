import type { InvocationSession } from "../invocation/session.ts"
import { cliJourney } from "../interaction/flow-input.ts"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import { readFileSync } from "node:fs"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { DEFAULT_CREDENTIAL_ENV_VAR, loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import type { saveCredential } from "@hapsland/credential-storage/credentials/owner"
import { logoutCredential } from "@hapsland/credential-storage/credentials/owner"
import { cliSwitch } from "../invocation/session-options.ts"

export const savedCredentialAction = (status: Effect.Success<ReturnType<typeof saveCredential>>["status"]) => ({
  ...(status === "indeterminate"
    ? { action: "credential replacement may have committed; retry login or logout before review" }
    : status === "busy"
      ? { action: "another credential change is still running; retry" }
      : {})
})

export const savedCredentialOutput = (result: Effect.Success<ReturnType<typeof saveCredential>>) => {
  return {
    version: 1,
    operation: "login",
    status: result.status,
    stored: result.status === "stored",
    paidVerificationPerformed: false,
    previousCredentialPreserved: result.status !== "stored" && result.status !== "indeterminate",
    replacementOutcome: result.status,
    savedCredentialUse: result.state.savedUseSuspended ? "suspended" : "active",
    stateLock: result.stateLock,
    ...savedCredentialAction(result.status),
    generation: result.state.generation
  }
}

export const loginProbeAction = (status: string): string => {
  return status === "locked"
    ? "unlock the native credential store in the desktop session, then retry"
    : status === "interaction-required"
      ? "approve native credential access from this explicit login command, then retry"
      : "reinstall an archive containing the native helper for this platform if it is missing, or make the native credential store available; then retry"
}

export const interactiveLoginOutput = (
  model: Effect.Success<ReturnType<typeof import("./login-conversation.ts").runCredentialSession>>
) => {
  return {
    version: 1,
    operation: "login",
    status: model.storage?.status ?? "cancelled",
    ...(model.storage === undefined
      ? { preservedPreviousCredential: true }
      : { generation: model.storage.state.generation }),
    ...(model.proposal === undefined ? {} : { destination: model.proposal.plan }),
    ...(model.active === undefined ? {} : { activeCredential: model.active })
  }
}

export const interactiveLoginCredential = Effect.fn("Cli.interactiveLoginCredential")(function* () {
  const { runCredentialSession } = yield* Effect.promise(() => import("./login-conversation.ts"))
  const repository = yield* execFileClosedStdin("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 1_000,
    maxBuffer: 1024 * 1024
  })
  const root = repository.succeeded ? repository.stdout.trim() : undefined
  const settings = root === undefined ? undefined : yield* loadReviewSettings(root)
  const model = yield* runCredentialSession({
    ...(root === undefined ? {} : { root }),
    envVar: settings?.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR,
    referenceExplicit:
      settings !== undefined && settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  })
  return interactiveLoginOutput(model)
})

export const loginCredential = Effect.fn("Cli.loginCredential")(function* (session: InvocationSession) {
  if (!cliSwitch(session, "credential-stdin")) return yield* interactiveLoginCredential()
  const { runDirectCredentialInput, nativeDirectLoginLayer } = yield* Effect.promise(() => import("./direct-input.ts"))
  const { outcome } = yield* runDirectCredentialInput({
    input: Effect.try(() => readFileSync(0, "utf8").replace(/\r?\n$/, "")),
    inputKind: "stdin"
  }).pipe(Effect.provide(nativeDirectLoginLayer))
  if (outcome.kind === "unavailable") {
    return { version: 1, operation: "login", status: outcome.status, action: loginProbeAction(outcome.status) }
  }
  if (outcome.kind === "cancelled") {
    return {
      version: 1,
      operation: "login",
      status: "cancelled",
      preservedPreviousCredential: true,
      action: "retry in a terminal or explicitly use --credential-stdin"
    }
  }
  return savedCredentialOutput(outcome.result)
})

export const credentialEnvironmentName = Effect.fn("Cli.credentialEnvironmentName")(function* () {
  let environmentName: string = DEFAULT_CREDENTIAL_ENV_VAR
  try {
    const repository = yield* execFileClosedStdin("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 1_000,
      maxBuffer: 1024 * 1024
    })
    const root = repository.succeeded ? repository.stdout.trim() : ""
    if (root.length > 0) {
      environmentName = yield* loadReviewSettings(root).pipe(
        Effect.map((settings) => settings.credentialEnvVar),
        Effect.catch(() => Effect.succeed(DEFAULT_CREDENTIAL_ENV_VAR))
      )
    }
  } catch {
    /* The global default remains the only known environment override. */
  }
  return environmentName
})

export const logoutStatus = (status: Effect.Success<ReturnType<typeof logoutCredential>>["status"]) => {
  return status === "busy" || status === "indeterminate"
    ? status
    : status === "deleted" || status === "missing"
      ? "logged-out"
      : "deletion-failed"
}

export const logoutAction = (status: Effect.Success<ReturnType<typeof logoutCredential>>["status"]) => ({
  ...(status === "busy"
    ? { action: "another credential change is still running; retry" }
    : status === "indeterminate"
      ? { action: "saved credential deletion may have committed; retry logout to reconcile suspended saved use" }
      : {})
})

export const logoutSavedCredential = Effect.fn("Cli.logoutSavedCredential")(function* () {
  const result = yield* logoutCredential()
  const environmentName = yield* credentialEnvironmentName()
  const environmentActive = yield* Config.option(Config.Redacted(environmentName)).pipe(
    Effect.map((value) => Option.isSome(value) && Redacted.value(value.value).length > 0),
    Effect.catch(() => Effect.succeed(false))
  )
  return {
    version: 1,
    operation: "logout",
    status: logoutStatus(result.status),
    stateLock: result.stateLock,
    savedCredentialUse: result.state.savedUseSuspended ? "suspended" : "absent",
    generation: result.state.generation,
    grantsPreserved: true,
    sentRequestsRecalled: false,
    ...logoutAction(result.status),
    environmentOverride: {
      envVar: environmentName,
      active: environmentActive,
      warning: environmentActive
        ? `${environmentName} remains active and takes precedence over saved storage`
        : undefined
    }
  }
})

export const runCredentialCommand = Effect.fn("Cli.credentialCommand")(function* (session: InvocationSession) {
  return cliSwitch(session, "login")
    ? yield* cliJourney("login", () => loginCredential(session))
    : yield* logoutSavedCredential()
})
