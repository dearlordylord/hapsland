import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { runBuildProcess } from "./build-process.mjs"
// The supported native profile uses a fixed Make target and ordinary paths.
// Escaped or expanded filenames require a deliberate resolver extension.
export const nativeDependencyPaths = (text) => {
  const flattened = text.replace(/\\\r?\n/g, " ").trim()
  if (!flattened.startsWith("hapsland:") || /[\\$#]/.test(flattened))
    throw new Error("Unsupported native dependency output")
  const paths = flattened.slice("hapsland:".length).trim().split(/\s+/).filter(Boolean)
  if (!paths.length || paths.some((path) => path.includes(":"))) throw new Error("Incomplete native dependency output")
  return [...new Set(paths)].sort()
}
export async function nativeCompilerInputs(root, source, flags, env = process.env) {
  const result = await runBuildProcess("cc", ["-M", "-MT", "hapsland", ...flags, source], {
    cwd: root,
    env,
    stdio: "pipe",
    timeout: 30000
  })
  return nativeDependencyPaths(result.stdout).map((requested) => ({
    requested,
    ...fileEvidence(root, realpathSync(resolve(root, requested)))
  }))
}
