import { SUPPORTED_CLIENTS } from "@hapsland/runtime-environment/runtime/agent-clients"
import { formatOutcome, formatStatusOutcome } from "../interaction/outcome.ts"
import { currentCommand, type RuntimeCommand } from "@hapsland/runtime-environment/runtime/package-runtime"
import * as Effect from "effect/Effect"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { spawnInherited } from "./host-process.ts"
import * as Schema from "effect/Schema"
import * as Config from "effect/Config"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { readFileSync, realpathSync } from "node:fs"
import { atomicInstallationFile } from "./atomic-installation-file.ts"
import { hasClaudeRegistration } from "./claude-installation.ts"
import { hasCodexRegistration } from "./codex-installation.ts"
import { hasPiRegistration } from "./pi-installation.ts"
import type { SetupClient } from "./client-selection.ts"
import { profileFields, type ClientCommand } from "./client-command.ts"

const hasRegistration = (fields: ReturnType<typeof profileFields>): boolean => {
  switch (fields.host) {
    case "pi":
      return hasPiRegistration(fields)
    case "claude":
      return hasClaudeRegistration(fields)
    case "codex":
      return hasCodexRegistration(fields)
  }
}
export const registeredClients = (
  flags: ReadonlyMap<string, string>,
  onError?: (host: SetupClient, cause: unknown) => void
): SetupClient[] =>
  SUPPORTED_CLIENTS.filter((host) => {
    try {
      const fields = profileFields(host, flags)
      return hasRegistration(fields)
    } catch (cause) {
      if (onError === undefined) throw cause
      onError(host, cause)
      return false
    }
  })

const ActivePackage = Schema.Struct({
  version: Schema.Literal(1),
  executable: Schema.NonEmptyString,
  args: Schema.Array(Schema.String)
})
const PackageIdentity = Schema.Struct({
  name: Schema.Literal("@hapsland/hapsland"),
  executable: Schema.NonEmptyString,
  args: Schema.Array(Schema.String)
})
const activePath = () => join(homedir(), ".local", "share", "hapsland", "active.json")
class PackageLifecycleError extends Schema.TaggedError<PackageLifecycleError>()("PackageLifecycleError", {
  message: Schema.NonEmptyString
}) {}
const nativePackageObservation = Effect.fn("PackageLifecycle.observe")(<A>(message: string, read: () => A) =>
  Effect.try({ try: read, catch: () => new PackageLifecycleError({ message }) })
)
export const activateCurrentPackage = Effect.fn("PackageLifecycle.activateCurrent")((command: RuntimeCommand) =>
  nativePackageObservation("Activating the current public CLI failed. Keep the package and retry setup.", () =>
    atomicInstallationFile(activePath(), JSON.stringify({ version: 1, ...command }) + "\n")
  )
)
export const activatePackage = Effect.fn("PackageLifecycle.activate")(function* (executable: string) {
  const message =
    "The updated hooks are installed, but activating the public CLI failed. Keep the target package and retry update."
  const absolute = yield* nativePackageObservation(message, () => {
    const path = resolve(executable)
    realpathSync(path)
    return path
  })
  const result = yield* execFileClosedStdin(absolute, ["--package-identity"], {
    timeout: 10_000,
    maxBuffer: 1_048_576,
    env: { ...process.env, HAPSLAND_ACTIVE_DISPATCH: "1" }
  })
  if (!result.succeeded) return yield* Effect.fail(new PackageLifecycleError({ message }))
  const identity = yield* nativePackageObservation(message, (): unknown => JSON.parse(result.stdout)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PackageIdentity)),
    Effect.mapError(() => new PackageLifecycleError({ message }))
  )
  if (!isAbsolute(identity.executable)) {
    return yield* Effect.fail(new PackageLifecycleError({ message: "Target package identity paths must be absolute." }))
  }
  yield* nativePackageObservation(message, () =>
    atomicInstallationFile(
      activePath(),
      JSON.stringify({ version: 1, executable: identity.executable, args: identity.args }) + "\n"
    )
  )
})
const dispatchEnvironment = () => {
  const environment: NodeJS.ProcessEnv = { ...process.env, HAPSLAND_ACTIVE_DISPATCH: "1" }
  delete environment.REVIEW_INSTALL_RUNTIME
  delete environment.REVIEW_INSTALL_ENTRYPOINT
  return environment
}
/** Explicit package selection overrides the active administrative package. */
export const dispatchSelectedPackage = Effect.fn("PackageLifecycle.dispatchSelected")(function* (
  executable: string,
  command: ClientCommand,
  host: SetupClient | undefined,
  flags: ReadonlyMap<string, string>
) {
  const args = [
    command,
    ...(host === undefined ? [] : [host]),
    ...[...flags]
      .filter(([name]) => name !== "--target" && name !== "--host")
      .map(([name, value]) => `${name}=${value}`)
  ]
  const result = yield* spawnInherited(resolve(executable), args, dispatchEnvironment())
  if (!result.started)
    return yield* Effect.fail(new PackageLifecycleError({ message: `Selected package cannot run: ${executable}.` }))
  return result.exitCode ?? 6
})
const MissingPackageFile = Schema.Struct({ code: Schema.Literal("ENOENT") })
const missingPackageFile = (cause: unknown): boolean =>
  Schema.decodeUnknownOption(MissingPackageFile)(cause)._tag === "Some"
