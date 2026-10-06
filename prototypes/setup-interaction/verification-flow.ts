// Prototype: bounded paid-check consent and source-specific correction; no HTTP.
import { Effect, Terminal } from "effect"
import type { Interaction } from "./interaction.ts"
import {
  captureAndSave,
  type CredentialOwner,
  type CredentialSnapshot,
  type SaveOutcome,
  type VerificationOutcome
} from "./credential-owner.ts"
import { replayStep, unobserved, type Observe } from "./workflow-replay.ts"
export const MAX_CHECKS = 3
export const CHECK_TIMEOUT = "15 seconds"
export type VerificationModel = {
  phase:
    | "Resolving"
    | "Consent"
    | "Checking"
    | "Recovery"
    | "ReplacementConsent"
    | "Capturing"
    | "Saving"
    | "Refreshing"
    | "Done"
    | "Cancelled"
  revision: number
  credential?: CredentialSnapshot
  attempts: number
  intent: "check" | "replace" | "recheck"
  outcome?: VerificationOutcome | "unavailable" | "declined"
  saveOutcome?: SaveOutcome
}
export type VerificationAction =
  | { kind: "resolved" | "refreshed"; commandId: number; credential: CredentialSnapshot }
  | { kind: "consent"; yes: boolean; generation: number }
  | { kind: "checked"; commandId: number; outcome: VerificationOutcome }
  | { kind: "correct"; intent: "replace" | "recheck" }
  | { kind: "captured"; commandId: number }
  | { kind: "saved"; commandId: number; credential: CredentialSnapshot; outcome: SaveOutcome }
  | { kind: "back" | "exit" | "stop" }
