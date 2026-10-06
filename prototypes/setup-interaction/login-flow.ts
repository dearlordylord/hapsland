// Prototype: native login conversation; never serialize captured input.
import { Effect } from "effect"
import type { Interaction } from "./interaction.ts"
import { captureAndSave, type CredentialOwner, type CredentialSnapshot, type SaveOutcome } from "./credential-owner.ts"
import { replayStep, unobserved, type Observe } from "./workflow-replay.ts"
export type LoginModel = {
  phase: "Resolving" | "Capturing" | "Saving" | "Done" | "Cancelled"
  revision: number
  credential?: CredentialSnapshot
  outcome?: SaveOutcome | "unavailable"
}
export type LoginAction =
  | { kind: "resolved"; commandId: number; credential: CredentialSnapshot; writable: boolean }
  | { kind: "captured"; commandId: number }
  | { kind: "saved"; commandId: number; credential: CredentialSnapshot; outcome: SaveOutcome }
  | { kind: "exit" | "back" }
export const initialLogin = (): LoginModel => ({ phase: "Resolving", revision: 0 })
export function reduceLogin(model: LoginModel, event: { revision: number; action: LoginAction }): LoginModel {
  const action = event.action
  if (
    event.revision !== model.revision ||
    model.phase === "Done" ||
    model.phase === "Cancelled" ||
    ("commandId" in action && action.commandId !== model.revision)
  )
    return model
  const move = (phase: LoginModel["phase"], patch: Partial<LoginModel> = {}): LoginModel => ({
    ...model,
    ...patch,
    phase,
    revision: model.revision + 1
  })
  if (action.kind === "exit") return model.phase === "Saving" ? model : move("Cancelled")
  if (model.phase === "Resolving" && action.kind === "resolved")
    return move(action.writable ? "Capturing" : "Done", {
      credential: action.credential,
      ...(action.writable ? {} : { outcome: "unavailable" })
    })
  if (model.phase === "Capturing" && action.kind === "captured") return move("Saving")
  if (model.phase === "Saving" && action.kind === "saved")
    return move("Done", { credential: action.credential, outcome: action.outcome })
  return model
}
export function runLogin(interaction: Interaction, owner: CredentialOwner, observe: Observe = unobserved) {
  return Effect.gen(function* () {
    let model = initialLogin()
    const dispatch = (action: LoginAction) =>
      Effect.gen(function* () {
        const before = model
        model = reduceLogin(before, { revision: before.revision, action })
        yield* observe(
          replayStep(before, model, action, action.kind === "saved" ? `save ${action.outcome}` : action.kind)
        )
      })
    const credential = yield* owner.resolve()
    yield* dispatch({
      kind: "resolved",
      commandId: model.revision,
      credential,
      writable: yield* owner.nativeWritable()
    })
    if (model.phase === "Capturing") {
      yield* interaction.present(
        "Login (simulated): key will be saved to the native credential store. Enter action FAKE key only. Escape/Ctrl+C/Ctrl+D exits and preserves the previous key before saving.\n"
      )
      yield* Effect.gen(function* () {
        const captureId = model.revision
        const saved = yield* captureAndSave(
          owner,
          () => interaction.hidden("Enter fake login key"),
          dispatch({ kind: "captured", commandId: captureId })
        )
        yield* dispatch({ kind: "saved", commandId: model.revision, ...saved })
      }).pipe(Effect.catchTag("QuitError", () => dispatch({ kind: "exit" })))
    }
    yield* interaction.present(
      `Login outcome (simulated): ${model.outcome ?? model.phase}. Effective source: ${model.credential?.source ?? "none"}.\n${model.outcome === "partial" ? "Storage outcome is partial; inspect recovery before retrying." : model.outcome === "failed" ? "Save failed; previous credential was kept." : model.phase === "Cancelled" ? "Input cancelled; previous credential was kept." : model.outcome === "unavailable" ? "Native storage is unavailable; no key was requested." : "Saved credential does not imply verified authorization; higher-priority sources still win."}\n`
    )
    return model
  })
}
