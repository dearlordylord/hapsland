import { statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import { nativeTaskPlans } from "./native-task-inputs.mjs"
import { validateNativeBinary } from "./native-task-receipt.mjs"

export function verifyNativeRelease(root, graph, profiles = ["linux-arm64", "darwin-arm64"]) {
  if (!Array.isArray(profiles) || !profiles.length || new Set(profiles).size !== profiles.length)
    throw new Error("Invalid native release profiles")
  const verified = []
  for (const profile of profiles)
    for (const plan of nativeTaskPlans(root, graph, profile))
      for (const asset of plan.assets) {
        const path = resolve(root, asset.installedPath)
        const stat = statSync(path)
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o755)
          throw new Error(`Invalid release native artifact: ${asset.installedPath}`)
        validateNativeBinary(path, profile)
        verified.push(asset.installedPath)
      }
  return verified
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const profiles = process.env.HAPSLAND_BUILD_PROFILE
    ? [process.env.HAPSLAND_BUILD_PROFILE]
    : ["linux-arm64", "darwin-arm64"]
  const verified = verifyNativeRelease(root, readPackageGraph(root), profiles)
  process.stdout.write(`native release artifacts verified: ${profiles.join(", ")} (${verified.length} files)\n`)
}
