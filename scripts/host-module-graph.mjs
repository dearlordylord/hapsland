import { readFileSync, realpathSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { hostModuleImports } from "./host-module-imports.mjs"

const inside = (directory, file) => file.startsWith(directory + "/")
export function hostModuleGraph(root, graph, entry) {
  const records = new Map()
  const ownerOf = (file) => {
    const actual = realpathSync(file)
    const owner = [...graph.packages.values()].find((owner) => inside(resolve(owner.path, "dist"), actual))
    if (!owner || actual !== resolve(file) || !actual.endsWith(".js"))
      throw new Error(`Unaccounted host emitted module: ${file}`)
    return owner
  }
  const visit = (file) => {
    file = resolve(file)
    if (records.has(file)) return
    const owner = ownerOf(file)
    const text = readFileSync(file, "utf8")
    const record = { ...fileEvidence(root, file), owner: owner.manifest.name, text, imports: [] }
    records.set(file, record)
    for (const edge of hostModuleImports(text, file)) {
      if (edge.builtin) {
        record.imports.push(edge)
        continue
      }
      let target
      if (edge.specifier.startsWith("./") || edge.specifier.startsWith("../")) {
        target = resolve(dirname(file), edge.specifier)
        if (ownerOf(target).manifest.name !== owner.manifest.name)
          throw new Error(`Host relative import crosses owner: ${file}: ${edge.specifier}`)
      } else {
        const match = /^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/.exec(edge.specifier)
        const dependency = match && graph.packages.get(match[1])
        if (!dependency || !owner.dependencies.includes(dependency.manifest.name))
          throw new Error(`Undeclared host dependency: ${file}: ${edge.specifier}`)
        const key = match[2] ? `.${match[2]}` : "."
        const exported = dependency.manifest.exports?.[key]?.default
        if (
          typeof exported !== "string" ||
          !/^\.\/dist\/[a-zA-Z0-9_./-]+\.js$/.test(exported) ||
          exported.includes("..")
        )
          throw new Error(`Unsupported host export: ${edge.specifier}`)
        target = resolve(dependency.path, exported)
        if (ownerOf(target).manifest.name !== dependency.manifest.name)
          throw new Error(`Host export escapes owner: ${edge.specifier}`)
      }
      record.imports.push({ ...edge, target: relative(root, target).replaceAll("\\", "/") })
      visit(target)
    }
  }
  visit(entry)
  return [...records.values()].sort((a, b) => a.path.localeCompare(b.path))
}
