import { BUN_VERSION } from "@hapsland/runtime-environment/runtime/bun-runtime"
import {
  packageCommand,
  commandEntrypoint,
  commandTokens,
  packageRootFromEntrypoint,
  versionProbeArguments,
  observedRuntimeVersion,
  expectedRuntimeVersion,
  commandFromEntrypoint
} from "@hapsland/runtime-environment/runtime/package-runtime"
import { Config, Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { atomicInstallationFile } from "./atomic-installation-file.ts"
import { withInstallationLock } from "./installation-lock.ts"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"

export interface PiInstallationRequest {
  readonly piHome?: string
  readonly piExecutable?: string
  readonly proposalDigest?: string
  readonly reinstall?: boolean
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const Owned = Schema.Struct({
  version: Schema.Literal(1),
  adapter: Schema.Literal("pi"),
  home: Schema.String,
  extensionDigest: Schema.String,
  executable: Schema.String,
  args: Schema.Array(Schema.String)
})
const read = (path: string): string | undefined => {
  try {
    if (!lstatSync(path).isFile()) throw new Error(`Not a regular owned file: ${path}`)
    return readFileSync(path, "utf8")
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw cause
  }
}
const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : "Pi installation failed")
const failure = (operation: string, cause: unknown) => ({
  version: 1 as const,
  operation,
  status: "conflict" as const,
  error: { message: errorMessage(cause) }
})
const runtimeVersion = (result: { succeeded: boolean; stdout: string }): string =>
  result.succeeded ? result.stdout.trim() : "unavailable"
const compatibilityFor = (host: string, runtime: string, extension: string, entrypoint: string) => {
  const platform = `${process.platform}-${process.arch}`
  const ready = existsSync(extension)
  return {
    supported: [
      platform === "linux-arm64",
      host === "1.0.0",
      runtime === expectedRuntimeVersion(entrypoint),
      ready
    ].every(Boolean),
    platform: { observed: platform, required: "linux-arm64" },
    host: { observed: host, required: "1.0.0" },
    runtime: { observed: runtime, required: expectedRuntimeVersion(entrypoint) },
    extension: { path: extension, ready }
  }
}
const configured = Effect.fn("PiInstallation.configured")(function* (request: PiInstallationRequest) {
  const home = resolve(
    request.piHome ??
      (yield* Config.NonEmptyString("PI_CODING_AGENT_DIR").pipe(Config.withDefault(join(homedir(), ".pi", "agent"))))
  )
  const runtime = resolve(
    yield* Config.NonEmptyString("REVIEW_INSTALL_RUNTIME").pipe(Config.withDefault(packageCommand("hook").executable))
  )
  const entrypoint = resolve(
    yield* Config.NonEmptyString("REVIEW_INSTALL_ENTRYPOINT").pipe(
      Config.withDefault(commandEntrypoint(packageCommand("hook")))
    )
  )
  const extension = join(packageRootFromEntrypoint(entrypoint), "dist", "pi", "extension.js")
  const options = { timeout: 2_000, maxBuffer: 1_048_576, env: { ...process.env, PI_CODING_AGENT_DIR: home } }
  const host = yield* execFileClosedStdin(request.piExecutable ?? "pi", ["--version"], options)
  const runtimeRun = yield* execFileClosedStdin(runtime, versionProbeArguments(runtime, entrypoint), options)
  const compatibility = compatibilityFor(
    runtimeVersion(host),
    observedRuntimeVersion(runtimeVersion(runtimeRun)),
    extension,
    entrypoint
  )
  return {
    home,
    runtime,
    entrypoint,
    extension,
    compatibility,
    paths: {
      extension: join(home, "extensions", "hapsland.ts"),
      ownership: join(home, ".hapsland", "pi-installation-v1.json"),
      journal: join(home, ".hapsland", "pi-installation-journal-v1.json")
    }
  }
})
type Input = Effect.Success<ReturnType<typeof configured>>
type Operation = "install" | "update" | "uninstall"
const Journal = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literals(["install", "update", "uninstall"]),
  home: Schema.String,
  before: Schema.optionalKey(Schema.String),
  beforeRecord: Schema.optionalKey(Schema.String),
  content: Schema.optionalKey(Schema.String),
  ownership: Schema.optionalKey(Schema.String)
})
const decodeFile = <S extends Schema.Codec<unknown>>(schema: S, content: string | undefined): S["Type"] | undefined =>
  content === undefined ? undefined : Schema.decodeUnknownSync(schema)(JSON.parse(content))
