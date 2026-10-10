import { flowInteraction } from "../interaction/flow-input.ts"
import { Context, Effect, Exit, Layer, Redacted, Terminal } from "effect"
import {
  resolveCredential,
  saveCredential,
  type CredentialResolution,
  type CredentialLifecycleResult
} from "@hapsland/credential-storage/credentials/owner"
import { discoverWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import {
  JEV_DESTINATION,
  JEV_PROVIDER,
  REVIEW_PROVIDERS,
  providerEnvironmentOnly,
  type BackendId
} from "@hapsland/runtime-environment/runtime/backend"
import { captureCredential, MaskedInputError } from "../credentials/masked-input.ts"
import { credentialSourceGuidance } from "./credential-guidance.ts"
import { formatOutcome } from "../interaction/outcome.ts"
import type { SetupClient } from "./client-selection.ts"
import { verifyJevKey } from "./credential-verification.ts"
import {
  initialVerification,
  reduceVerification,
  verificationCommand,
  type KeyVerification,
  type VerificationCommand,
  type VerificationEvent,
  type VerificationModel,
  type VerificationSource
} from "./verification-model.ts"

export interface VerificationOwner {
  read: Effect.Effect<{ provider: BackendId; credential: CredentialResolution; guidance: readonly string[] }, unknown>
  save: (key: string) => Effect.Effect<CredentialLifecycleResult, unknown>
  verify: (key: Redacted.Redacted<string>) => Effect.Effect<KeyVerification>
}
export class VerificationOwnerService extends Context.Service<VerificationOwnerService, VerificationOwner>()(
  "@hapsland/administration/VerificationOwner"
) {}
export type NativeVerificationOptions = {
  cwd: string
  host: SetupClient
  platform: NodeJS.Platform
  userConfigPath?: string
  verify?: VerificationOwner["verify"]
}
export const nativeVerificationLayer = (options: NativeVerificationOptions): Layer.Layer<VerificationOwnerService> =>
  Layer.succeed(VerificationOwnerService, {
    read: Effect.gen(function* () {
      const root = yield* discoverWorkingTreeRoot(options.cwd)
      const settings = yield* loadReviewSettings(
        root,
        options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath }
      )
      const environmentOnly = settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
      const credential = yield* resolveCredential({ envVar: settings.credentialEnvVar, root, environmentOnly })
      return {
        provider: settings.backend,
        credential,
        guidance: credentialSourceGuidance(
          { ...credential, envVar: settings.credentialEnvVar, environmentOnly, provider: settings.backend },
          options.host,
          options.platform
        )
      }
    }),
    save: saveCredential,
    verify: options.verify ?? verifyJevKey
  })

const messages: Readonly<Record<KeyVerification, string>> = {
  accepted: `Key verified: ${JEV_PROVIDER.name} accepted this key and completed the sample request.`,
  rejected: `Key rejected by ${JEV_PROVIDER.name}.`,
  forbidden: `${JEV_PROVIDER.name} denied access. Check this key's permissions in the ${JEV_PROVIDER.credentialIssuer} console.`,
  "rate-limited": `Key verification incomplete: ${JEV_PROVIDER.name} rate limit reached. The selected key has been kept for review; its validity is unconfirmed.`,
  unconfirmed:
    "Key verification incomplete: network, timeout, balance, service or response error. The selected key has been kept for review; its validity is unconfirmed."
}
const sourceOf = (credential: CredentialResolution): VerificationSource =>
  credential.file !== undefined ? "file" : credential.source
