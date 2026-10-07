import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import { architectureModuleModel, moduleArchitectureDocument } from "./module-architecture.mjs"

export const generateModuleArchitecture = (root, check = false) => {
  const path = resolve(root, "docs/architecture.md")
  const current = readFileSync(path, "utf8")
  const annotations = JSON.parse(readFileSync(resolve(root, "scripts/architecture-descriptions.json"), "utf8"))
  const next = moduleArchitectureDocument(current, architectureModuleModel(readPackageGraph(root), annotations))
  if (check) {
    if (next !== current) throw new Error("Module architecture is stale; run npm run docs:generate")
  } else if (next !== current) writeFileSync(path, next)
  return next
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((argument) => argument !== "--check"))
    throw new Error("Usage: generate-module-architecture.mjs [--check]")
  generateModuleArchitecture(resolve(import.meta.dirname, ".."), process.argv.includes("--check"))
}