const activePackageMatchesProcess = (active: typeof ActivePackage.Type): boolean => {
  const command = currentCommand()
  return (
    realpathSync(command.executable) === realpathSync(active.executable) &&
    JSON.stringify(command.args) === JSON.stringify(active.args)
  )
}
const unavailableActivePackage = (args: ReadonlyArray<string>): undefined => {
  if (args[0] === "reinstall") {
    process.stderr.write("Active package is unavailable; reinstalling from the package in PATH.\n")
    return undefined
  }
  throw new Error("active package paths unavailable")
}
const observeActivePackage = (active: typeof ActivePackage.Type, args: ReadonlyArray<string>): boolean | undefined => {
  try {
    return activePackageMatchesProcess(active)
  } catch {
    return unavailableActivePackage(args)
  }
}
const readActivePackage = (args: ReadonlyArray<string>): typeof ActivePackage.Type | undefined => {
  try {
    const active = Schema.decodeUnknownSync(ActivePackage)(JSON.parse(readFileSync(activePath(), "utf8")))
    if (!isAbsolute(active.executable)) throw new Error("active package paths must be absolute")
    return active
  } catch (cause) {
    if (missingPackageFile(cause)) return undefined
    if (args[0] === "reinstall") {
      process.stderr.write("Active-package record is damaged; reinstalling from PATH.\n")
      return undefined
    }
    throw new PackageLifecycleError({
      message:
        "Hapsland active-package record is damaged. Run hapsland reinstall to rebuild it from the package in PATH."
    })
  }
}
/** Only public lifecycle commands dispatch. Hook processes and JSON automation stay pinned. */
export const dispatchActivePackage = Effect.fn("PackageLifecycle.dispatchActive")(function* (
  args: ReadonlyArray<string>
) {
  const dispatched = yield* Config.NonEmptyString("HAPSLAND_ACTIVE_DISPATCH").pipe(
    Config.withDefault("0"),
    Effect.mapError(() => new PackageLifecycleError({ message: "Active package dispatch configuration is invalid." }))
  )
  if (dispatched === "1") return undefined
  const active = yield* Effect.try({
    try: () => readActivePackage(args),
    catch: (cause) =>
      cause instanceof PackageLifecycleError
        ? cause
        : new PackageLifecycleError({ message: "Reading the active package failed." })
  })
  if (active === undefined) return undefined
  const current = yield* nativePackageObservation(
    `Active package is unavailable: ${active.executable}. Run hapsland reinstall to restore hooks from the package in PATH.`,
    () => observeActivePackage(active, args)
  )
  if (current !== false) return undefined
  const result = yield* spawnInherited(active.executable, [...active.args, ...args], dispatchEnvironment())
  if (!result.started)
    return yield* Effect.fail(
      new PackageLifecycleError({
        message: `Active package cannot run: ${active.executable}. Restore that package or remove ~/.local/share/hapsland/active.json and run hapsland reinstall.`
      })
    )
  return result.exitCode ?? 6
})

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
export const formatCompatibility = (value: unknown): string[] => {
  const lines: string[] = []
  const walk = (node: unknown, path: string) => {
    const item = record(node)
    if (item.required !== undefined)
      lines.push(
        `${path}: detected ${typeof item.observed === "string" ? item.observed : "unavailable"}; required ${String(item.required)}.`
      )
    else
      for (const [key, child] of Object.entries(item))
        if (typeof child === "object") walk(child, path ? `${path} ${key}` : key)
  }
  walk(value, "Compatibility")
  return lines
}
const codexRequirementLines = (codex: Record<string, unknown>): string[] => {
  if (codex.supported !== false) return []
  const lines: string[] = []
  if (codex.version === "unavailable")
    lines.push(
      `Cannot read a stable Codex CLI version from the selected executable: ${displayValue(codex.observed, "unavailable")}.`
    )
  if (codex.hooksAvailable === false)
    lines.push("The selected Codex executable did not expose lifecycle hooks in codex features list.")
  return lines
}
const packageRequirementLines = (name: string, value: unknown): string[] => {
  const check = record(value)
  if (check.ready !== false) return []
  const path = check.path === undefined ? "" : ` at ${String(check.path)}`
  const requirement = check.required === undefined ? "" : `; expected ${String(check.required)}`
  return [`Hapsland package ${name} check failed: ${displayValue(check.observed, "unavailable")}${path}${requirement}.`]
}
/** Explain a refused installation; successful package/agent probes stay silent in setup. */
export const formatInstallationRequirements = (value: unknown): string[] => {
  const compatibility = record(value)
  const lines = codexRequirementLines(record(compatibility.codex))
  for (const [name, check] of Object.entries(record(record(compatibility.runtime).checks)))
    lines.push(...packageRequirementLines(name, check))
  return lines.length > 0 ? lines : formatCompatibility(value)
}
const displayValue = (value: unknown, fallback: string): string => String(value ?? fallback)
const proposalVersionLines = (current: Record<string, unknown>, target: Record<string, unknown>): string[] =>
  target.packageVersion === undefined
    ? []
    : [`Version: ${displayValue(current.packageVersion, "unrecorded")} → ${String(target.packageVersion)}.`]
