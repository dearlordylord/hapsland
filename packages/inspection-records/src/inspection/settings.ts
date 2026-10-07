import { constants, closeSync, fstatSync, openSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { decodeConfigurationText } from "@hapsland/runtime-inputs/configuration/decode"
import {
  DEFAULT_USER_CONFIGURATION_FILE,
  PROJECT_CONFIGURATION_FILE
} from "@hapsland/runtime-inputs/configuration/load"
import {
  effectiveInspectionLimits,
  effectiveSessionInspection,
  resolveConfiguration,
  type ConfigurationLayer
} from "@hapsland/runtime-inputs/configuration/resolve"

const MAX_CONFIGURATION_BYTES = 256 * 1024
const missing = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
const layer = (name: "user" | "project", path: string): ConfigurationLayer | undefined => {
  let file: number
  try {
    file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if (missing(error)) return undefined
    throw error
  }
  try {
    const stat = fstatSync(file)
    if (!stat.isFile() || stat.size > MAX_CONFIGURATION_BYTES) throw new Error("inspection configuration unavailable")
    const encoded = readFileSync(file, "utf8")
    if (Buffer.byteLength(encoded) > MAX_CONFIGURATION_BYTES) throw new Error("inspection configuration unavailable")
    return { name, source: path, document: decodeConfigurationText(encoded, path) }
  } finally {
    closeSync(file)
  }
}

/** Capture consent is refreshed at ingress. Invalid or unreadable settings suspend optional recording. */
export const readInspectionSettings = (
  root: string,
  userConfigPath = DEFAULT_USER_CONFIGURATION_FILE
): { readonly enabled: boolean; readonly retentionMs: number; readonly storageBytes: number } | undefined => {
  try {
    const canonicalRoot = resolve(root)
    const user = layer("user", resolve(userConfigPath))
    const project = layer("project", join(canonicalRoot, PROJECT_CONFIGURATION_FILE))
    const policy = resolveConfiguration([...(user ? [user] : []), ...(project ? [project] : [])], canonicalRoot)
    return { enabled: effectiveSessionInspection(policy), ...effectiveInspectionLimits(policy) }
  } catch {
    return undefined
  }
}

/** Dashboard maintenance uses only shared user limits, never a cwd-derived project. */
export const readInspectionUserLimits = (userConfigPath = DEFAULT_USER_CONFIGURATION_FILE) => {
  const user = layer("user", resolve(userConfigPath))
  return effectiveInspectionLimits({ layers: user ? [user] : [] })
}