export type VerificationTransition = { before: VerificationModel; event: VerificationEvent; after: VerificationModel }
// Frozen setup integration contract: one shared input session, no runtime bridge.
// Cancellation ends setup navigation; prior observations remain in model.
export type VerificationOutcome = { kind: "completed" | "cancelled"; model: VerificationModel }
export const runVerificationConversation = Effect.fn("Verification.run")(function* (
  options: { observe?: (transition: VerificationTransition) => Effect.Effect<void> } = {}
) {
  const owner = yield* VerificationOwnerService
  const interaction = yield* flowInteraction("verification")
  let model = initialVerification()
  let credential: CredentialResolution | undefined
  let entered: string | undefined
  const dispatch = (action: VerificationEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const event = { revision: before.revision, action }
      model = reduceVerification(before, event)
      yield* options.observe?.({ before, event, after: model }) ?? Effect.void
    })
  const load = Effect.fn("Verification.load")(function* (command: Extract<VerificationCommand, { kind: "load" }>) {
    credential = undefined
    const loaded = yield* owner.read.pipe(Effect.result)
    if (loaded._tag === "Failure") {
      yield* dispatch({ kind: "loadFailed", commandId: command.id })
      yield* interaction.present(
        "Key validity: not checked because verification preparation failed. The selected key was not removed.\n"
      )
      return
    }
    const result = loaded.success
    credential = result.credential
    const eligibility = providerEnvironmentOnly(result.provider)
      ? "other provider"
      : credential.status !== "present"
        ? "unavailable"
        : "ready"
    yield* dispatch({ kind: "loaded", commandId: command.id, source: sourceOf(credential), eligibility })
    for (const line of result.guidance) yield* interaction.present(`${formatOutcome("info", line)}\n`)
    if (eligibility === "other provider")
      yield* interaction.present(
        `${formatOutcome("info", `${REVIEW_PROVIDERS[result.provider].name} key validity was not checked; the ${JEV_PROVIDER.name} check does not apply to this backend.`)}\n`
      )
    if (eligibility === "unavailable")
      yield* interaction.present(
        `${formatOutcome("warning", "Key validity: not checked because the selected key is unavailable.")}\n`
      )
  })
  const check = Effect.fn("Verification.check")(function* (command: Extract<VerificationCommand, { kind: "check" }>) {
    if (credential?.status !== "present")
      return yield* Effect.die(new Error("Verification requires a private selected credential"))
    const selected = credential
    const result = yield* Effect.acquireUseRelease(
      Effect.sync(() => Redacted.make(selected.value)),
      (key) => owner.verify(key),
      (key) =>
        Effect.sync(() => {
          Redacted.wipeUnsafe(key)
        })
    )
    yield* dispatch({ kind: "observed", commandId: command.id, keyRevision: command.keyRevision, result })
    yield* interaction.present(`${formatOutcome(result === "accepted" ? "success" : "warning", messages[result])}\n`)
    if (model.source === "environment" && ["rejected", "forbidden"].includes(result))
      yield* interaction.present(
        "Update the environment used to launch Hapsland, then start a new check. Saved login does not override this source.\n"
      )
  })
  const input = Effect.fn("Verification.input")(function* (command: Extract<VerificationCommand, { kind: "input" }>) {
    const captured = yield* captureCredential.pipe(
      Effect.map((value) => {
        entered = value
        return true
      }),
      Effect.catchIf(
        (error) =>
          error instanceof Terminal.QuitError || (error instanceof MaskedInputError && error.reason === "cancelled"),
        () => Effect.succeed(false)
      )
    )
    yield* dispatch({ kind: captured ? "entered" : "inputEnded", commandId: command.id })
    if (!captured) yield* interaction.present("Key entry cancelled. The previous key was kept.\n")
  })
  const save = Effect.fn("Verification.save")(function* (command: Extract<VerificationCommand, { kind: "save" }>) {
    if (entered === undefined) return yield* Effect.die(new Error("Replacement requires private credential input"))
    const result = yield* owner.save(entered)
    entered = undefined
    yield* dispatch({
      kind: "stored",
      commandId: command.id,
      storage: { status: result.status, generation: result.state.generation }
    })
    yield* interaction.present(
      result.status === "stored"
        ? "Replacement saved. Credential precedence will be checked again before any paid request.\n"
        : `Key replacement was not confirmed: credential storage returned ${result.status}. No verification request was sent for this replacement.\n`
    )
  })
  const approve = Effect.fn("Verification.approval")(function* () {
    const answer = yield* interaction.confirm({
      message: `Verify this key with one request to ${JEV_DESTINATION}? Only a built-in greeting is sent, no project code. This may use paid credits.`,
      preview:
        "Each request requires fresh consent. A successful key check does not establish agent trust or an observed code review.",
      back: model.attempts > 0
    })
    yield* dispatch(
      answer.kind === "confirmed"
        ? { kind: "approve", keyRevision: model.keyRevision, yes: answer.yes }
        : { kind: answer.kind }
    )
    if (answer.kind === "confirmed" && !answer.yes)
      yield* interaction.present(`${formatOutcome("warning", "Key validity: not checked for this request.")}\n`)
  })
  const recover = Effect.fn("Verification.recovery")(function* () {
    const choices =
      model.source === "saved"
        ? [
            { title: "Enter and save a replacement key", value: "replace" as const },
            { title: "Recheck the selected key", value: "recheck" as const }
          ]
        : [{ title: "I corrected the credential file; read it again", value: "recheck" as const }]
    const answer = yield* interaction.choose({ message: "Credential check needs attention", choices, back: false })
    yield* dispatch(answer.kind === "selected" ? { kind: answer.value } : { kind: answer.kind })
  })
  const approveReplacement = Effect.fn("Verification.approveReplacement")(function* () {
    const answer = yield* interaction.confirm({
      message: "Enter and save a replacement key?",
      preview:
        "This replaces saved login only. Environment and file keys keep their precedence. No paid request is authorized by this choice.",
      back: true
    })
    yield* dispatch(
      answer.kind === "confirmed"
        ? { kind: "approveReplacement", keyRevision: model.keyRevision, yes: answer.yes }
        : { kind: answer.kind }
    )
  })
  const commands = { load, check, input, save }
  const runCommand = (command: VerificationCommand) => {
    switch (command.kind) {
      case "load":
        return commands.load(command)
      case "check":
        return commands.check(command)
      case "input":
        return commands.input(command)
      case "save":
        return commands.save(command)
    }
  }
  const prompt = () =>
    (model.phase === "Approval" ? approve() : model.phase === "Recovery" ? recover() : approveReplacement()).pipe(
      Effect.catchTag("QuitError", () => dispatch({ kind: "exit" }))
    )
  return yield* Effect.gen(function* () {
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      const command = verificationCommand(model)
      if (command) yield* runCommand(command)
      else yield* prompt()
    }
    return { kind: model.phase === "Cancelled" ? "cancelled" : "completed", model } satisfies VerificationOutcome
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit)
        ? interaction.present(
            `Credential check stopped after ${model.attempts} authorized request(s). Previously observed results and credential writes are retained; no rollback is implied.\n`
          )
        : Effect.void
    ),
    Effect.ensuring(
      Effect.sync(() => {
        credential = undefined
        entered = undefined
      })
    )
  )
})

// Concrete owners are supplied here; the enclosing setup session supplies input.
export const runGuidedCredentialCheck = (options: NativeVerificationOptions) =>
  runVerificationConversation().pipe(Effect.provide(nativeVerificationLayer(options)))
