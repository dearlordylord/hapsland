import { lstat, mkdir } from "node:fs/promises";
import { Config, ConfigProvider, Context, Effect, Option, Schema } from "effect";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ResidentPaths = {
  readonly directory: string;
  readonly socket: string;
  readonly lock: string;
  readonly owner: string;
};

// The default directory is per OS user, not per repository: commands from different
// worktrees or agent runtimes can reach the same resident. It holds connection and
// ownership files, not source or ledger data.
export const residentPaths = (directory: string): ResidentPaths => ({
  directory,
  socket: join(directory, "resident.sock"),
  lock: join(directory, "owner.lock"),
  owner: join(directory, "owner.json"),
});

export const resolveResidentPaths = Effect.fn("ResidentEndpoint.resolvePaths")(function* () {
  // Keep empty environment values visible so NonEmptyString rejects them.
  // An explicitly supplied provider retains authority over configuration.
  const context = yield* Effect.context();
  const provider = Context.getOrUndefined(context, ConfigProvider.ConfigProvider)
    ?? ConfigProvider.fromEnv({ preserveEmptyStrings: true });
  const configuration = yield* Config.all({
    override: Config.option(Config.NonEmptyString("REVIEW_RESIDENT_DIR")),
    runtime: Config.option(Config.NonEmptyString("XDG_RUNTIME_DIR")),
  }).parse(provider).pipe(Effect.mapError(() => new ResidentEndpointError({
    operation: "resolveConfiguration", message: "resident endpoint configuration unavailable",
  })));
  const uid = typeof process.getuid === "function" ? process.getuid() : process.pid;
  const directory = Option.getOrElse(configuration.override, () => Option.match(configuration.runtime, {
    onNone: () => join(tmpdir(), `realtime-review-tool-${uid}`),
    onSome: (runtime) => join(runtime, "realtime-review-tool"),
  }));
  return residentPaths(directory);
});

type EndpointKind = "directory" | "socket" | "regular";
export type EndpointMetadata = {
  readonly uid: number;
  readonly mode: number;
  readonly isDirectory: boolean;
  readonly isSocket: boolean;
  readonly isFile: boolean;
  readonly isSymbolicLink: boolean;
};

export const validateEndpointMetadata = (
  metadata: EndpointMetadata,
  kind: EndpointKind,
  uid = typeof process.getuid === "function" ? process.getuid() : process.pid,
): boolean =>
  metadata.uid === uid &&
  !metadata.isSymbolicLink &&
  (metadata.mode & 0o077) === 0 &&
  (kind === "directory"
    ? metadata.isDirectory
    : kind === "socket"
      ? metadata.isSocket
      : metadata.isFile);

const EndpointOperation = Schema.Literals(["resolveConfiguration", "createDirectory", "inspectEndpoint", "verifyDirectory", "verifySocket", "verifyRemovableSocket"]);
type EndpointOperation = typeof EndpointOperation.Type;

export class ResidentEndpointError extends Schema.TaggedError<ResidentEndpointError>()(
  "ResidentEndpointError", {
    operation: EndpointOperation,
    message: Schema.String,
    code: Schema.optionalKey(Schema.String),
  },
) {}

const endpointIo = <A>(operation: EndpointOperation, message: string, run: () => Promise<A>) => Effect.tryPromise({
  try: run,
  catch: (cause) => new ResidentEndpointError({ operation, message,
    ...(typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
      ? { code: cause.code } : {}),
  }),
});

const metadata = Effect.fn("ResidentEndpoint.metadata")(function* (path: string) {
  const value = yield* endpointIo("inspectEndpoint", "resident endpoint metadata unavailable", () => lstat(path));
  return {
    uid: value.uid,
    mode: value.mode,
    isDirectory: value.isDirectory(),
    isSocket: value.isSocket(),
    isFile: value.isFile(),
    isSymbolicLink: value.isSymbolicLink(),
  };
});

export const prepareResidentDirectory = Effect.fn("ResidentEndpoint.prepareDirectory")(function* (paths: ResidentPaths) {
  yield* endpointIo("createDirectory", "resident runtime directory creation failed",
    () => mkdir(paths.directory, { recursive: true, mode: 0o700 }));
  if (!validateEndpointMetadata(yield* metadata(paths.directory), "directory")) {
    return yield* Effect.fail(new ResidentEndpointError({ operation: "verifyDirectory",
      message: "resident runtime directory is not a private user-owned directory" }));
  }
});

export const verifyResidentSocket = Effect.fn("ResidentEndpoint.verifySocket")(function* (paths: ResidentPaths) {
  // Node 24's net.Socket does not expose Linux SO_PEERCRED. The supported
  // profile therefore authenticates the endpoint through a private uid-owned
  // directory plus uid/type/mode checks on the socket itself.
  if (!validateEndpointMetadata(yield* metadata(paths.socket), "socket")) {
    return yield* Effect.fail(new ResidentEndpointError({ operation: "verifySocket",
      message: "resident socket is not a private user-owned socket" }));
  }
});

export const verifyRemovableSocket = Effect.fn("ResidentEndpoint.verifyRemovableSocket")(function* (paths: ResidentPaths) {
  const value = yield* metadata(paths.socket).pipe(Effect.catch((error) =>
    error.code === "ENOENT" ? Effect.succeed(undefined) : Effect.fail(error)));
  if (value !== undefined && !validateEndpointMetadata(value, "socket")) {
    return yield* Effect.fail(new ResidentEndpointError({ operation: "verifyRemovableSocket",
      message: "resident socket pathname is unsafe" }));
  }
});
