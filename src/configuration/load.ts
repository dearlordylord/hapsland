import * as Effect from "effect/Effect";
import { access, readFile } from "node:fs/promises";
import { HAPSLAND_CONFIG_DIRECTORY } from "../runtime/user-paths.ts";
import { isAbsolute, join, relative, resolve } from "node:path";
import { decodeConfigurationText } from "./decode.ts";
import { configurationError, ConfigurationError } from "./errors.ts";
import { captureConfiguration, resolveConfiguration, type ConfigurationLayer } from "./resolve.ts";

export const PROJECT_CONFIGURATION_FILE = ".hapsland.jsonc";

export const DEFAULT_USER_CONFIGURATION_FILE = join(HAPSLAND_CONFIG_DIRECTORY, "config.jsonc");

export type LoadConfigurationOptions = {
  /** Explicit path is useful for tests and managed user installations. */
  readonly userConfigPath?: string;
  /** Explicit project name is constrained to the discovered root. */
  readonly projectConfigPath?: string;
};

const exists = Effect.fn("Configuration.exists")((path: string) =>
  Effect.tryPromise({
    try: () => access(path),
    catch: () => false,
  }).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
    Effect.uninterruptible,
  ),
);

const readDocument = Effect.fn("Configuration.readDocument")(function* (path: string) {
  const source = yield* Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: () => configurationError(path, "$", "configuration could not be read"),
  }).pipe(Effect.uninterruptible);
  return yield* Effect.try({
    try: () => decodeConfigurationText(source, path),
    catch: (cause) =>
      cause instanceof ConfigurationError ? cause : configurationError(path, "$", "configuration could not be read"),
  });
});

const requestedProjectPath = Effect.fn("Configuration.requestedProjectPath")(function* (
  canonicalRoot: string,
  requested: string,
) {
  const candidate = isAbsolute(requested) ? resolve(requested) : resolve(canonicalRoot, requested);
  const fromRoot = relative(canonicalRoot, candidate);
  if (fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)) {
    return yield* new ConfigurationError({
      source: requested,
      field: "projectConfigPath",
      reason: "project configuration must be inside the Git working tree",
    });
  }
  return (yield* exists(candidate)) ? candidate : undefined;
});
const discoverProjectPath = Effect.fn("Configuration.discoverProjectPath")(function* (canonicalRoot: string) {
  const candidate = join(canonicalRoot, PROJECT_CONFIGURATION_FILE);
  return (yield* exists(candidate)) ? candidate : undefined;
});
const projectPath = Effect.fn("Configuration.findProject")(function* (root: string, requested: string | undefined) {
  const canonicalRoot = resolve(root);
  return requested === undefined
    ? yield* discoverProjectPath(canonicalRoot)
    : yield* requestedProjectPath(canonicalRoot, requested);
});

const userPath = (options: LoadConfigurationOptions): string =>
  options.userConfigPath === undefined ? DEFAULT_USER_CONFIGURATION_FILE : resolve(options.userConfigPath);

/** Load exactly one root project document and one optional user document. */
export const loadConfiguration = Effect.fn("Configuration.load")(function* (
  root: string,
  options: LoadConfigurationOptions = {},
) {
  const canonicalRoot = resolve(root);
  const layers: Array<ConfigurationLayer> = [];
  const project = yield* projectPath(canonicalRoot, options.projectConfigPath);
  const user = userPath(options);
  if (yield* exists(user)) {
    layers.push({
      name: "user",
      source: user,
      document: yield* readDocument(user),
    });
  }
  if (project !== undefined) {
    layers.push({
      name: "project",
      source: project,
      document: yield* readDocument(project),
    });
  }
  let policy: ReturnType<typeof resolveConfiguration>;
  try {
    policy = resolveConfiguration(layers, canonicalRoot);
  } catch (cause) {
    return yield* cause instanceof ConfigurationError
      ? cause
      : new ConfigurationError({
          source: canonicalRoot,
          field: "$",
          reason: "configuration resolution failed",
        });
  }
  return captureConfiguration(policy);
});
