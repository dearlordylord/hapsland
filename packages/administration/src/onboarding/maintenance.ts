import { Context, Effect, Exit, Layer, Schema } from "effect"
import { formatOutcome, formatStatusOutcome } from "./human-output.ts"
import { profileFields } from "./client-command.ts"
import {
  activateCurrentPackage,
  formatFailure,
  formatProposal,
  invokeLifecycle,
  registeredClients
} from "./client-lifecycle.ts"
import type { SetupClient } from "./client-selection.ts"
import { InteractionService } from "../interaction/interaction.ts"
import {
  initialMaintenance,
  maintenanceEffectCommand,
  reduceMaintenance,
  type MaintenanceAgent,
  type MaintenanceCommand,
  type MaintenanceEffectCommand,
  type MaintenanceEvent,
  type MaintenanceModel,
  type MaintenanceOperation,
  type MaintenanceOutcome
} from "./maintenance-model.ts"
export type { MaintenanceCommand } from "./maintenance-model.ts"

type LifecycleResult = Effect.Success<ReturnType<typeof invokeLifecycle>>
type Fields = ReturnType<typeof profileFields>
export const maintenanceTerminalRequired = (command: MaintenanceCommand) =>
  `${command} needs a terminal. Use the version-one installation JSON interface for automation.`
export interface MaintenanceOwner {
  discover: Effect.Effect<{ hosts: SetupClient[]; failures: { host: SetupClient; cause: unknown }[] }, unknown>
  fields: (host: SetupClient) => Fields
  inspect: (fields: Fields) => Effect.Effect<{ installed: boolean; inspection: unknown }, unknown>
  invoke: (host: SetupClient, request: ReturnType<typeof maintenanceRequest>) => Effect.Effect<LifecycleResult, unknown>
  activate: Effect.Effect<void, unknown>
}
export class MaintenanceOwnerService extends Context.Service<MaintenanceOwnerService, MaintenanceOwner>()(
  "@hapsland/administration/MaintenanceOwner"
) {}
export const maintenanceOwnerLayer = (options: {
  flags: ReadonlyMap<string, string>
  command: Parameters<typeof activateCurrentPackage>[0]
  installed: (fields: Fields) => boolean
  inspect: (fields: Fields) => Effect.Effect<unknown, unknown>
}) =>
  Layer.succeed(MaintenanceOwnerService, {
    discover: Effect.sync(() => {
      const failures: { host: SetupClient; cause: unknown }[] = []
      return { hosts: registeredClients(options.flags, (host, cause) => failures.push({ host, cause })), failures }
    }),
    fields: (host) => profileFields(host, options.flags),
    inspect: (fields) =>
      Effect.gen(function* () {
        const installed = yield* Effect.try(() => options.installed(fields))
        const inspection = yield* options.inspect(fields)
        return { installed, inspection }
      }),
    invoke: (host, request) =>
      invokeLifecycle(options.command.executable, [...options.command.args, `--${request.operation}`], host, request),
    activate: activateCurrentPackage(options.command)
  })
const maintenanceRequest = (
  command: MaintenanceCommand,
  operation: MaintenanceOperation,
  fields: Fields,
  digest?: string
) => ({
  version: 1,
  ...fields,
  operation: digest === undefined && operation !== "uninstall" ? `${operation}-preview` : operation,
  ...(command === "reinstall" && operation === "install" ? { reinstall: true } : {}),
  ...(digest === undefined ? {} : { proposalDigest: digest })
})
const isRecoveryOperation = (operation: string | undefined): operation is MaintenanceOperation =>
  operation === "install" || operation === "update" || operation === "uninstall"
const operationFor = (
  command: MaintenanceCommand,
  recovered: string | undefined,
  host: SetupClient,
  installed: boolean
): MaintenanceOperation => {
  if (command === "repair" && isRecoveryOperation(recovered)) return recovered
  if (command === "uninstall") return "uninstall"
  return host === "claude" && installed && command !== "reinstall" ? "update" : "install"
}
const Recovery = Schema.Struct({ recovery: Schema.optionalKey(Schema.Struct({ operation: Schema.String })) })
const completeStatuses = new Set([
  "complete",
  "installed",
  "already-installed",
  "updated",
  "already-current",
  "uninstalled",
  "already-uninstalled",
  "removed",
  "already-removed"
])
const outcomeFor = (result: LifecycleResult, operation: MaintenanceOperation): MaintenanceOutcome => {
  if (completeStatuses.has(result.status)) return operation === "uninstall" ? "removed" : "restored"
  if (result.status === "partial" || result.status === "busy" || result.status === "indeterminate") return result.status
  return "failed"
}
const uncertainOutcome = (status: string): "partial" | "busy" | "indeterminate" | "failed" =>
  status === "partial" || status === "busy" || status === "indeterminate" ? status : "failed"
