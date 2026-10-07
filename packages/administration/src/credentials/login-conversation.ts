import { Context, Effect, Layer, Terminal } from "effect"
import {
  runSecretService,
  saveCredential,
  type CredentialLifecycleResult,
  type SecretServiceStatus
} from "@hapsland/credential-storage/credentials/secret-service"
import { MaskedInputError } from "./masked-input.ts"
import { initialLogin, loginCommand, reduceLogin, type LoginEvent, type LoginModel } from "./login-model.ts"

export interface LoginOwner {
  probe: Effect.Effect<SecretServiceStatus, unknown>
  save: (value: string) => Effect.Effect<CredentialLifecycleResult, unknown>
}
export class LoginOwnerService extends Context.Service<LoginOwnerService, LoginOwner>()(
  "@hapsland/administration/LoginOwner"
) {}
export const nativeLoginLayer = Layer.succeed(LoginOwnerService, {
  probe: runSecretService("probe", { deadlineMs: 2_000, allowInteraction: true }).pipe(
    Effect.map((result) => result.status)
  ),
  save: saveCredential
})
export type LoginTransition = { before: LoginModel; event: LoginEvent; after: LoginModel }
export type LoginOutcome =
  | { kind: "unavailable"; status: SecretServiceStatus }
  | { kind: "cancelled" }
  | { kind: "observed"; result: CredentialLifecycleResult }

// Input and mutation results remain interpreter-private. Only safe observations
// enter the reducer and replay; native locks and recovery remain owner authority.
export const runLoginConversation = Effect.fn("Login.run")(function* <R>(options: {
  input: Effect.Effect<string, unknown, R>
  inputKind: LoginModel["inputKind"]
  observe?: (transition: LoginTransition) => Effect.Effect<void>
}) {
  const owner = yield* LoginOwnerService
  let model = initialLogin(options.inputKind)
  const dispatch = (action: LoginEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const event = { revision: before.revision, action }
      model = reduceLogin(before, event)
      if (options.observe) yield* options.observe({ before, event, after: model })
    })
  let value: string | undefined
  let outcome: LoginOutcome | undefined
  return yield* Effect.gen(function* () {
    for (let command = loginCommand(model); command; command = loginCommand(model)) {
      if (command.kind === "probe") {
        const status = yield* owner.probe
        if (status !== "available") outcome = { kind: "unavailable", status }
        yield* dispatch({ kind: "checked", commandId: command.id, status })
      } else if (command.kind === "input") {
        const entered = yield* options.input.pipe(
          Effect.map((input) => {
            value = input
            return true
          }),
          Effect.catchIf(
            (error) =>
              error instanceof Terminal.QuitError ||
              (error instanceof MaskedInputError && error.reason === "cancelled"),
            () => Effect.succeed(false)
          )
        )
        if (!entered) outcome = { kind: "cancelled" }
        yield* dispatch({ kind: entered ? "entered" : "input-ended", commandId: command.id })
      } else {
        if (value === undefined) return yield* Effect.die(new Error("Login save requires private credential input"))
        const result = yield* owner.save(value)
        value = undefined
        outcome = { kind: "observed", result }
        yield* dispatch({
          kind: "observed",
          commandId: command.id,
          storage: {
            status: result.status,
            generation: result.state.generation,
            stateLock: result.stateLock,
            savedUse: result.state.savedUseSuspended ? "suspended" : "active"
          }
        })
      }
    }
    if (outcome === undefined) return yield* Effect.die(new Error("Login ended without an owner or input outcome"))
    return { model, outcome }
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        value = undefined
      })
    )
  )
})
