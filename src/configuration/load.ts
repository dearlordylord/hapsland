import * as Effect from "effect/Effect";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { decodeConfigurationText } from "./decode.ts";
import { configurationError, ConfigurationError } from "./errors.ts";
import {
  captureConfiguration,
  resolveConfiguration,
  type ConfigurationLayer,
} from "./resolve.ts";
import type { ConfigurationCapture } from "./types.ts";

export const PROJECT_CONFIGURATION_FILES = [
  ".review.jsonc",
  ".realtime-review.jsonc",
] as const;

export const DEFAULT_USER_CONFIGURATION_FILE = join(
  homedir(),
  ".config",
  "realtime-review-tool",
  "config.jsonc",
);

export type LoadConfigurationOptions = {
  /** Explicit path is useful for tests and managed user installations. */
  readonly userConfigPath?: string;
  /** Explicit project name is constrained to the discovered root. */
  readonly projectConfigPath?: string;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const readDocument = (path: string) =>
  Effect.tryPromise({
    try: async () => decodeConfigurationText(await readFile(path, "utf8"), path),
    catch: (cause) =>
      cause instanceof ConfigurationError
        ? cause
        : configurationError(path, "$", "configuration could not be read"),
  });

const projectPath = Effect.fn("Configuration.findProject")(function* (
  root: string,
  requested: string | undefined,
) {
  const canonicalRoot = resolve(root);
  if (requested !== undefined) {
    const candidate = isAbsolute(requested) ? resolve(requested) : resolve(canonicalRoot, requested);
    const fromRoot = relative(canonicalRoot, candidate);
    if (fromRoot === ".." || fromRoot.startsWith("../") || isAbsolute(fromRoot)) {
      return yield* new ConfigurationError({
        source: requested,
        field: "projectConfigPath",
        reason: "project configuration must be inside the Git working tree",
      });
    }
    return (yield* Effect.promise(() => exists(candidate))) ? candidate : undefined;
  }
  const found: Array<string> = [];
  for (const name of PROJECT_CONFIGURATION_FILES) {
    const candidate = join(canonicalRoot, name);
    if (yield* Effect.promise(() => exists(candidate))) found.push(candidate);
  }
  if (found.length > 1) {
    return yield* new ConfigurationError({
      source: canonicalRoot,
      field: "project",
      reason: "multiple project configuration files were found at the Git root",
    });
  }
  return found[0];
});

const userPath = (options: LoadConfigurationOptions): string =>
  options.userConfigPath === undefined
    ? DEFAULT_USER_CONFIGURATION_FILE
    : resolve(options.userConfigPath);

/** Load exactly one root project document and one optional user document. */
export const loadConfiguration = Effect.fn("Configuration.load")(function* (
  root: string,
  options: LoadConfigurationOptions = {},
) {
  const canonicalRoot = resolve(root);
  const layers: Array<ConfigurationLayer> = [];
  const project = yield* projectPath(canonicalRoot, options.projectConfigPath);
  const user = userPath(options);
  if (yield* Effect.promise(() => exists(user))) {
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
  return captureConfiguration(canonicalRoot, policy);
});

export const loadConfigurationAtRoot = (
  root: string,
  options?: LoadConfigurationOptions,
) => loadConfiguration(root, options);