type PreviewObservation = Extract<MaintenanceEvent["action"], { kind: "previewed" }>["result"]
const previewObservation = (result: LifecycleResult, operation: MaintenanceOperation): PreviewObservation => {
  if (result.status === "already-uninstalled") return { kind: "already removed" }
  if (["preview", "partial"].includes(result.status) && result.proposal)
    return result.proposal.changes?.length === 0
      ? { kind: operation === "uninstall" ? "already removed" : "intact" }
      : { kind: "proposal", digest: result.proposal.digest }
  return { kind: uncertainOutcome(result.status) }
}
const completionLines = (agent: MaintenanceAgent): string[] => {
  if (!["restored", "removed"].includes(agent.outcome ?? "") || agent.activation === "failed") return []
  return [
    `${formatOutcome("success", `${agent.host} ${agent.operation === "uninstall" ? "uninstall: removed" : "integration: restored"}. User settings and credentials preserved.`)}\n`,
    `Finish current work and restart ${agent.host}${agent.operation === "uninstall" ? "." : "; review native trust prompts. A real review was not verified."}\n`
  ]
}
const summaryLines = (agent: MaintenanceAgent, command: MaintenanceCommand): string[] => {
  const label = agent.outcome === "intact" ? "integration intact" : (agent.outcome ?? "outcome not observed")
  return [
    `${formatStatusOutcome(agent.outcome ?? "unknown", `${agent.host} ${command}: ${label}.`)}\n`,
    ...(agent.activation === "failed"
      ? [
          `${formatOutcome("error", `${agent.host}: package activation failed; the observed profile result is retained. Retry ${command} using the retained package.`)}\n`
        ]
      : []),
    ...completionLines(agent)
  ]
}
export type MaintenanceTransition = { before: MaintenanceModel; event: MaintenanceEvent; after: MaintenanceModel }
export interface MaintenanceOptions {
  terminal: boolean
  host: SetupClient | undefined
  reportFailure: (host: SetupClient, cause: unknown) => Effect.Effect<void>
  observe?: (transition: MaintenanceTransition) => Effect.Effect<void>
}
export const maintainClients = Effect.fn("Maintenance.clients")(function* (
  commandName: MaintenanceCommand,
  options: MaintenanceOptions
) {
  if (!options.terminal) return yield* Effect.fail(new Error(maintenanceTerminalRequired(commandName)))
  const owner = yield* MaintenanceOwnerService
  const interaction = yield* InteractionService
  let model = initialMaintenance(commandName)
  const previews = new Map<SetupClient, string>()
  const dispatch = (action: MaintenanceEvent["action"]) =>
    Effect.gen(function* () {
      const before = model
      const event = { revision: before.revision, action }
      model = reduceMaintenance(before, event)
      yield* options.observe?.({ before, event, after: model }) ?? Effect.void
    })
  const summary = Effect.suspend(() =>
    Effect.gen(function* () {
      for (const agent of model.agents)
        for (const line of summaryLines(agent, commandName)) yield* interaction.present(line)
    })
  )
  const discover = Effect.fn("Maintenance.discover")(function* (
    command: Extract<MaintenanceEffectCommand, { kind: "discover" }>
  ) {
    const found = options.host === undefined ? yield* owner.discover : { hosts: [options.host], failures: [] }
    for (const failure of found.failures) yield* options.reportFailure(failure.host, failure.cause)
    yield* dispatch({
      kind: "discovered",
      commandId: command.id,
      hosts: found.hosts,
      failures: found.failures.map((failure) => failure.host)
    })
    if (found.hosts.length === 0)
      yield* interaction.present(
        found.failures.length
          ? "No client registrations could be selected. Resolve the reported discovery errors.\n"
          : "No Hapsland integrations found. Run hapsland setup first.\n"
      )
  })
  const inspect = Effect.fn("Maintenance.inspect")(function* (
    command: Extract<MaintenanceEffectCommand, { kind: "inspect" }>
  ) {
    const result = yield* Effect.gen(function* () {
      const fields = yield* Effect.try(() => owner.fields(command.host))
      const observed = yield* owner.inspect(fields)
      const decoded = yield* Schema.decodeUnknownEffect(Recovery)(observed.inspection)
      const recovered = decoded.recovery?.operation
      return {
        operation: operationFor(commandName, recovered, command.host, observed.installed),
        recovering: commandName === "repair" && isRecoveryOperation(recovered)
      }
    }).pipe(Effect.result)
    if (result._tag === "Failure") {
      yield* dispatch({ kind: "failed", commandId: command.id, host: command.host })
      return yield* options.reportFailure(command.host, result.failure)
    }
    yield* dispatch({ kind: "inspected", commandId: command.id, host: command.host, ...result.success })
  })
  const invoke = (command: Extract<MaintenanceEffectCommand, { kind: "preview" | "apply" }>) =>
    Effect.gen(function* () {
      const fields = yield* Effect.try(() => owner.fields(command.host))
      return yield* owner.invoke(
        command.host,
        maintenanceRequest(
          commandName,
          command.operation,
          fields,
          command.kind === "apply" ? command.digest : undefined
        )
      )
    })
  const preview = Effect.fn("Maintenance.preview")(function* (
    command: Extract<MaintenanceEffectCommand, { kind: "preview" }>
  ) {
    const result = yield* invoke(command).pipe(Effect.result)
    if (result._tag === "Failure") {
      yield* dispatch({ kind: "failed", commandId: command.id, host: command.host })
      return yield* options.reportFailure(command.host, result.failure)
    }
    const observation = previewObservation(result.success, command.operation)
    const text = `${command.host} ${commandName} preview:\n${formatProposal(result.success.proposal).join("\n")}\n`
    previews.set(command.host, text)
    if (model.agents[model.cursor]?.recovering)
      yield* interaction.present(
        `Resume interrupted ${command.operation}; after completion rerun hapsland repair ${command.host} if needed.\n`
      )
    if (observation.kind === "proposal") {
      yield* interaction.present(text)
      if (commandName === "reinstall")
        yield* interaction.present(
          "Replace marked Hapsland handlers; preserve independent hooks, review settings and saved credentials.\n"
        )
    }
    yield* dispatch({ kind: "previewed", commandId: command.id, host: command.host, result: observation })
    if (["partial", "busy", "indeterminate", "failed"].includes(observation.kind))
      yield* options.reportFailure(command.host, new Error(formatFailure(result.success, command.host)))
  })
  const apply = Effect.fn("Maintenance.apply")(function* (
    command: Extract<MaintenanceEffectCommand, { kind: "apply" }>
  ) {
    const result = yield* invoke(command).pipe(Effect.result)
    const outcome = result._tag === "Failure" ? "failed" : outcomeFor(result.success, command.operation)
    yield* dispatch({ kind: "observed", commandId: command.id, host: command.host, outcome })
    if (["partial", "busy", "indeterminate", "failed"].includes(outcome))
      yield* options.reportFailure(
        command.host,
        result._tag === "Failure"
          ? result.failure
          : new Error(
              `${formatFailure(result.success, command.host)} Next: hapsland repair ${command.host}; retain the selected package for recovery.`
            )
      )
  })
  const activate = Effect.fn("Maintenance.activate")(function* (
    command: Extract<MaintenanceEffectCommand, { kind: "activate" | "activateEmpty" }>
  ) {
    const result = yield* owner.activate.pipe(Effect.result)
    const status = result._tag === "Failure" ? ("failed" as const) : ("complete" as const)
    if (command.kind === "activateEmpty") {
      yield* dispatch({ kind: "activatedEmpty", commandId: command.id, result: status })
      if (result._tag === "Failure") return yield* Effect.fail(result.failure)
    } else {
      yield* dispatch({ kind: "activated", commandId: command.id, host: command.host, result: status })
      if (result._tag === "Failure") yield* options.reportFailure(command.host, result.failure)
    }
  })
  const runCommand = (command: MaintenanceEffectCommand) => {
    switch (command.kind) {
      case "discover":
        return discover(command)
      case "inspect":
        return inspect(command)
      case "preview":
        return preview(command)
      case "apply":
        return apply(command)
      default:
        return activate(command)
    }
  }
  const input = Effect.fn("Maintenance.input")(function* () {
    const agent = model.agents[model.cursor]
    if (!agent?.digest) return yield* Effect.die(new Error("Maintenance approval has no proposal"))
    const prompt =
      model.phase === "Review"
        ? interaction
            .choose({
              message: `Review ${agent.host} ${commandName} preview`,
              choices: [{ title: "Continue to approval", value: "continue" as const }],
              back: false
            })
            .pipe(
              Effect.map((answer): MaintenanceEvent["action"] =>
                answer.kind === "selected" ? { kind: "continue" } : { kind: answer.kind }
              )
            )
        : interaction
            .confirm({
              message: `Apply ${commandName} to ${agent.host}?`,
              preview: `${previews.get(agent.host) ?? ""}Approval digest: ${agent.digest}`,
              back: true
            })
            .pipe(
              Effect.map((answer): MaintenanceEvent["action"] =>
                answer.kind === "confirmed"
                  ? { kind: "approve", host: agent.host, digest: agent.digest!, yes: answer.yes }
                  : { kind: answer.kind }
              )
            )
    yield* dispatch(
      yield* prompt.pipe(
        Effect.catchTag("QuitError", () => Effect.succeed<MaintenanceEvent["action"]>({ kind: "exit" }))
      )
    )
  })
  return yield* Effect.gen(function* () {
    while (model.phase !== "Done" && model.phase !== "Cancelled") {
      const command = maintenanceEffectCommand(model)
      if (command) yield* runCommand(command)
      else yield* input()
    }
    yield* summary
    return model
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit)
        ? summary.pipe(
            Effect.andThen(interaction.present(`Maintenance stopped in ${model.phase}. No rollback is implied.\n`))
          )
        : Effect.void
    )
  )
})
