import { lstat, mkdir } from "node:fs/promises"
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type ResidentPaths = {
  readonly directory: string
  readonly endpoint: string
  readonly lock: string
  readonly owner: string
}

// The default directory is per OS user, not per repository: commands from different
// worktrees or agent runtimes can reach the same resident. It holds connection and
// ownership files, not source or ledger data.
export const residentPaths = (directory: string): ResidentPaths => ({
  directory,
  endpoint: join(directory, "endpoint.json"),
  lock: join(directory, "owner.lock"),
  owner: join(directory, "owner.json")
})

export const resolveResidentPaths = Effect.fn("ResidentEndpoint.resolvePaths")(function* () {
  // Keep empty environment values visible so NonEmptyString rejects them.
  // An explicitly supplied provider retains authority over configuration.
  const context = yield* Effect.context()
  const provider =
    Context.getOrUndefined(context, ConfigProvider.ConfigProvider) ??
    ConfigProvider.fromEnv({ preserveEmptyStrings: true })
  const configuration = yield* Config.all({
    override: Config.option(Config.NonEmptyString("REVIEW_RESIDENT_DIR")),
    runtime: Config.option(Config.NonEmptyString("XDG_RUNTIME_DIR"))
  })
    .parse(provider)
    .pipe(
      Effect.mapError(
        () =>
          new ResidentEndpointError({
            operation: "resolveConfiguration",
            message: "resident endpoint configuration unavailable"
          })
      )
    )
  const uid = typeof process.getuid === "function" ? process.getuid() : process.pid
  const directory = Option.getOrElse(configuration.override, () =>
    Option.match(configuration.runtime, {
      onNone: () => join(tmpdir(), `hapsland-${uid}`),
      onSome: (runtime) => join(runtime, "hapsland")
    })
  )
  return residentPaths(directory)
})

type EndpointKind = "directory" | "regular"
export type EndpointMetadata = {
  readonly uid: number
  readonly mode: number
  readonly isDirectory: boolean
  readonly isFile: boolean
  readonly isSymbolicLink: boolean
}

export const validateEndpointMetadata = (
  metadata: EndpointMetadata,
  kind: EndpointKind,
  uid = typeof process.getuid === "function" ? process.getuid() : process.pid
): boolean =>
  metadata.uid === uid &&
  !metadata.isSymbolicLink &&
  (metadata.mode & 0o077) === 0 &&
  (kind === "directory" ? metadata.isDirectory : metadata.isFile)

const EndpointOperation = Schema.Literals([
  "resolveConfiguration",
  "createDirectory",
  "inspectEndpoint",
  "verifyDirectory",
  "readEndpoint",
  "publishEndpoint",
  "verifyRemovableEndpoint"
])
type EndpointOperation = typeof EndpointOperation.Type

export class ResidentEndpointError extends Schema.TaggedError<ResidentEndpointError>()("ResidentEndpointError", {
  operation: EndpointOperation,
  message: Schema.String,
  code: Schema.optionalKey(Schema.String)
}) {}

const endpointIo = <A>(operation: EndpointOperation, message: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new ResidentEndpointError({
        operation,
        message,
        ...(typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
          ? { code: cause.code }
          : {})
      })
  })

const metadata = Effect.fn("ResidentEndpoint.metadata")(function* (path: string) {
  const value = yield* endpointIo("inspectEndpoint", "resident endpoint metadata unavailable", () => lstat(path))
  return {
    uid: value.uid,
    mode: value.mode,
    isDirectory: value.isDirectory(),
    isFile: value.isFile(),
    isSymbolicLink: value.isSymbolicLink()
  }
})

export const prepareResidentDirectory = Effect.fn("ResidentEndpoint.prepareDirectory")(function* (
  paths: ResidentPaths
) {
  yield* endpointIo("createDirectory", "resident runtime directory creation failed", () =>
    mkdir(paths.directory, { recursive: true, mode: 0o700 })
  )
  if (!validateEndpointMetadata(yield* metadata(paths.directory), "directory")) {
    return yield* Effect.fail(
      new ResidentEndpointError({
        operation: "verifyDirectory",
        message: "resident runtime directory is not a private user-owned directory"
      })
    )
  }
})
