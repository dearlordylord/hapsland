import {
  packageCommand,
  commandEntrypoint,
  expectedRuntimeVersion,
  observedRuntimeVersion,
  versionProbeArguments
} from "@hapsland/runtime-environment/runtime/package-runtime"
import { Config, Effect, Schema } from "effect"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { atomicInstallationFile } from "./atomic-installation-file.ts"

const PROFILE = "1.14.44"
const ADAPTER = "opencode"
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const message = (cause: unknown) => (cause instanceof Error ? cause.message : "installation failed")

export interface OpenCodeInstallationRequest {
  readonly opencodeConfigHome?: string
  readonly opencodeExecutable?: string
  readonly proposalDigest?: string
}

const OwnedRecord = Schema.Struct({
  version: Schema.Literal(1),
  adapter: Schema.Literal("opencode"),
  home: Schema.String,
  pluginDigest: Schema.String,
  executable: Schema.String,
  args: Schema.Array(Schema.String)
})
interface OwnedRecord extends Schema.Schema.Type<typeof OwnedRecord> {}
const paths = (home: string) => ({
  plugin: join(home, "plugins", "hapsland.mjs"),
  ownership: join(home, ".hapsland", "opencode-installation-v1.json"),
  lock: join(home, ".hapsland", "opencode-installation.lock")
})
const FileError = Schema.Struct({ code: Schema.String })
const nativeFileCode = (cause: unknown): string | undefined => {
  const decoded = Schema.decodeUnknownOption(FileError)(cause)
  return decoded._tag === "Some" ? decoded.value.code : undefined
}
const jsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const parseOwnership = (content: string): Record<string, unknown> => {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new Error("OpenCode ownership record is malformed")
  }
  if (!jsonObject(value)) throw new Error("OpenCode ownership record is malformed")
  return value
}
const read = (path: string): string | undefined => {
  try {
    if (!statSync(path).isFile()) throw new Error(`not a regular file: ${path}`)
    return readFileSync(path, "utf8")
  } catch (cause) {
    if (nativeFileCode(cause) === "ENOENT") return undefined
    throw cause
  }
}
const record = (content: string | undefined): OwnedRecord | undefined => {
  if (content === undefined) return undefined
  const value = parseOwnership(content)
  const decoded = Schema.decodeUnknownOption(OwnedRecord)(value)
  if (decoded._tag === "None") throw new Error("OpenCode ownership record has an unsupported shape")
  return decoded.value
}
class OpenCodeConfigurationError extends Schema.TaggedError<OpenCodeConfigurationError>()(
  "OpenCodeConfigurationError",
  { message: Schema.String }
) {}
const configuration = Effect.fn("OpenCodeInstallation.configuration")(
  function* (request: OpenCodeInstallationRequest) {
    const home =
      request.opencodeConfigHome ??
      join(
        yield* Config.NonEmptyString("XDG_CONFIG_HOME").pipe(Config.withDefault(join(homedir(), ".config"))),
        "opencode"
      )
    const runtime = yield* Config.NonEmptyString("REVIEW_INSTALL_RUNTIME").pipe(
      Config.withDefault(packageCommand("hook").executable)
    )
    const entrypoint = yield* Config.NonEmptyString("REVIEW_INSTALL_ENTRYPOINT").pipe(
      Config.withDefault(commandEntrypoint(packageCommand("hook")))
    )
    return { home: resolve(home), runtime: resolve(runtime), entrypoint: resolve(entrypoint) }
  },
  Effect.mapError(() => new OpenCodeConfigurationError({ message: "OpenCode installation configuration is invalid" }))
)
const inputs = (
  configured: { home: string; runtime: string; entrypoint: string },
  observed: string,
  runtimeObserved: string
) => {
  const { home, entrypoint } = configured
  const compatibility = {
    supported: observed === PROFILE && runtimeObserved === expectedRuntimeVersion(entrypoint) && existsSync(entrypoint),
    host: { observed, required: PROFILE },
    runtime: { observed: runtimeObserved, required: expectedRuntimeVersion(entrypoint) },
    entrypoint: { path: entrypoint, ready: existsSync(entrypoint) }
  }
  return { home, compatibility, paths: paths(home) }
}
const contentDigest = (content: string | undefined): string => digest(content ?? "<missing>")
const ownedPluginMatches = (ownership: OwnedRecord, home: string, content: string | undefined): boolean =>
  ownership.home === home && content !== undefined && digest(content) === ownership.pluginDigest
