import { formatOutcome } from "./human-output.ts"
import type { profileFields } from "./client-command.ts"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { formatFailure, formatProposal, type invokeLifecycle } from "./client-lifecycle.ts"
import type { SetupClient } from "./client-selection.ts"

export type MaintenanceCommand = "repair" | "reinstall" | "uninstall"
type MaintenanceOperation = "install" | "update" | "uninstall"
type LifecycleResult = Effect.Success<ReturnType<typeof invokeLifecycle>>
type LifecycleProposal = NonNullable<LifecycleResult["proposal"]>
type Fields = ReturnType<typeof profileFields>
export interface MaintenancePorts {
  readonly fields: (host: SetupClient) => Fields
  readonly installed: (fields: Fields) => boolean
  readonly inspect: (fields: Fields) => Effect.Effect<unknown, unknown>
  readonly invoke: (
    host: SetupClient,
    request: ReturnType<typeof maintenanceRequest>
  ) => Effect.Effect<LifecycleResult, unknown>
  readonly activate: Effect.Effect<void, unknown>
  readonly confirm: (question: string) => Effect.Effect<boolean, unknown>
  readonly write: (text: string) => void
  readonly reportFailure: (host: SetupClient, cause: unknown) => void
}

const attempt = Effect.fn("Maintenance.attempt")(function* <A>(
  host: SetupClient,
  operation: Effect.Effect<A, unknown>,
  ports: MaintenancePorts
) {
  const result = yield* operation.pipe(Effect.result)
  if (result._tag === "Failure") {
    ports.reportFailure(host, result.failure)
    return Option.none<A>()
  }
  return Option.some(result.success)
})

const isRecoveryOperation = (value: string | undefined): value is MaintenanceOperation =>
  value === "install" || value === "update" || value === "uninstall"
const maintenanceOperation = (
  command: MaintenanceCommand,
  recovered: string | undefined,
  fields: Fields,
  installed: boolean
): MaintenanceOperation => {
  if (command === "repair" && isRecoveryOperation(recovered)) return recovered
  if (command === "uninstall") return "uninstall"
  return fields.host === "claude" && installed && command !== "reinstall" ? "update" : "install"
}
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

