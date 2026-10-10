import { flowInteraction } from "../interaction/flow-input.ts"
import { Context, Effect, Exit, Layer } from "effect"
import { formatOutcome, formatStatusOutcome } from "../interaction/outcome.ts"
import { profileFields } from "./client-command.ts"
import {
  activatePackage,
  formatFailure,
  formatProposal,
  invokeLifecycle,
  registeredClients
} from "./client-lifecycle.ts"
import {
  initialUpdate,
  reduceUpdate,
  updateCommand,
  updateProposals,
  type UpdateCommand,
  type UpdateEvent,
  type UpdateModel,
  type UpdateScope,
  type UpdateOutcome
} from "./update-model.ts"

export const UPDATE_TERMINAL_REQUIRED =
  "Interactive update needs a terminal. Use --update-preview / --update JSON operations for automation."

type LifecycleResult = Effect.Success<ReturnType<typeof invokeLifecycle>>
export interface UpdateOwner {
  discover: Effect.Effect<{ hosts: UpdateScope[]; failures: { host: UpdateScope; cause: unknown }[] }, unknown>
  target: Effect.Effect<string, unknown>
  preview: (executable: string, host: UpdateScope) => Effect.Effect<LifecycleResult, unknown>
  apply: (executable: string, host: UpdateScope, digest: string) => Effect.Effect<LifecycleResult, unknown>
  activate: (executable: string) => Effect.Effect<void, unknown>
}
export class UpdateOwnerService extends Context.Service<UpdateOwnerService, UpdateOwner>()(
  "@hapsland/administration/UpdateOwner"
) {}
// Paths, process environment, target identity and full previews stay in the owner/interpreter.
export const updateOwnerLayer = (options: {
  flags: ReadonlyMap<string, string>
  environment: NodeJS.ProcessEnv
  target: UpdateOwner["target"]
}) => {
  const environment = { ...options.environment }
  delete environment.REVIEW_INSTALL_RUNTIME
  delete environment.REVIEW_INSTALL_ENTRYPOINT
  const invoke = (executable: string, host: UpdateScope, operation: "update-preview" | "update", digest?: string) =>
    invokeLifecycle(
      executable,
      [`--${operation}`],
      host,
      {
        version: 1,
        operation,
        ...(host === "resident" ? { host } : profileFields(host, options.flags)),
        ...(digest === undefined ? {} : { proposalDigest: digest })
      },
      environment
    )
  return Layer.succeed(UpdateOwnerService, {
    discover: Effect.sync(() => {
      const failures: { host: UpdateScope; cause: unknown }[] = []
      return {
        hosts: [
          ...registeredClients(options.flags, (host, cause) => failures.push({ host, cause })),
          "resident" as const
        ],
        failures
      }
    }),
    target: options.target,
    preview: (executable, host) => invoke(executable, host, "update-preview"),
    apply: (executable, host, digest) => invoke(executable, host, "update", digest),
    activate: activatePackage
  })
}
export type UpdateTransition = { before: UpdateModel; event: UpdateEvent; after: UpdateModel }
export interface UpdateOptions {
  terminal: boolean
  host: UpdateScope | undefined
  reportFailure: (host: UpdateScope, cause: unknown) => Effect.Effect<void>
  observe?: (transition: UpdateTransition) => Effect.Effect<void>
}
const applyOutcome = (status: string): Exclude<UpdateOutcome, "skipped"> => {
  if (status === "complete" || status === "updated") return "updated"
  if (status === "already-current") return "already current"
  if (status === "partial" || status === "busy" || status === "indeterminate") return status
  return "failed"
}
type PreviewObservation = Extract<UpdateEvent["action"], { kind: "previewed" }>["result"]
const previewObservation = (preview: LifecycleResult): PreviewObservation => {
  if (["preview", "partial"].includes(preview.status) && preview.proposal) {
    return preview.alreadyCurrent === true || preview.proposal.changes?.length === 0
      ? { kind: "current" }
      : { kind: "proposal", digest: preview.proposal.digest }
  }
  return { kind: preview.status === "busy" || preview.status === "indeterminate" ? preview.status : "failed" }
}
const requiresHookRestart = (
  host: UpdateScope,
  result:
    | { readonly _tag: "Success"; readonly success: LifecycleResult }
    | { readonly _tag: "Failure"; readonly failure: unknown }
): boolean => host !== "resident" && result._tag === "Success" && result.success.restart?.required !== false