const planUninstall = (input: ReturnType<typeof inputs>) => {
  const beforePlugin = read(input.paths.plugin)
  const beforeRecord = read(input.paths.ownership)
  const ownership = record(beforeRecord)
  if (ownership !== undefined && !ownedPluginMatches(ownership, input.home, beforePlugin)) {
    throw new Error("owned OpenCode plugin is missing or locally modified")
  }
  if (beforePlugin !== undefined && ownership === undefined) throw new Error("OpenCode plugin path is already occupied")
  const proposalDigest = digest(
    JSON.stringify([
      "uninstall",
      input.home,
      contentDigest(beforePlugin),
      contentDigest(beforeRecord),
      digest("<missing>"),
      digest("<missing>")
    ])
  )
  return {
    input,
    beforePlugin,
    beforeRecord,
    proposalDigest,
    noChange: beforePlugin === undefined && beforeRecord === undefined
  }
}
const conflict = (operation: string, cause: unknown) => ({
  version: 1 as const,
  operation,
  status: "conflict" as const,
  error: { message: message(cause) }
})
const unsupported = (operation: string) => ({
  version: 1 as const,
  operation,
  status: "unsupported" as const,
  host: { adapter: ADAPTER },
  error: { message: "OpenCode review is unavailable until its pre-edit permit lifecycle is implemented." }
})
const previewUninstall = (input: ReturnType<typeof inputs>) => {
  const operation = "uninstall-preview"
  try {
    const next = planUninstall(input)
    return {
      version: 1 as const,
      operation,
      status: "preview" as const,
      host: { adapter: ADAPTER, home: next.input.home, compatibility: next.input.compatibility },
      proposal: {
        digest: next.proposalDigest,
        changes: [
          ...(next.beforePlugin === undefined
            ? []
            : [{ path: next.input.paths.plugin, description: "owned global plugin" }]),
          ...(next.beforeRecord === undefined
            ? []
            : [{ path: next.input.paths.ownership, description: "ownership record" }])
        ],
        ownedChanges: {
          plugin: next.input.paths.plugin,
          hook: "tool.execute.after",
          tools: ["edit", "write"],
          timeoutMilliseconds: 4500
        }
      },
      installed: false,
      trust: {
        status: "host-owned",
        guidance: "OpenCode controls plugin loading; effective file settings and credentials govern review."
      },
      unsupported: [
        "existing-file write",
        "edit without unique changed whole lines",
        "OpenCode --pure",
        "shell writes",
        "file.edited",
        "OpenCode v2"
      ],
      pending: ["apply this proposal digest to remove the owned integration"]
    }
  } catch (cause) {
    return conflict(operation, cause)
  }
}
class OpenCodeInstallationError extends Schema.TaggedError<OpenCodeInstallationError>()("OpenCodeInstallationError", {
  message: Schema.String
}) {}
const commitUninstall = (input: ReturnType<typeof inputs>, next: ReturnType<typeof planUninstall>): void => {
  try {
    atomicInstallationFile(input.paths.plugin, undefined)
    atomicInstallationFile(input.paths.ownership, undefined)
  } catch (cause) {
    if (read(input.paths.plugin) === next.beforePlugin) atomicInstallationFile(input.paths.ownership, next.beforeRecord)
    throw cause
  }
}
const applyUninstall = Effect.fn("OpenCodeInstallation.applyUninstall")(
  (request: OpenCodeInstallationRequest, input: ReturnType<typeof inputs>) =>
    Effect.acquireUseRelease(
      Effect.try({
        try: () => {
          mkdirSync(dirname(input.paths.lock), { recursive: true, mode: 0o700 })
          try {
            mkdirSync(input.paths.lock)
          } catch {
            throw new Error("OpenCode installation is locked")
          }
          return input.paths.lock
        },
        catch: (cause) => new OpenCodeInstallationError({ message: message(cause) })
      }),
      () =>
        Effect.try({
          try: () => {
            const next = planUninstall(input)
            if (request.proposalDigest === undefined) return previewUninstall(input)
            if (request.proposalDigest !== next.proposalDigest)
              return {
                version: 1 as const,
                operation: "uninstall" as const,
                status: "proposal-mismatch" as const,
                error: { message: "OpenCode configuration changed since preview" }
              }
            if (next.noChange)
              return { version: 1 as const, operation: "uninstall" as const, status: "already-current" as const }
            commitUninstall(input, next)
            return { version: 1 as const, operation: "uninstall" as const, status: "complete" as const }
          },
          catch: (cause) => new OpenCodeInstallationError({ message: message(cause) })
        }),
      (lock) =>
        Effect.try({
          try: () => rmSync(lock, { recursive: true, force: true }),
          catch: (cause) => new OpenCodeInstallationError({ message: message(cause) })
        })
    ).pipe(Effect.catch((cause) => Effect.succeed(conflict("uninstall", cause))))
)
export const previewOpenCodeInstallation = (_request: OpenCodeInstallationRequest) => unsupported("install-preview")
export const installOpenCodeIntegration = Effect.fn("OpenCodeInstallation.install")(
  (_request: OpenCodeInstallationRequest) => Effect.succeed(unsupported("install"))
)
export const previewOpenCodeUpdate = (_request: OpenCodeInstallationRequest) => unsupported("update-preview")
export const updateOpenCodeIntegration = Effect.fn("OpenCodeInstallation.update")(
  (_request: OpenCodeInstallationRequest) => Effect.succeed(unsupported("update"))
)
const resolveInputs = Effect.fn("OpenCodeInstallation.inputs")(function* (request: OpenCodeInstallationRequest) {
  const configured = yield* configuration(request)
  const options = { env: process.env, timeout: 2_000, maxBuffer: 1024 * 1024 }
  const hostRun = yield* execFileClosedStdin(request.opencodeExecutable ?? "opencode", ["--version"], options)
  const runtimeRun = yield* execFileClosedStdin(
    configured.runtime,
    versionProbeArguments(configured.runtime, configured.entrypoint),
    options
  )
  return yield* Effect.sync(() =>
    inputs(
      configured,
      hostRun.succeeded ? hostRun.stdout.trim() : "unavailable",
      runtimeRun.succeeded ? observedRuntimeVersion(runtimeRun.stdout) : "unavailable"
    )
  )
})
export const uninstallOpenCodeIntegration = Effect.fn("OpenCodeInstallation.uninstall")(
  function* (request: OpenCodeInstallationRequest) {
    const input = yield* resolveInputs(request)
    return request.proposalDigest === undefined
      ? yield* Effect.sync(() => previewUninstall(input))
      : yield* applyUninstall(request, input)
  },
  Effect.catch((cause: OpenCodeConfigurationError) => Effect.succeed(conflict("uninstall", cause)))
)
const inspect = (input: ReturnType<typeof inputs>) => {
  try {
    const next = planUninstall(input)
    return {
      version: 1 as const,
      operation: "inspect-installation" as const,
      status: "ready" as const,
      installed: next.beforeRecord !== undefined
    }
  } catch (cause) {
    return conflict("inspect-installation", cause)
  }
}
export const inspectOpenCodeInstallation = Effect.fn("OpenCodeInstallation.inspect")(function* (
  request: OpenCodeInstallationRequest
) {
  const input = yield* resolveInputs(request)
  return yield* Effect.sync(() => inspect(input))
})
export const diagnoseOpenCodeIntegration = Effect.fn("OpenCodeInstallation.diagnose")(function* (
  request: OpenCodeInstallationRequest
) {
  const input = yield* resolveInputs(request)
  const inspection = yield* Effect.sync(() => inspect(input))
  const checks = [
    {
      stage: "pre-edit-permit",
      status: "unsupported",
      observed: "OpenCode has no supported pre-edit permit lifecycle; review hooks are inactive"
    },
    {
      stage: "host",
      status: input.compatibility.host.observed === PROFILE ? "ready" : "unsupported",
      observed: input.compatibility.host
    },
    {
      stage: "runtime",
      status: input.compatibility.runtime.observed === input.compatibility.runtime.required ? "ready" : "unsupported",
      observed: input.compatibility.runtime
    },
    {
      stage: "configuration-ownership",
      status: inspection.status === "conflict" ? "conflict" : inspection.installed ? "ready" : "missing",
      observed: inspection
    },
    { stage: "plugin-loading", status: "unknown", observed: "OpenCode host-owned; --pure disables plugins" },
    { stage: "file-selection", status: "unknown", observed: "inspect effective file settings" }
  ]
  return {
    version: 1 as const,
    operation: "doctor" as const,
    status: checks.some((check) => ["conflict", "unsupported", "missing"].includes(check.status))
      ? ("not-ready" as const)
      : ("unknown" as const),
    offline: true as const,
    readOnly: true as const,
    providerCalls: 0 as const,
    checks
  }
})
