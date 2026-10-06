import { chmodSync, readFileSync, copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"

/** Publish a complete executable on a new inode; running readers retain the old one. */
export const buildNativeArtifact = (output, build) => {
  const directory = dirname(output)
  mkdirSync(directory, { recursive: true, mode: 0o755 })
  const staging = mkdtempSync(join(directory, ".hapsland-native-build-"))
  const stagedOutput = join(staging, "artifact")
  try {
    build(stagedOutput)
    chmodSync(stagedOutput, 0o755)
    renameSync(stagedOutput, output)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export const copyNativeArtifact = (source, output) =>
  buildNativeArtifact(output, (stagedOutput) => copyFileSync(source, stagedOutput))

/** Reject foreign dependency builds before publishing into a maintained target directory. */
export const selectNativeArtifact = (candidates, profile) =>
  candidates.find((path) => {
    let bytes
    try {
      bytes = readFileSync(path)
    } catch {
      return false
    }
    const magic = bytes.subarray(0, 4).toString("hex")
    if (profile === "linux-arm64") return bytes.length >= 20 && magic === "7f454c46" && bytes.readUInt16LE(18) === 183
    if (profile === "darwin-arm64")
      return (
        bytes.length >= 8 &&
        ["cffaedfe", "feedfacf"].includes(magic) &&
        (magic === "cffaedfe" ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4)) === 0x0100000c
      )
    return false
  })