export const initialVerification = (): VerificationModel => ({
  phase: "Resolving",
  revision: 0,
  attempts: 0,
  intent: "check"
})
export function reduceVerification(
  model: VerificationModel,
  event: { revision: number; action: VerificationAction }
): VerificationModel {
  const action = event.action
  if (
    event.revision !== model.revision ||
    model.phase === "Done" ||
    model.phase === "Cancelled" ||
    ("commandId" in action && action.commandId !== model.revision)
  )
    return model
  const move = (phase: VerificationModel["phase"], patch: Partial<VerificationModel> = {}): VerificationModel => ({
    ...model,
    ...patch,
    phase,
    revision: model.revision + 1
  })
  if (action.kind === "exit")
    return ["Saving", "Checking", "Refreshing"].includes(model.phase) ? model : move("Cancelled")
  if (action.kind === "back") {
    if (model.phase === "ReplacementConsent") return move("Recovery")
    if (model.phase === "Recovery") return move("Consent", { intent: "check" })
    if (model.phase === "Consent" && model.attempts) return move("Recovery")
    return model
  }
  if (model.phase === "Resolving" && action.kind === "resolved")
    return move(action.credential.available ? "Consent" : "Done", {
      credential: action.credential,
      ...(action.credential.available ? {} : { outcome: "unavailable" })
    })
  if (
    ["Consent", "ReplacementConsent"].includes(model.phase) &&
    action.kind === "consent" &&
    action.generation === model.credential?.generation &&
    model.attempts < MAX_CHECKS
  ) {
    if (!action.yes) return move("Done", { outcome: model.outcome ?? "declined" })
    return move(model.intent === "replace" ? "Capturing" : model.intent === "recheck" ? "Refreshing" : "Checking")
  }
  if (model.phase === "Checking" && action.kind === "checked") {
    if (action.outcome === "stale") return move("Resolving", { outcome: "stale", intent: "check" })
    const attempts = model.attempts + 1
    const correctable =
      model.credential?.source === "file" || (model.credential?.source === "saved" && model.credential.writable)
    return move(
      attempts < MAX_CHECKS && correctable && (action.outcome === "rejected" || action.outcome === "forbidden")
        ? "Recovery"
        : "Done",
      { attempts, outcome: action.outcome }
    )
  }
  if (model.phase === "Recovery") {
    if (action.kind === "stop") return move("Done")
    if (
      action.kind === "correct" &&
      model.attempts < MAX_CHECKS &&
      ((action.intent === "replace" && model.credential?.source === "saved" && model.credential.writable) ||
        (action.intent === "recheck" && model.credential?.source === "file"))
    )
      return move("ReplacementConsent", { intent: action.intent })
  }
  if (model.phase === "Capturing" && action.kind === "captured") return move("Saving")
  if (model.phase === "Saving" && action.kind === "saved")
    return move(action.outcome === "stored" && action.credential.available ? "Checking" : "Done", {
      credential: action.credential,
      saveOutcome: action.outcome
    })
  if (model.phase === "Refreshing" && action.kind === "refreshed")
    return move(action.credential.available ? "Checking" : "Done", {
      credential: action.credential,
      ...(action.credential.available ? {} : { outcome: "unavailable" })
    })
  return model
}
export function runVerification(interaction: Interaction, owner: CredentialOwner, observe: Observe = unobserved) {
  return Effect.gen(function* () {
    let model = initialVerification()
    const dispatch = (action: VerificationAction) =>
      Effect.gen(function* () {
        const before = model
        model = reduceVerification(before, { revision: before.revision, action })
        const label =
          action.kind === "consent"
            ? action.yes
              ? `consent ${before.intent}`
              : "decline check"
            : action.kind === "checked"
              ? `check ${action.outcome}`
              : action.kind === "saved"
                ? `save ${action.outcome}`
                : action.kind === "correct"
                  ? action.intent
                  : action.kind
        yield* observe(replayStep(before, model, action, label))
      })
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      yield* interaction.present(`Verification: ${model.phase} (simulated); requests ${model.attempts}/${MAX_CHECKS}\n`)
      const id = model.revision
      const step = Effect.gen(function* (): Effect.fn.Return<void, Terminal.QuitError> {
        switch (model.phase) {
          case "Resolving":
            yield* dispatch({ kind: "resolved", commandId: id, credential: yield* owner.resolve() })
            break
          case "Consent":
          case "ReplacementConsent": {
            const intent =
              model.intent === "replace"
                ? "Save action replacement to the native store, then check it"
                : model.intent === "recheck"
                  ? "Re-read the externally edited file, then check it"
                  : "Check the selected credential"
            const answer = yield* interaction.confirm({
              message: `${intent}?`,
              preview: `Credential check consent (simulated)\nSource: ${model.credential!.source}; request ${model.attempts + 1}/${MAX_CHECKS}.\nOne built-in greeting only; no project code. May use paid credits in production; ${CHECK_TIMEOUT} timeout; no automatic retries. This prototype makes zero network requests.`,
              back: model.phase === "ReplacementConsent" || model.attempts > 0
            })
            yield* dispatch(
              answer.kind === "confirmed"
                ? { kind: "consent", yes: answer.yes, generation: model.credential!.generation }
                : { kind: answer.kind }
            )
            break
          }
          case "Checking": {
            const outcome = yield* owner
              .verify(model.credential!)
              .pipe(
                Effect.timeoutOrElse({
                  duration: CHECK_TIMEOUT,
                  orElse: () => Effect.succeed<VerificationOutcome>("unconfirmed")
                })
              )
            yield* dispatch({ kind: "checked", commandId: id, outcome })
            break
          }
          case "Recovery": {
            const replacement = model.credential!.source === "saved"
            const answer = yield* interaction.choose({
              message: "Credential correction",
              choices: [
                {
                  title: replacement
                    ? "Replace native saved key and request action new check"
                    : "I edited the credential file; request action new check",
                  value: replacement ? ("replace" as const) : ("recheck" as const)
                },
                { title: "Keep credential and stop", value: "stop" as const }
              ],
              back: true
            })
            yield* dispatch(
              answer.kind !== "selected"
                ? { kind: answer.kind }
                : answer.value === "stop"
                  ? { kind: "stop" }
                  : { kind: "correct", intent: answer.value }
            )
            break
          }
          case "Capturing": {
            const saved = yield* captureAndSave(
              owner,
              () => interaction.hidden("Enter fake replacement key"),
              dispatch({ kind: "captured", commandId: id })
            )
            yield* dispatch({ kind: "saved", commandId: model.revision, ...saved })
            break
          }
          case "Refreshing":
            yield* dispatch({ kind: "refreshed", commandId: id, credential: yield* owner.refresh() })
            break
        }
      })
      yield* step.pipe(Effect.catchTag("QuitError", () => dispatch({ kind: "exit" })))
    }
    yield* interaction.present(
      `Verification outcome (simulated): ${model.outcome ?? model.phase}; ${model.attempts}/${MAX_CHECKS} requests; replacement ${model.saveOutcome ?? "not saved"}.\n${model.credential?.source === "environment" && model.outcome !== "accepted" ? "Change the environment key outside the CLI; no replacement was attempted." : model.saveOutcome === "partial" ? "Storage is partial; inspect recovery before retrying." : "No automatic retry. A saved key is separate from verified authorization."}\n`
    )
    return model
  })
}