const proposalChangeLine = (change: unknown): string => {
  const item = record(change)
  const path = item.path ?? item.file
  return `${displayValue(item.description, "Owned configuration change")}${path === undefined ? "" : `: ${String(path)}`}.`
}
const proposalChangeLines = (changes: unknown): string[] =>
  Array.isArray(changes) ? changes.map(proposalChangeLine) : []
const journalReplacementLines = (journal: Record<string, unknown>): string[] =>
  journal.file === undefined
    ? []
    : [`Back up interrupted journal ${String(journal.file)} and rebuild using current settings.`]
const hookMatcherLabel = (matcher: unknown): string => (matcher === undefined ? "" : ` (${String(matcher)})`)
const hookFileLabel = (file: unknown): string => (file === undefined ? "" : ` in ${String(file)}`)
const hookHandlerLine = (handler: unknown): string => {
  const item = record(handler)
  return `  ${item.async === true ? "background" : "foreground"}, timeout ${String(item.timeout)}s: ${String(item.command)}`
}
const hookHandlerLines = (handlers: unknown): string[] => (Array.isArray(handlers) ? handlers.map(hookHandlerLine) : [])
const hookGroupLines = (event: string, value: unknown, file: unknown): string[] => {
  const group = record(value)
  return [`${event}${hookMatcherLabel(group.matcher)}${hookFileLabel(file)}:`, ...hookHandlerLines(group.hooks)]
}
export const formatProposal = (value: unknown): string[] => {
  const proposal = record(value)
  const current = record(proposal.current)
  const target = record(proposal.target)
  const owned = record(proposal.ownedChanges)
  const hooks = record(owned.hooks ?? owned.hook ?? target.hook)
  return [
    ...proposalVersionLines(current, target),
    ...proposalChangeLines(proposal.changes),
    ...journalReplacementLines(record(proposal.journalReplacement)),
    ...Object.entries(record(hooks.groups)).flatMap(([event, group]) => hookGroupLines(event, group, hooks.file))
  ]
}
const ownershipCheck = (check: Record<string, unknown>): boolean => check.stage === "configuration-ownership"
const doctorStageLabel = (check: Record<string, unknown>): string =>
  ownershipCheck(check) && check.status === "conflict" ? "installation damaged" : String(check.status)
const stringDetailLines = (value: unknown, prefix: string): string[] =>
  typeof value === "string" ? [`${prefix}${value}`] : []
const doctorDetailLines = (check: Record<string, unknown>): string[] => {
  if (check.status === "ready") return []
  return [
    ...stringDetailLines(check.observed, "    "),
    ...stringDetailLines(record(record(check.observed).error).message, "    "),
    ...formatCompatibility(check.observed).map((line) => `    ${line}`),
    ...stringDetailLines(check.action, "    Next: ")
  ]
}
const doctorRepairLines = (check: Record<string, unknown>, host: SetupClient): string[] =>
  ownershipCheck(check) && check.status !== "ready"
    ? [`    Run hapsland repair ${host}; for changed Hapsland entries, use hapsland reinstall ${host}.`]
    : []
