import { createHash } from "node:crypto"
import { dirname, posix } from "node:path"
import { hostModuleImports } from "./host-module-imports.mjs"

/** Prepare all bytes and validate the relocated graph before any publication. */
export function hostModulePlan(records, outputPath) {
  const destinations = new Map()
  const claimed = new Set()
  for (const record of records) {
    if (destinations.has(record.path)) throw new Error(`Duplicate host input: ${record.path}`)
    const destination = outputPath(record)
    if (
      typeof destination !== "string" ||
      !/^dist\/[a-zA-Z0-9_./-]+\.js$/.test(destination) ||
      destination.split("/").some((part) => part === ".." || part === "." || part === "")
    )
      throw new Error(`Invalid host output path: ${destination}`)
    if (claimed.has(destination)) throw new Error(`Host output collision: ${destination}`)
    destinations.set(record.path, destination)
    claimed.add(destination)
  }
  if (!records.length) throw new Error("Empty host module graph")
  return records
    .map((record) => {
      const path = destinations.get(record.path)
      let text = record.text
      const original = hostModuleImports(text, record.path)
      if (
        original.length !== record.imports.length ||
        original.some((edge, index) =>
          ["specifier", "start", "end", "kind", "builtin"].some((key) => edge[key] !== record.imports[index][key])
        )
      )
        throw new Error(`Host import evidence disagrees with bytes: ${record.path}`)
      for (const edge of [...record.imports].reverse()) {
        if (edge.builtin) continue
        const target = destinations.get(edge.target)
        if (!target) throw new Error(`Missing host output target: ${edge.target}`)
        let specifier = posix.relative(dirname(path), target)
        if (!specifier.startsWith(".")) specifier = "./" + specifier
        text = text.slice(0, edge.start) + JSON.stringify(specifier) + text.slice(edge.end)
      }
      const imports = hostModuleImports(text, path).map((edge) => {
        if (edge.builtin) return { kind: edge.kind, specifier: edge.specifier, builtin: true }
        if (!edge.specifier.startsWith("./") && !edge.specifier.startsWith("../"))
          throw new Error(`Published host import is not relative: ${path}`)
        const target = posix.normalize(posix.join(dirname(path), edge.specifier))
        if (!claimed.has(target)) throw new Error(`Published host target is missing: ${path}: ${target}`)
        return { kind: edge.kind, specifier: edge.specifier, target }
      })
      return {
        path,
        input: record.path,
        text,
        mode: record.mode,
        sha256: createHash("sha256").update(text).digest("hex"),
        imports
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}
