import { readFileSync, readdirSync } from "node:fs"
import { resolve, relative } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
const contained = (root, value) => {
  const path = resolve(root, value)
  if (relative(root, path).startsWith("..") || path === root) throw new Error("Release asset path escapes its owner")
  return path
}
const releaseAssetPlans = (root, graph) => {
  const destinations = new Set()
  const plans = []
  for (const owner of graph.packages.values())
    for (const asset of owner.manifest.hapsland?.releaseAssets ?? []) {
      if (
        !asset.source?.startsWith("dist/") ||
        typeof asset.destination !== "string" ||
        !asset.destination ||
        asset.destination.startsWith("/") ||
        asset.extension !== ".json"
      )
        throw new Error(`Unsupported release asset declaration: ${owner.manifest.name}`)
      const source = contained(owner.path, asset.source)
      const destination = contained(resolve(root, "dist"), asset.destination)
      if (
        [...destinations].some(
          (path) => path === destination || path.startsWith(destination + "/") || destination.startsWith(path + "/")
        )
      )
        throw new Error("Overlapping release asset destinations")
      destinations.add(destination)
      const entries = readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      if (!entries.length || entries.some((entry) => !entry.isFile() || !entry.name.endsWith(asset.extension)))
        throw new Error(`Incomplete release asset inventory: ${owner.manifest.name}`)
      const files = entries.map((entry) => {
        const path = resolve(source, entry.name),
          contents = readFileSync(path)
        JSON.parse(contents.toString("utf8"))
        return { name: entry.name, contents, evidence: fileEvidence(root, path) }
      })
      plans.push({ destination, files })
    }
  return plans
}
export const releaseAssetMappings = (root, graph) =>
  releaseAssetPlans(root, graph).flatMap((plan) =>
    plan.files.map((file) => ({
      ...file.evidence,
      publicPath: relative(root, resolve(plan.destination, file.name)).replaceAll("\\", "/")
    }))
  )
