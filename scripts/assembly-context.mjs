import { realpathSync } from "node:fs"
import { fileEvidence } from "./compiler-evidence.mjs"
import { checkAssemblyPrerequisite, assemblySnapshotDigest } from "./assembly-prerequisites.mjs"

// The caller supplies the freshly globally validated component projection.
// No unrelated workspace manifests or source records enter an assembly key.
export const assemblyContext = async (root, target, runtime, snapshot) => {
  checkAssemblyPrerequisite(root, snapshot)
  if (target !== `bun-${snapshot.profile}`) throw new Error("Assembly target disagrees with component prerequisite")
  const executable = fileEvidence(root, realpathSync(runtime.executable))
  if (JSON.stringify(executable) !== JSON.stringify(snapshot.toolchain.bun))
    throw new Error("Assembly Bun executable differs from verified toolchain")
  return {
    target,
    version: runtime.version,
    executable,
    prerequisite: snapshot,
    prerequisiteDigest: assemblySnapshotDigest(snapshot),
    environment: Object.fromEntries(["NODE_OPTIONS", "BUN_OPTIONS"].map((key) => [key, process.env[key] ?? null]))
  }
}