export const updateClients = Effect.fn("Update.clients")(function* (options: UpdateOptions) {
  if (!options.terminal) return yield* Effect.fail(new Error(UPDATE_TERMINAL_REQUIRED))
  const owner = yield* UpdateOwnerService
  const interaction = yield* flowInteraction("update")
  let model = initialUpdate()
  let executable: string | undefined
  const previews = new Map<UpdateScope, string>()
  const restartRequired = new Set<UpdateScope>()
  const dispatch = (action: UpdateEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const event = { revision: before.revision, action }
      model = reduceUpdate(before, event)
      yield* options.observe?.({ before, event, after: model }) ?? Effect.void
    })
  const summary = Effect.suspend(() =>
    Effect.gen(function* () {
      for (const agent of model.agents) {
        yield* interaction.present(
          `${formatStatusOutcome(agent.outcome ?? "unknown", `${agent.host} update: ${agent.outcome ?? "outcome not observed"}.`)}\n`
        )
        if (agent.activation === "failed")
          yield* interaction.present(
            `${formatOutcome("error", `${agent.host}: package activation failed; the observed profile result above is retained. Keep the selected package and retry update.`)}\n`
          )
        if (agent.outcome === "updated" && restartRequired.has(agent.host))
          yield* interaction.present(
            `${formatOutcome("info", `Next: finish current work, restart ${agent.host}, and review native trust prompts. A real review was not verified by update.`)}\n`
          )
      }
      yield* interaction.present(
        "Retain previous packages until their hooks and active sessions no longer depend on them.\n"
      )
    })
  )
  const discover = Effect.fn("Update.discover")(function* (command: Extract<UpdateCommand, { kind: "discover" }>) {
    const found = options.host === undefined ? yield* owner.discover : { hosts: [options.host], failures: [] }
    for (const failure of found.failures) yield* options.reportFailure(failure.host, failure.cause)
    yield* dispatch({
      kind: "discovered",
      commandId: command.id,
      hosts: found.hosts,
      failures: found.failures.map((failure) => failure.host)
    })
    if (found.hosts.length) yield* interaction.present(`Update clients: ${found.hosts.join(", ")}.\n`)
    else
      yield* interaction.present(
        found.failures.length
          ? "No client registrations could be selected for update. Resolve the reported discovery errors.\n"
          : "No Hapsland integrations found. Run hapsland setup first.\n"
      )
  })
  const preview = Effect.fn("Update.preview")(function* (
    command: Extract<UpdateCommand, { kind: "preview" }>,
    target: string
  ) {
    yield* interaction.present(`Preview ${command.host}:\n`)
    const result = yield* owner.preview(target, command.host).pipe(Effect.result)
    if (result._tag === "Failure") {
      yield* dispatch({ kind: "previewed", commandId: command.id, host: command.host, result: { kind: "failed" } })
      yield* options.reportFailure(command.host, result.failure)
      return
    }
    const observation = previewObservation(result.success)
    const text = formatProposal(result.success.proposal).join("\n")
    previews.set(command.host, text)
    yield* interaction.present(text + "\n")
    yield* dispatch({ kind: "previewed", commandId: command.id, host: command.host, result: observation })
    if (["failed", "busy", "indeterminate"].includes(observation.kind))
      yield* options.reportFailure(
        command.host,
        new Error(
          command.host === "resident"
            ? "Resident update failed; selected target retained."
            : formatFailure(result.success, command.host)
        )
      )
  })
  const apply = Effect.fn("Update.apply")(function* (
    command: Extract<UpdateCommand, { kind: "apply" }>,
    target: string
  ) {
    const result = yield* owner.apply(target, command.host, command.digest).pipe(Effect.result)
    const outcome = result._tag === "Failure" ? "failed" : applyOutcome(result.success.status)
    if (requiresHookRestart(command.host, result)) restartRequired.add(command.host)
    // Retain observation before reporting or activation can fail/interruption arrive.
    yield* dispatch({ kind: "observed", commandId: command.id, host: command.host, outcome })
    if (outcome === "partial")
      yield* options.reportFailure(
        command.host,
        new Error(
          command.host === "resident"
            ? "Selected resident unavailable; retry hapsland update --resident-only. The target is retained."
            : `Next: hapsland repair ${command.host}. The selected package is retained for recovery.`
        )
      )
    else if (["failed", "busy", "indeterminate"].includes(outcome))
      yield* options.reportFailure(
        command.host,
        result._tag === "Failure"
          ? result.failure
          : new Error(
              command.host === "resident"
                ? "Resident update failed; selected target retained."
                : formatFailure(result.success, command.host)
            )
      )
  })
  const activate = Effect.fn("Update.activate")(function* (
    command: Extract<UpdateCommand, { kind: "activate" }>,
    target: string
  ) {
    const result = yield* owner.activate(target).pipe(Effect.result)
    yield* dispatch({
      kind: "activated",
      commandId: command.id,
      host: command.host,
      result: result._tag === "Failure" ? "failed" : "complete"
    })
    if (result._tag === "Failure") yield* options.reportFailure(command.host, result.failure)
  })
  const runCommand = Effect.fn("Update.command")(function* (command: UpdateCommand) {
    if (command.kind === "discover") return yield* discover(command)
    if (command.kind === "target") {
      executable = yield* owner.target
      return yield* dispatch({ kind: "targeted", commandId: command.id })
    }
    if (executable === undefined) return yield* Effect.die(new Error("Update target was not acquired"))
    if (command.kind === "preview") return yield* preview(command, executable)
    if (command.kind === "apply") return yield* apply(command, executable)
    return yield* activate(command, executable)
  })
  const input = Effect.fn("Update.input")(function* () {
    const proposed = updateProposals(model)
    const preview = proposed
      .map((item) => `${item.host}:\n${previews.get(item.host) ?? ""}\nApproval digest: ${item.digest}`)
      .join("\n\n")
    const prompt =
      model.phase === "Review"
        ? interaction
            .choose({
              message: "Review all update previews",
              choices: [{ title: "Continue to grouped approval", value: "continue" as const }],
              back: false
            })
            .pipe(
              Effect.map((answer): UpdateEvent["action"] =>
                answer.kind === "selected" ? { kind: "continue" } : { kind: answer.kind }
              )
            )
        : interaction
            .confirm({
              message: `Apply these changes to ${proposed.map((item) => item.host).join(", ")} profiles?`,
              preview,
              back: true
            })
            .pipe(
              Effect.map((answer): UpdateEvent["action"] =>
                answer.kind === "confirmed"
                  ? { kind: "approve", yes: answer.yes, proposals: proposed }
                  : { kind: answer.kind }
              )
            )
    yield* dispatch(
      yield* prompt.pipe(Effect.catchTag("QuitError", () => Effect.succeed<UpdateEvent["action"]>({ kind: "exit" })))
    )
  })
  return yield* Effect.gen(function* () {
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      const command = updateCommand(model)
      if (command) yield* runCommand(command)
      else yield* input()
    }
    yield* summary
    return model
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit)
        ? summary.pipe(
            Effect.andThen(interaction.present(`Update stopped in ${model.phase}. No rollback is implied.\n`))
          )
        : Effect.void
    )
  )
})
