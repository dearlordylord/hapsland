import { Context, Effect, Layer, Terminal } from "effect"
import {
  runSecretService,
  saveCredential,
  type CredentialLifecycleResult,
  type SecretServiceStatus
} from "@hapsland/credential-storage/credentials/owner"
import { MaskedInputError } from "./masked-input-error.ts"
import { initialLogin, loginCommand, reduceLogin, type LoginEvent, type LoginModel } from "./direct-login-model.ts"

export interface DirectLoginOwner {
  probe: Effect.Effect<SecretServiceStatus, unknown>
  save: (value: string) => Effect.Effect<CredentialLifecycleResult, unknown>
}
export class DirectLoginOwnerService extends Context.Service<DirectLoginOwnerService, DirectLoginOwner>()(
  "@hapsland/administration/DirectLoginOwner"
) {}
export const nativeDirectLoginLayer = Layer.succeed(DirectLoginOwnerService, {
  probe: runSecretService("probe", { deadlineMs: 2_000, allowInteraction: true }).pipe(
    Effect.map((result) => result.status)
  ),
  save: saveCredential
})
export type DirectLoginTransition = { before: LoginModel; event: LoginEvent; after: LoginModel }
export type DirectLoginOutcome =
  | { kind: "unavailable"; status: SecretServiceStatus }
  | { kind: "cancelled" }
  | { kind: "observed"; result: CredentialLifecycleResult }

// Input and mutation results remain interpreter-private. Only safe observations
// enter the reducer and replay; native locks and recovery remain owner authority.
export const runDirectCredentialInput = Effect.fn("Login.run")(function* <R>(options: {
  input: Effect.Effect<string, unknown, R>
  inputKind: LoginModel["inputKind"]
  observe?: (transition: DirectLoginTransition) => Effect.Effect<void>
}) {
  const owner = yield* DirectLoginOwnerService
  let model = initialLogin(options.inputKind)
  const dispatch = (action: LoginEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const event = { revision: before.revision, action }
      model = reduceLogin(before, event)
      if (options.observe) yield* options.observe({ before, event, after: model })
    })
  let value: string | undefined
  let outcome: DirectLoginOutcome | undefined
  const probe = Effect.fn("Login.probe")(function* (id: number) {
    const status = yield* owner.probe
    if (status !== "available") outcome = { kind: "unavailable", status }
    yield* dispatch({ kind: "checked", commandId: id, status })
  })
  const input = Effect.fn("Login.input")(function* (id: number) {
    const entered = yield* options.input.pipe(
      Effect.map((input) => {
        value = input
        return true
      }),
      Effect.catchIf(
        (error) =>
          error instanceof Terminal.QuitError || (error instanceof MaskedInputError && error.reason === "cancelled"),
        () => Effect.succeed(false)
      )
    )
    if (!entered) outcome = { kind: "cancelled" }
    yield* dispatch({ kind: entered ? "entered" : "input-ended", commandId: id })
  })
  const save = Effect.fn("Login.save")(function* (id: number) {
    if (value === undefined) return yield* Effect.die(new Error("Login save requires private credential input"))
    const result = yield* owner.save(value)
    value = undefined
    outcome = { kind: "observed", result }
    yield* dispatch({
      kind: "observed",
      commandId: id,
      storage: {
        status: result.status,
        generation: result.state.generation,
        stateLock: result.stateLock,
        savedUse: result.state.savedUseSuspended ? "suspended" : "active"
      }
    })
  })
  const commands = { probe, input, save }
  return yield* Effect.gen(function* () {
    for (let command = loginCommand(model); command; command = loginCommand(model))
      yield* commands[command.kind](command.id)
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
