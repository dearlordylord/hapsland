import { openSync, closeSync, fstatSync, readSync, truncateSync, realpathSync } from "node:fs"
import { basename, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

export const magic = "HAPSLAND-GAME-1\n"
export const headerSize = 80
export const recordSize = 12

export function prepareRecording(binary, args, environment = process.env) {
  if (args.length > 1 || (args.length && !["--new", "--resume", "--replay"].includes(args[0]))) {
    throw new Error("Usage: run.sh [--new | --resume | --replay]")
  }
  const identity = basename(binary)
  if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error("Recording requires a source-identified cached game build")
  const path = resolve(environment.HAPSLAND_GAME_RECORDING ?? "game-recording.bin")
  const mode = args[0] === "--new" ? "new" : args[0] === "--replay" ? "replay"
    : args[0] === "--resume" ? "resume" : "new"
  const header = magic + identity
  if (mode !== "new") {
    const fd = openSync(path, "r")
    let size
    try {
      size = fstatSync(fd).size
      const bytes = Buffer.alloc(headerSize)
      if (readSync(fd, bytes, 0, headerSize, 0) !== headerSize || bytes.toString() !== header) {
        throw new Error("Saved game belongs to a different build or has an invalid header; use --new to replace it")
      }
      if (size < headerSize + recordSize) throw new Error("Saved game has no initial map record")
      // Validate the complete prefix without loading a long session into memory.
      const record = Buffer.alloc(recordSize)
      for (let offset = headerSize; offset + recordSize <= size; offset += recordSize) {
        if (readSync(fd, record, 0, recordSize, offset) !== recordSize) throw new Error("Saved game changed while reading")
        const kind = record.readUInt32LE(0), a = record.readUInt32LE(4), b = record.readUInt32LE(8)
        const valid = offset === headerSize ? kind === 0 && a <= 2 && b === 0
          : kind === 1 ? a !== 114 && a !== 27 && b === 0
          : kind === 2 || kind === 3 ? true : kind === 4 && a >= 1 && a <= 8 && b === 0
        if (!valid) throw new Error(`Invalid saved game record at byte ${offset}`)
      }
    } finally { closeSync(fd) }
    const completeSize = headerSize + Math.floor((size - headerSize) / recordSize) * recordSize
    if (completeSize !== size && mode === "resume") truncateSync(path, completeSize)
    // Replay leaves even an interrupted trailing record untouched.
  }
  return { path, mode, environment: { ...environment, HAPSLAND_GAME_RECORDING: path,
    HAPSLAND_GAME_RECORDING_HEADER: header, HAPSLAND_GAME_RECORDING_MODE: mode } }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try {
    const [binary, ...args] = process.argv.slice(2)
    const prepared = prepareRecording(binary, args)
    console.error(`Canonical defense: ${prepared.mode}; recording ${prepared.path}`)
    const child = spawnSync(binary, ["--threads", "4"], { env: prepared.environment, stdio: "inherit" })
    if (child.error) throw child.error
    process.exitCode = child.status ?? 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