const doctorCheckLines = (value: unknown, host: SetupClient): string[] => {
  const check = record(value)
  return [
    `  ${formatStatusOutcome(String(check.status), `${String(check.stage)}: ${doctorStageLabel(check)}.`)}`,
    ...doctorDetailLines(check),
    ...doctorRepairLines(check, host)
  ]
}
const doctorChecksLines = (checks: unknown, host: SetupClient): string[] =>
  Array.isArray(checks) ? checks.flatMap((check) => doctorCheckLines(check, host)) : []
export const formatDoctor = (value: unknown, host: SetupClient): string[] => {
  const result = record(value)
  return [
    formatStatusOutcome(
      String(result.status),
      `${host} doctor: local checks ${displayValue(result.status, "failed")}.`
    ),
    ...doctorChecksLines(result.checks, host),
    formatOutcome(
      "info",
      "Native trust and actual agent execution must be checked in the client; a real review was not verified."
    )
  ]
}
export const formatFailure = (value: unknown, host: SetupClient | "resident"): string => {
  const result = record(value)
  const error = record(result.error)
  const message = String(error.message ?? result.status ?? "operation failed")
  if (host === "resident") return `resident: ${message}. Retry hapsland update --resident-only.`
  if (message.includes("explicitly disabled"))
    return `${host}: ${message}. Enable features.hooks in the selected Codex config only if your policy permits Hapsland hooks, then rerun setup.`
  return `${host}: ${String(error.message ?? result.status ?? "operation failed")}. Files were preserved where ownership could not be established. Run hapsland doctor ${host}; use hapsland reinstall ${host} to replace marked Hapsland hooks. Malformed configuration must be corrected first.`
}

const LifecycleResult = Schema.Struct({
  status: Schema.String,
  alreadyCurrent: Schema.optionalKey(Schema.Boolean),
  restart: Schema.optionalKey(Schema.Struct({ required: Schema.Boolean })),
  error: Schema.optionalKey(Schema.Unknown),
  host: Schema.optionalKey(Schema.Unknown),
  recovery: Schema.optionalKey(Schema.Unknown),
  proposal: Schema.optionalKey(
    Schema.Struct({
      digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
      changes: Schema.optionalKey(Schema.Array(Schema.Unknown)),
      ownedChanges: Schema.optionalKey(Schema.Unknown),
      current: Schema.optionalKey(Schema.Unknown),
      target: Schema.optionalKey(Schema.Unknown),
      journalReplacement: Schema.optionalKey(Schema.Unknown)
    })
  )
})
export class LifecycleInvocationError extends Schema.TaggedError<LifecycleInvocationError>()(
  "LifecycleInvocationError",
  { message: Schema.String }
) {}
/** Every human mutation uses the same checked preview/apply transport. */
export const invokeLifecycle = Effect.fn("ClientLifecycle.invoke")(function* (
  command: string,
  args: ReadonlyArray<string>,
  host: SetupClient | "resident",
  request: unknown,
  environment: NodeJS.ProcessEnv = process.env
) {
  const input = yield* Effect.try({
    try: () => {
      const encoded = JSON.stringify(request)
      if (encoded === undefined) throw new Error("missing lifecycle request")
      return encoded
    },
    catch: () => new LifecycleInvocationError({ message: `${host}: lifecycle request could not be encoded` })
  })
  const result = yield* execFileClosedStdin(command, args, {
    input,
    env: environment,
    timeout: 30_000,
    maxBuffer: 1024 * 1024
  })
  if (result.timedOut)
    return yield* Effect.fail(
      new LifecycleInvocationError({ message: `${host}: lifecycle request deadline exceeded; outcome is uncertain` })
    )
  const unreadable = () =>
    new LifecycleInvocationError({
      message:
        host === "resident"
          ? "Resident package returned an unreadable lifecycle result. Activation is uncertain; retry hapsland update --resident-only."
          : `${host}: package returned an unreadable lifecycle result. Run hapsland doctor ${host}.`
    })
  const parsed = yield* Effect.try({ try: () => JSON.parse(result.stdout), catch: unreadable })
  const output = yield* Schema.decodeUnknownEffect(LifecycleResult)(parsed).pipe(Effect.mapError(unreadable))
  if (!result.succeeded && !["partial", "busy", "indeterminate"].includes(output.status)) {
    const compatibility = formatCompatibility(record(output.host).compatibility)
    return yield* Effect.fail(
      new LifecycleInvocationError({ message: [formatFailure(output, host), ...compatibility].join("\n") })
    )
  }
  return output
})
