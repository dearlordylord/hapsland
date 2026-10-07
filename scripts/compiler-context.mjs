import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { authoredSourceContext } from "./authored-task-inputs.mjs"
export const readCompilerToolchain = (root) => {
  const toolchain = JSON.parse(readFileSync(resolve(root, ".test-runs/build-toolchain.json"), "utf8"))
  const verify = (value) => {
    if (!value || typeof value !== "object") return
    if (typeof value.path === "string" && typeof value.sha256 === "string") {
      const actual = fileEvidence(root, resolve(root, value.path))
      if (actual.sha256 !== value.sha256 || actual.mode !== value.mode)
        throw new Error(`Compiler toolchain identity changed: ${value.path}`)
      return
    }
    for (const child of Object.values(value)) verify(child)
  }
  verify(toolchain.node)
  verify(toolchain.typescript)
  return toolchain
}
const producerInputs = (root, node) => {
  const graph = readPackageGraph(root)
  const visited = new Set()
  const producers = []
  const visit = (name) => {
    if (visited.has(name)) return
    visited.add(name)
    const dependency = graph.packages.get(name)
    if (!dependency) throw new Error(`Missing compiler dependency: ${name}`)
    if (dependency.compiler === "bend")
      producers.push(fileEvidence(root, resolve(dependency.path, "dist/.bend-receipt.json")))
    for (const child of dependency.dependencies) visit(child)
  }
  for (const dependency of node.dependencies) visit(dependency)
  return producers.sort((a, b) => a.path.localeCompare(b.path))
}
// A synchronous verifier may supply its freshly byte-verified phase observation.
export const compilerContext = (root, node, toolchain = readCompilerToolchain(root)) => {
  const { source, configuration, dependencyVersions } = authoredSourceContext(root, node)
  return {
    toolchain: { node: toolchain.node, typescript: toolchain.typescript },
    configuration,
    source,
    dependencyVersions,
    producers: producerInputs(root, node)
  }
}
