import { packageCommand, packageBuildIdentity } from "./package-runtime.ts"
import type { RuntimeCommand } from "./command-model.ts"
import * as Schema from "effect/Schema"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { readFileSync, mkdirSync, writeFileSync, linkSync, unlinkSync } from "node:fs"
import { dirname, join } from "node:path"

/** Resident selection is independent of administrative CLI and per-runtime hook selection. */
export const residentTargetPath = (): string => join(homedir(), ".local/share/hapsland/resident-target.json")
export const ResidentTarget = Schema.Struct({
  version: Schema.Literal(1),
  build: Schema.NonEmptyString.check(Schema.isMaxLength(16_384)),
  command: Schema.Struct({
    executable: Schema.NonEmptyString.check(Schema.isPattern(/^\//)),
    args: Schema.Array(Schema.String).check(Schema.isMaxLength(8))
  })
})
export interface ResidentTarget extends Schema.Schema.Type<typeof ResidentTarget> {}
export const readResidentTarget = (path = residentTargetPath()): ResidentTarget | undefined => {
  try {
    return Schema.decodeUnknownSync(ResidentTarget, { onExcessProperty: "error" })(
      JSON.parse(readFileSync(path, "utf8"))
    )
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return undefined
    throw new Error("Selected resident is unavailable; retry the resident update.")
  }
}
/** Resolve or publish the resident choice using an explicit target file and package command. */
export const selectResidentCommand = (command: () => RuntimeCommand, path: string, build: string): RuntimeCommand => {
  const selected = readResidentTarget(path)
  if (selected !== undefined) return selected.command
  const fallback = command()
  // First published launch fixes the shared selection independently of later hook updates.
  // Source entrypoints retain their existing optional development behavior.
  if (fallback.args.length !== 0) return fallback
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${randomUUID()}`
  writeFileSync(temporary, JSON.stringify({ version: 1, build, command: fallback }) + "\n", { mode: 0o600, flag: "wx" })
  try {
    linkSync(temporary, path)
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST")) throw cause
  } finally {
    unlinkSync(temporary)
  }
  return readResidentTarget(path)?.command ?? fallback
}
export const selectedResidentCommand = (): RuntimeCommand =>
  selectResidentCommand(() => packageCommand("resident"), residentTargetPath(), packageBuildIdentity)
