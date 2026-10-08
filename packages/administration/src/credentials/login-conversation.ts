import { Context, Effect, Layer, Terminal } from "effect"
import { makeCredentialOwner, type CredentialOwner } from "@hapsland/credential-storage/credentials/owner"
import { credentialPolicy } from "@hapsland/runtime-inputs/credentials/policy"
import { withInteractionSession } from "../interaction/interaction-session.ts"
import { InteractionService } from "../interaction/interaction.ts"
import { captureCredential } from "./masked-input.ts"
import { initialLogin, loginCommand, reduceLogin, type LoginModel, type LoginEvent } from "./login-model.ts"

export class LoginOwnerService extends Context.Service<LoginOwnerService, CredentialOwner>()(
  "@hapsland/administration/LoginOwner"
) {}
export const credentialLoginLayer = (options: Parameters<typeof makeCredentialOwner>[0]) =>
  Layer.succeed(LoginOwnerService, makeCredentialOwner(options))
export type LoginTransition = { before: LoginModel; event: LoginEvent; after: LoginModel }
export const credentialPreview = (model: LoginModel): string => {
  const proposal = model.proposal
  if (proposal === undefined) return "No credential proposal"
  return `${proposal.plan.storage}\nScope: ${proposal.plan.scope}\nTarget: ${proposal.plan.target}\n${proposal.activeSource === undefined ? "" : `Currently selected source: ${proposal.activeSource}${proposal.activeFile === undefined ? "" : ` (${proposal.activeFile})`}\nSaving does not change lookup precedence.\n`}${proposal.notice === undefined ? "" : `${proposal.notice}\n`}Approval applies only to this target and proposal.`
}
export const runLoginConversation = Effect.fn("Login.run")(function* (
  options: { observe?: (transition: LoginTransition) => Effect.Effect<void> } = {}
) {
  const interaction = yield* InteractionService
  const owner = yield* LoginOwnerService
  let model = initialLogin()
  let value: string | undefined
  let privateProposal: string | undefined
  const discard = Effect.gen(function* () {
    value = undefined
    if (privateProposal !== undefined) yield* owner.discard(privateProposal)
    privateProposal = undefined
  })
  const dispatch = (action: LoginEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const event = { revision: model.revision, action }
      model = reduceLogin(model, event)
      if (options.observe) yield* options.observe({ before, event, after: model })
    })
  const commands = {
    choose: () =>
      Effect.gen(function* () {
        yield* discard
        const choice = yield* interaction.choose({
          message: "Where should Hapsland save your Jev key?",
          back: false,
          choices: credentialPolicy.destinations.map((destination) => ({
            value: destination.kind,
            title: `${destination.title}${destination.kind === credentialPolicy.defaultDestination ? " — default" : ""} (${destination.storage})`
          }))
        })
        yield* dispatch(choice.kind === "selected" ? { kind: "selected", destination: choice.value } : { kind: "exit" })
      }),
    prepare: (id: number) =>
      Effect.gen(function* () {
        yield* discard
        if (model.destination === undefined)
          return yield* Effect.die(new Error("Credential preparation requires a destination"))
        const proposal = yield* owner.prepare(model.destination)
        privateProposal = proposal.id
        if (proposal.availability === "blocked") yield* interaction.present(`${proposal.reason}\n`)
        yield* dispatch({ kind: "prepared", commandId: id, proposal })
      }),
    input: (id: number) =>
      Effect.gen(function* () {
        yield* interaction.present(`${credentialPreview(model)}\n`)
        value = yield* captureCredential
        yield* dispatch({ kind: "entered", commandId: id, proposalId: privateProposal! })
      }),
    confirm: () =>
      Effect.gen(function* () {
        const approval = yield* interaction.confirm({
          message: "Save this key?",
          preview: credentialPreview(model),
          back: true
        })
        if (approval.kind !== "confirmed" || !approval.yes) yield* discard
        yield* dispatch(
          approval.kind === "confirmed"
            ? { kind: "approved", proposalId: model.proposal!.id, yes: approval.yes }
            : { kind: approval.kind }
        )
      }),
    save: (id: number) =>
      Effect.gen(function* () {
        if (value === undefined || privateProposal === undefined)
          return yield* Effect.die(new Error("Save requires approved private input"))
        // Once mutation starts, interruption cannot turn a known write into cancellation.
        const storage = yield* owner.save(privateProposal, value).pipe(Effect.uninterruptible)
        value = undefined
        privateProposal = undefined
        if (storage.status === "stale")
          yield* interaction.present("The target changed. Review a fresh proposal and enter the key again.\n")
        yield* dispatch({ kind: "observed", commandId: id, storage })
      }).pipe(Effect.uninterruptible),
    active: (id: number) =>
      Effect.gen(function* () {
        const active = yield* owner.active()
        yield* dispatch({ kind: "active", commandId: id, active })
      })
  }
  return yield* Effect.gen(function* () {
    for (let command = loginCommand(model); command; command = loginCommand(model))
      yield* commands[command.kind](command.id)
    return model
  }).pipe(
    Effect.catchIf(
      (error) => error instanceof Terminal.QuitError,
      () => dispatch({ kind: "exit" }).pipe(Effect.map(() => model))
    ),
    Effect.ensuring(discard)
  )
})

/** One physical input session. Read the last observation after interrupted work
 * finishes cleanup, so a completed save cannot become "previous key preserved". */
export const runCredentialSession = Effect.fn("Login.session")(function* (
  options: Parameters<typeof makeCredentialOwner>[0],
  source: "stdin" | "controlling-terminal" = "controlling-terminal"
) {
  const owner = makeCredentialOwner(options)
  let latest = initialLogin()
  let opened = false
  yield* withInteractionSession(
    (interaction) => {
      opened = true
      return runLoginConversation({
        observe: (transition) =>
          Effect.sync(() => {
            latest = transition.after
          })
      }).pipe(
        Effect.provideService(InteractionService, interaction),
        Effect.provideService(LoginOwnerService, owner),
        Effect.asVoid
      )
    },
    Effect.void,
    source
  ).pipe(
    Effect.catchTag("QuitError", () => Effect.void),
    // Prompt cleanup restores terminal modes without ending its rendered line.
    Effect.ensuring(
      Effect.sync(() => {
        if (opened) process.stderr.write("\n")
      })
    )
  )
  return latest.phase === "SelectingDestination"
    ? reduceLogin(latest, { revision: latest.revision, action: { kind: "exit" } })
    : latest
})
