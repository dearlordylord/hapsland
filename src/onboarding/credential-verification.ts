import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import type * as AiError from "effect/ai/AiError"
import { Decision } from "effect/ai"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe"
import { decide, MODEL } from "../jev-decision.ts"
import { JEV_API_BASE, JEV_DESTINATION, JEV_PROVIDER, CLOUDFLARE_PROVIDER } from "../runtime/backend.ts"
import { resolveCredential, saveCredential, type CredentialResolution } from "../credentials/secret-service.ts"
import { formatOutcome } from "./human-output.ts"
import { discoverWorkingTreeRoot } from "../repository/root.ts"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { credentialSourceGuidance } from "./credential-guidance.ts"
import type { SetupClient } from "./client-selection.ts"

export const KEY_CHECK_TIMEOUT_SECONDS = 15
export const MAX_KEY_CHECKS = 3

export type KeyVerification = "accepted" | "rejected" | "forbidden" | "rate-limited" | "unconfirmed"

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

const messages: Readonly<Record<KeyVerification, string>> = {
  accepted: `Key verified: ${JEV_PROVIDER.name} accepted this key and completed the sample request.`,
  rejected: `Key rejected by ${JEV_PROVIDER.name}.`,
  forbidden: `${JEV_PROVIDER.name} denied access. Check this key's permissions in the ${JEV_PROVIDER.credentialIssuer} console.`,
  "rate-limited": `Key verification incomplete: ${JEV_PROVIDER.name} rate limit reached. The selected key has been kept for review; its validity is unconfirmed.`,
  unconfirmed:
    "Key verification incomplete: network, timeout, balance, service or response error. The selected key has been kept for review; its validity is unconfirmed."
}

type KeyVerificationOptions = {
  readonly provider: "jev" | "cloudflare"
  readonly credential: CredentialResolution
  readonly confirm: (question: string) => Effect.Effect<boolean, unknown>
  readonly write: (text: string) => void
  readonly verify?: (key: Redacted.Redacted<string>) => Effect.Effect<KeyVerification>
  readonly replaceCredential?: (
    credential: CredentialResolution
  ) => Effect.Effect<CredentialResolution | undefined, unknown>
}
type PresentCredential = Extract<CredentialResolution, { readonly status: "present" }>
const selectedKeyForVerification = Effect.fn("Onboarding.selectedKeyForVerification")(function* (
  options: KeyVerificationOptions
) {
  if (options.provider !== "jev") {
    options.write(
      `${formatOutcome("info", `${CLOUDFLARE_PROVIDER.name} key validity was not checked; the ${JEV_PROVIDER.name} check does not apply to this backend.`)}\n`
    )
    return undefined
  }
  if (options.credential.status !== "present") {
    options.write(`${formatOutcome("warning", "Key validity: not checked because the selected key is unavailable.")}\n`)
    return undefined
  }
  if (
    !(yield* options.confirm(
      `Verify this key with one request to ${JEV_DESTINATION}? Only a built-in greeting is sent, no project code. This may use paid credits. No automatic retries; ${KEY_CHECK_TIMEOUT_SECONDS}-second timeout.`
    ))
  ) {
    options.write(`${formatOutcome("warning", "Key validity: not checked.")}\n`)
    return undefined
  }
  return options.credential
})
const canPersistReplacement = (credential: PresentCredential): boolean =>
  credential.source !== "environment" || credential.file !== undefined
const replacementQuestion = (credential: PresentCredential, attempt: number): string => {
  const correction =
    credential.file === undefined
      ? "Enter and save a replacement key now"
      : `Update the key in ${credential.file}, then check it again now`
  return `${correction}? This sends one more sample request and may use paid credits. [${attempt + 2}/${MAX_KEY_CHECKS}]`
}
const offerReplacementKey = Effect.fn("Onboarding.offerReplacementKey")(function* (
  options: KeyVerificationOptions,
  credential: PresentCredential,
  attempt: number
) {
  const replace = options.replaceCredential
  if (attempt + 1 === MAX_KEY_CHECKS || replace === undefined) return undefined
  if (!canPersistReplacement(credential)) return undefined
  if (!(yield* options.confirm(replacementQuestion(credential, attempt)))) return undefined
  const replacement = yield* replace(credential)
  return replacement?.status === "present" ? replacement : undefined
})
const verificationFailures = new Set<KeyVerification>(["rejected", "forbidden"])
export const offerJevKeyVerification = Effect.fn("Onboarding.offerJevKeyVerification")(function* (
  options: KeyVerificationOptions
) {
  const selected = yield* selectedKeyForVerification(options)
  if (selected === undefined) return
  let credential: PresentCredential = selected
  for (let attempt = 0; attempt < MAX_KEY_CHECKS; attempt++) {
    const result = yield* (options.verify ?? verifyJevKey)(Redacted.make(credential.value))
    options.write(`${formatOutcome(result === "accepted" ? "success" : "warning", messages[result])}\n`)
    if (!verificationFailures.has(result)) return
    const replacement: PresentCredential | undefined = yield* offerReplacementKey(options, credential, attempt)
    if (replacement === undefined) return
    credential = replacement
  }
})

/** Capture the selected source once per user-approved check; replacement preserves normal lookup precedence. */
export const runGuidedCredentialCheck = Effect.fn("Onboarding.guidedCredentialCheck")(function* (options: {
  readonly cwd: string
  readonly host: SetupClient
  readonly platform: NodeJS.Platform
  readonly userConfigPath?: string
  readonly confirm: (question: string) => Effect.Effect<boolean, unknown>
  readonly readCredential: () => Effect.Effect<string, unknown>
  readonly write: (text: string) => void
  readonly verify?: (key: Redacted.Redacted<string>) => Effect.Effect<KeyVerification>
}) {
  const root = yield* discoverWorkingTreeRoot(options.cwd)
  const settings = yield* loadReviewSettings(
    root,
    options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath }
  )
  const environmentOnly = settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  const read = () => resolveCredential({ envVar: settings.credentialEnvVar, root, environmentOnly })
  const show = (credential: CredentialResolution) => {
    for (const line of credentialSourceGuidance(
      { ...credential, envVar: settings.credentialEnvVar, environmentOnly, provider: settings.backend },
      options.host,
      options.platform
    ))
      options.write(`${formatOutcome("info", line)}\n`)
  }
  const credential = yield* read()
  show(credential)
  yield* offerJevKeyVerification({
    provider: settings.backend,
    credential,
    confirm: options.confirm,
    write: options.write,
    ...(options.verify === undefined ? {} : { verify: options.verify }),
    replaceCredential: (selected) =>
      Effect.gen(function* () {
        if (selected.source === "saved") {
          const entered = yield* options.readCredential().pipe(Effect.result)
          if (entered._tag === "Failure") {
            options.write(`${formatOutcome("warning", "Key entry cancelled. The previous key was kept.")}\n`)
            return undefined
          }
          const saved = yield* saveCredential(entered.success)
          if (saved.status !== "stored") {
            options.write(
              `${formatOutcome("warning", `Key replacement was not confirmed: credential storage returned ${saved.status}.`)}\n`
            )
            return undefined
          }
          options.write(
            `${JEV_PROVIDER.name} key saved in ${options.platform === "darwin" ? "Keychain" : "Secret Service"}.\n`
          )
        }
        const replacement = yield* read()
        show(replacement)
        return replacement
      })
  })
})
