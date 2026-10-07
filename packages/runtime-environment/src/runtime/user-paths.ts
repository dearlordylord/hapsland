import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

/** XDG ignores relative base directories; empty values use the default. */
export const xdgProductDirectory = (base: string | undefined, fallback: string): string =>
  join(base && isAbsolute(base) ? base : fallback, "hapsland")

// Startup environment boundary shared by synchronous and Effect consumers.
export const HAPSLAND_CONFIG_DIRECTORY = xdgProductDirectory(process.env.XDG_CONFIG_HOME, join(homedir(), ".config"))
export const HAPSLAND_STATE_DIRECTORY = xdgProductDirectory(
  process.env.XDG_STATE_HOME,
  join(homedir(), ".local", "state")
)

/** Resolved coordinates; credential policy consumes these without reading process state. */
export const credentialCoordinates = (root?: string, userDirectory = HAPSLAND_CONFIG_DIRECTORY) => ({
  root,
  userFile: join(userDirectory, ".env"),
  projectLocalFile: root === undefined ? undefined : join(root, ".env.local"),
  projectFile: root === undefined ? undefined : join(root, ".env"),
  nativeTarget:
    process.platform === "darwin"
      ? "macOS login Keychain (Hapsland Jev key)"
      : "Linux Secret Service (Hapsland Jev key)"
})
