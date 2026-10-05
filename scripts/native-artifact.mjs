import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs"
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