const checkJournal = (
  journal: typeof Journal.Type | undefined,
  input: Input,
  operation: Operation,
  before: string | undefined,
  beforeRecord: string | undefined
): void => {
  if (journal === undefined) return
  if (journal.home !== input.home || journal.operation !== operation)
    throw new Error(`Interrupted Pi ${journal.operation}; resume that operation before ${operation}`)
  if (![journal.before, journal.content].includes(before))
    throw new Error("Interrupted Pi extension has local modifications")
  if (![journal.beforeRecord, journal.ownership].includes(beforeRecord))
    throw new Error("Interrupted Pi ownership has local modifications")
}
const boundOwner = (content: string | undefined, home: string) => {
  const owner = decodeFile(Owned, content)
  if (owner !== undefined && owner.home !== home) throw new Error("Pi ownership belongs to another profile")
  return owner
}
const checkOwner = (
  owner: typeof Owned.Type | undefined,
  before: string | undefined,
  journal: typeof Journal.Type | undefined
): void => {
  if (before === undefined) return
  if (owner !== undefined && hash(before) === owner.extensionDigest) return
  if (journal !== undefined && before === journal.content) return
  throw new Error("Pi extension path is occupied or locally modified; preserve it before retrying")
}
const ownedContent = (input: Input, operation: Operation): string | undefined =>
  operation === "uninstall"
    ? undefined
    : `// Hapsland-owned Pi extension. Restart Pi after lifecycle changes.\nimport { createPiExtension } from ${JSON.stringify(pathToFileURL(input.extension).href)};\nexport default createPiExtension({ command: ${JSON.stringify(commandTokens(input.runtime, input.entrypoint))} });\n`
const ownedRecord = (input: Input, content: string | undefined): string | undefined =>
  content === undefined
    ? undefined
    : JSON.stringify({
        version: 1,
        adapter: "pi",
        home: input.home,
        extensionDigest: hash(content),
        ...commandFromEntrypoint(input.runtime, input.entrypoint)
      }) + "\n"
