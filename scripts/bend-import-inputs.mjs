import { readFileSync, realpathSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
const evidence = (root, path) => ({ requested: path, ...fileEvidence(root, realpathSync(path)) })

/** Base and relative imports are the supported offline producer grammar. */
export function bendImportInputs(root, entries, base) {
  const visited = new Set()
  const visit = (path) => {
    const actual = realpathSync(path)
    if (visited.has(actual)) return
    visited.add(actual)
    if (!actual.endsWith(".bend")) return
    const text = readFileSync(actual, "utf8")
    for (const line of text.split(/\r?\n/)) {
      if (!/^\s*import\b/.test(line)) continue
      const foreign = line.match(/^\s*import\s+"(\.\.?\/[^"\s]+\.(?:c|js))"\s*(?:#.*)?$/)
      if (foreign) {
        visit(resolve(dirname(actual), foreign[1]))
        continue
      }
      const match = line.match(
        /^\s*import\s+(Base|\.\.?\/[^\s#]+\.bend)(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*(?:#.*)?$/
      )
      if (!match) throw new Error(`Unsupported Bend producer import: ${actual}: ${line}`)
      visit(match[1] === "Base" ? base : resolve(dirname(actual), match[1]))
    }
  }
  for (const entry of entries) visit(entry)
  return [...visited].sort().map((path) => evidence(root, path))
}