const readyProposal = (
  command: MaintenanceCommand,
  host: SetupClient,
  preview: LifecycleResult,
  ports: MaintenancePorts
): LifecycleProposal | undefined => {
  if (preview.status === "already-uninstalled") {
    ports.write(`${formatOutcome("success", `${host} uninstall: already removed.`)}\n`)
    return undefined
  }
  if (!["preview", "partial"].includes(preview.status) || preview.proposal === undefined)
    throw new Error(formatFailure(preview, host))
  if (preview.proposal.changes?.length === 0) {
    ports.write(
      `${formatOutcome("success", `${host} ${command}: ${command === "uninstall" ? "already removed" : "integration intact"}.`)}\n`
    )
    return undefined
  }
  return preview.proposal
}
const printPreview = (
  command: MaintenanceCommand,
  host: SetupClient,
  operation: MaintenanceOperation,
  recovered: string | undefined,
  proposal: LifecycleProposal,
  ports: MaintenancePorts
) => {
  if (recovered !== undefined && command === "repair")
    ports.write(`Resume interrupted ${operation}; after completion rerun hapsland repair ${host} if needed.\n`)
  ports.write(`${host} ${command} preview:\n${formatProposal(proposal).join("\n")}\n`)
  if (command === "reinstall")
    ports.write(
      "Replace marked Hapsland handlers; preserve independent hooks, review settings and saved credentials.\n"
    )
}
const confirmMaintenance = Effect.fn("Maintenance.confirm")(function* (
  command: MaintenanceCommand,
  host: SetupClient,
  ports: MaintenancePorts
) {
  const result = yield* attempt(host, ports.confirm(`Apply ${command} to ${host}?`), ports)
  if (Option.isNone(result)) return false
  if (!result.value) ports.write(`${formatOutcome("info", `${host}: skipped.`)}\n`)
  return result.value
})
const activateMaintenance = Effect.fn("Maintenance.activate")(function* (host: SetupClient, ports: MaintenancePorts) {
  return Option.isSome(yield* attempt(host, ports.activate, ports))
})
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
const finishMaintenance = Effect.fn("Maintenance.finish")(function* (
  host: SetupClient,
  operation: MaintenanceOperation,
  result: LifecycleResult,
  ports: MaintenancePorts
) {
  if (result.status === "partial" && operation !== "uninstall") {
    if (!(yield* activateMaintenance(host, ports))) return false
  }
  if (!completeStatuses.has(result.status)) return yield* Effect.fail(new Error(formatFailure(result, host)))
  return operation === "uninstall" ? true : yield* activateMaintenance(host, ports)
})
const applyMaintenance = Effect.fn("Maintenance.apply")(function* (
  command: MaintenanceCommand,
  host: SetupClient,
  operation: MaintenanceOperation,
  fields: Fields,
  digest: string,
  ports: MaintenancePorts
) {
  const result = yield* attempt(host, ports.invoke(host, maintenanceRequest(command, operation, fields, digest)), ports)
  if (Option.isNone(result)) return false
  const finished = yield* attempt(host, finishMaintenance(host, operation, result.value, ports), ports)
  return Option.isSome(finished) && finished.value
})
const printCompletion = (host: SetupClient, operation: MaintenanceOperation, ports: MaintenancePorts) => {
  ports.write(
    `${formatOutcome("success", `${host} ${operation === "uninstall" ? "uninstall: removed" : "integration: restored"}. User settings and credentials preserved.`)}\n`
  )
  ports.write(
    `Finish current work and restart ${host}${operation === "uninstall" ? "." : "; review native trust prompts."}\n`
  )
}
const Recovery = Schema.Struct({ recovery: Schema.optionalKey(Schema.Struct({ operation: Schema.String })) })

export const maintainHost = Effect.fn("Maintenance.host")(function* (
  command: MaintenanceCommand,
  host: SetupClient,
  ports: MaintenancePorts
) {
  try {
    const fields = ports.fields(host)
    const installed = ports.installed(fields)
    const inspection = yield* attempt(host, ports.inspect(fields), ports)
    if (Option.isNone(inspection)) return
    const recovered = Schema.decodeUnknownSync(Recovery)(inspection.value).recovery?.operation
    const operation = maintenanceOperation(command, recovered, fields, installed)
    const preview = yield* attempt(host, ports.invoke(host, maintenanceRequest(command, operation, fields)), ports)
    if (Option.isNone(preview)) return
    const proposal = readyProposal(command, host, preview.value, ports)
    if (proposal === undefined) return
    printPreview(command, host, operation, recovered, proposal, ports)
    if (!(yield* confirmMaintenance(command, host, ports))) return
    if (!(yield* applyMaintenance(command, host, operation, fields, proposal.digest, ports))) return
    printCompletion(host, operation, ports)
  } catch (cause) {
    ports.reportFailure(host, cause)
  }
})

export interface MaintenanceClientOptions {
  readonly terminal: boolean
  readonly host: SetupClient | undefined
  readonly flags: ReadonlyMap<string, string>
  readonly registered: (
    flags: ReadonlyMap<string, string>,
    onError: MaintenancePorts["reportFailure"]
  ) => ReadonlyArray<SetupClient>
}

export const maintainClients = Effect.fn("Maintenance.clients")(function* (
  command: MaintenanceCommand,
  options: MaintenanceClientOptions,
  ports: MaintenancePorts
) {
  if (!options.terminal)
    throw new Error(`${command} needs a terminal. Use the version-one installation JSON interface for automation.`)
  const hosts = options.host === undefined ? options.registered(options.flags, ports.reportFailure) : [options.host]
  if (hosts.length === 0) {
    if (command === "reinstall") yield* ports.activate
    ports.write("No Hapsland integrations found. Run hapsland setup first.\n")
    return
  }
  for (const host of hosts) yield* maintainHost(command, host, ports)
})