const plan = (input: Input, operation: Operation) => {
  const journalContent = read(input.paths.journal)
  const journal = decodeFile(Journal, journalContent)
  const before = read(input.paths.extension)
  const beforeRecord = read(input.paths.ownership)
  const owner = boundOwner(beforeRecord, input.home)
  checkJournal(journal, input, operation, before, beforeRecord)
  checkOwner(owner, before, journal)
  const content = ownedContent(input, operation)
  const ownership = ownedRecord(input, content)
  const changes = [
    [input.paths.extension, before, content, "owned Pi extension"],
    [input.paths.journal, journalContent, undefined, "retire interrupted Pi installation journal"],
    [input.paths.ownership, beforeRecord, ownership, "Pi ownership record"]
  ]
    .filter(([, old, next]) => old !== next)
    .map(([path, , , description]) => ({ path, description }))
  const digest = hash(
    JSON.stringify([
      operation,
      input.home,
      input.compatibility,
      before,
      beforeRecord,
      content,
      ownership,
      journalContent
    ])
  )
  return { before, beforeRecord, content, ownership, changes, digest }
}
const preview = (input: Input, operation: "install" | "update" | "uninstall") => {
  if (operation !== "uninstall" && !input.compatibility.supported)
    return {
      version: 1 as const,
      operation,
      status: "unsupported" as const,
      host: { adapter: "pi", home: input.home, compatibility: input.compatibility },
      error: { message: `Select Pi 1.0.0 and the packaged Bun ${BUN_VERSION} executable with its Pi extension.` }
    }
  const next = plan(input, operation)
  return {
    version: 1 as const,
    operation,
    status: "preview" as const,
    installed: next.before !== undefined && next.beforeRecord !== undefined,
    alreadyCurrent: next.changes.length === 0,
    host: { adapter: "pi", home: input.home, compatibility: input.compatibility },
    proposal: {
      digest: next.digest,
      changes: next.changes,
      ownedChanges: { extension: input.paths.extension, content: next.content, ownership: input.paths.ownership }
    },
    ...(read(input.paths.journal) === undefined ? {} : { recovery: { operation, proposalDigest: next.digest } }),
    trust: {
      status: "host-owned",
      guidance:
        "Restart Pi or use /reload; --no-extensions disables loading. Review native trust in Pi. Settings, models, providers and login are unchanged."
    }
  }
}
const run = Effect.fn("PiInstallation.run")(
  function* (request: PiInstallationRequest, operation: "install" | "update" | "uninstall", apply: boolean) {
    const input = yield* configured(request)
    const observed = yield* Effect.try({ try: () => preview(input, operation), catch: errorMessage })
    if (!apply || request.proposalDigest === undefined || observed.status !== "preview") return observed
    return yield* withInstallationLock(
      join(input.home, ".hapsland", "pi-installation.lock"),
      Effect.try({
        try: () => {
          const next = plan(input, operation)
          if (next.digest !== request.proposalDigest)
            return {
              version: 1 as const,
              operation,
              status: "proposal-mismatch" as const,
              error: { message: "Pi installation changed since preview" }
            }
          if (next.changes.length === 0) {
            atomicInstallationFile(input.paths.journal, undefined)
            return { version: 1 as const, operation, status: "already-current" as const }
          }
          atomicInstallationFile(
            input.paths.journal,
            JSON.stringify({
              version: 1,
              operation,
              home: input.home,
              before: next.before,
              beforeRecord: next.beforeRecord,
              content: next.content,
              ownership: next.ownership
            }) + "\n"
          )
          try {
            atomicInstallationFile(input.paths.extension, next.content)
            atomicInstallationFile(input.paths.ownership, next.ownership)
            atomicInstallationFile(input.paths.journal, undefined)
          } catch (cause) {
            atomicInstallationFile(input.paths.extension, next.before)
            atomicInstallationFile(input.paths.ownership, next.beforeRecord)
            atomicInstallationFile(input.paths.journal, undefined)
            throw cause
          }
          return { version: 1 as const, operation, status: "complete" as const }
        },
        catch: errorMessage
      })
    )
  },
  Effect.catch((cause) => Effect.succeed(failure("installation", cause)))
)
export const previewPiInstallation = (request: PiInstallationRequest) => run(request, "install", false)
export const installPiIntegration = (request: PiInstallationRequest) => run(request, "install", true)
export const previewPiUpdate = (request: PiInstallationRequest) => run(request, "update", false)
export const updatePiIntegration = (request: PiInstallationRequest) => run(request, "update", true)
export const uninstallPiIntegration = (request: PiInstallationRequest) => run(request, "uninstall", true)
export const hasPiRegistration = (request: PiInstallationRequest): boolean =>
  existsSync(
    join(
      resolve(request.piHome ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")),
      ".hapsland",
      "pi-installation-v1.json"
    )
  )
export const inspectPiInstallation = Effect.fn("PiInstallation.inspect")(
  function* (request: PiInstallationRequest) {
    const input = yield* configured(request)
    return yield* Effect.try({
      try: () => {
        const interrupted = read(input.paths.journal)
        const recovery =
          interrupted === undefined
            ? undefined
            : Schema.decodeUnknownSync(
                Schema.Struct({ operation: Schema.Literals(["install", "update", "uninstall"]) })
              )(JSON.parse(interrupted))
        const next = plan(input, recovery?.operation ?? "install")
        return {
          version: 1 as const,
          operation: "inspect-installation",
          status: "ready" as const,
          installed: next.before !== undefined && next.beforeRecord !== undefined,
          ...(recovery === undefined ? {} : { recovery })
        }
      },
      catch: errorMessage
    })
  },
  Effect.catch((cause) => Effect.succeed(failure("inspect-installation", cause)))
)
export const diagnosePiIntegration = Effect.fn("PiInstallation.diagnose")(function* (request: PiInstallationRequest) {
  const input = yield* configured(request)
  const inspection = yield* inspectPiInstallation(request)
  const checks = [
    { stage: "host", status: input.compatibility.supported ? "ready" : "unsupported", observed: input.compatibility },
    {
      stage: "configuration-ownership",
      status: inspection.status === "conflict" ? "conflict" : inspection.installed ? "ready" : "missing",
      observed: inspection
    },
    {
      stage: "extension-loading",
      status: "unknown",
      observed: "Restart Pi or /reload; --no-extensions disables extensions. Native trust is host-owned."
    },
    {
      stage: "review-support",
      status: "unknown",
      observed: "Installation does not establish full-profile native conformance."
    },
    {
      stage: "credential",
      status: "unknown",
      observed: "Credential availability must be checked in the Pi extension execution environment."
    },
    {
      stage: "observed-activity",
      status: "unknown",
      observed: "Inspect hapsland status after a supported edit; registration does not prove review or submission."
    }
  ]
  return {
    version: 1 as const,
    operation: "doctor",
    status: checks.some((c) => ["unsupported", "conflict", "missing"].includes(c.status)) ? "not-ready" : "unknown",
    readOnly: true,
    offline: true,
    providerCalls: 0,
    checks
  }
})
