import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** XDG ignores relative base directories; empty values use the default. */
export const xdgProductDirectory = (base: string | undefined, fallback: string): string =>
  join(base && isAbsolute(base) ? base : fallback, "hapsland");

// Startup environment boundary shared by synchronous and Effect consumers.
export const HAPSLAND_CONFIG_DIRECTORY = xdgProductDirectory(process.env.XDG_CONFIG_HOME, join(homedir(), ".config"));
export const HAPSLAND_STATE_DIRECTORY = xdgProductDirectory(process.env.XDG_STATE_HOME, join(homedir(), ".local", "state"));
