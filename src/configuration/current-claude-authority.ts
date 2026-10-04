import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeConfigurationText } from "./decode.ts";
import { DEFAULT_USER_CONFIGURATION_FILE, PROJECT_CONFIGURATION_FILE } from "./load.ts";
import { resolveConfiguration, type ConfigurationLayer } from "./resolve.ts";
import type { ClaudeFeedbackMode, ConfigurationOrigin } from "./types.ts";

export type CurrentClaudeFeedbackAuthority =
  | { readonly valid: true; readonly mode: ClaudeFeedbackMode; readonly origin: ConfigurationOrigin }
  | { readonly valid: false };

const isMissing = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";

const readLayer = (name: "user" | "project", path: string): ConfigurationLayer | undefined => {
  try {
    if (!statSync(path).isFile()) throw new Error("configuration path is not a file");
  } catch (cause) {
    if (isMissing(cause)) return undefined;
    throw cause;
  }
  return { name, source: path, document: decodeConfigurationText(readFileSync(path, "utf8"), path) };
};

/**
 * Synchronous authority read for the resident's final handoff barrier. Any
 * ambiguous, malformed, or unreadable configuration denies the handoff.
 */
export const readCurrentClaudeFeedbackAuthority = (
  root: string,
  userConfigPath?: string,
): CurrentClaudeFeedbackAuthority => {
  try {
    const canonicalRoot = resolve(root);
    const user = readLayer("user", userConfigPath === undefined
      ? DEFAULT_USER_CONFIGURATION_FILE
      : resolve(userConfigPath));
    const project = readLayer("project", join(canonicalRoot, PROJECT_CONFIGURATION_FILE));
    const policy = resolveConfiguration(
      [...(user === undefined ? [] : [user]), ...(project === undefined ? [] : [project])],
      canonicalRoot,
    );
    return {
      valid: true,
      mode: policy.claudeFeedbackMode.value,
      origin: policy.claudeFeedbackMode.origin,
    };
  } catch {
    return { valid: false };
  }
};
