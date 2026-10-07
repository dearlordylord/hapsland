import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { configureNativeBindings } from "../packages/source-analysis/src/direct-event/languages/native-bindings.ts"

// Pre-extraction evidence, not an isolation gate: only literal relative edges
// are resolved here. External resolution and unknown loaders remain explicit.
const root = resolve(import.meta.dirname, "..")
configureNativeBindings(resolve(root, "native/prebuilt", `${process.platform}-${process.arch}`))
const { default: Parser } = await import("tree-sitter")
const { default: TypeScript } = await import("tree-sitter-typescript")
const entries =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [
        "packages/cli-entry/src/cli.ts",
        "packages/pi-extension/src/pi/extension.ts",
        "packages/resident-entry/src/resident/main.ts",
        "packages/parser-entry/src/parser-main.ts",
        "packages/doctor-entry/src/package-doctor.ts"
      ]
const parser = new Parser()
parser.setLanguage(TypeScript.typescript)
const modules = new Map()
function visit(path) {
  if (modules.has(path)) return
  const source = readFileSync(resolve(root, path), "utf8")
  const tree = parser.parse(source)
  const edges = []
  const unknownLoaders = []
  const pending = [tree.rootNode]
  while (pending.length) {
    const node = pending.pop()
    pending.push(...node.namedChildren)
    let target
    let kind
    if (["import_statement", "export_statement"].includes(node.type)) {
      target = node.childForFieldName("source")
      kind = node.type
    } else if (node.type === "call_expression") {
      const fn = node.childForFieldName("function")
      if (!["import", "require"].includes(fn?.text)) continue
      const args = (node.childForFieldName("arguments")?.namedChildren ?? []).filter(
        (child) => child.type !== "comment"
      )
      target = args.length === 1 ? args[0] : undefined
      kind = fn.text
      if (target?.type !== "string") {
        unknownLoaders.push({ line: node.startPosition.row + 1, expression: node.text })
        continue
      }
    }
    if (target?.type !== "string") continue
    const specifier = target.text.slice(1, -1)
    edges.push({
      kind,
      specifier,
      line: node.startPosition.row + 1,
      ...(specifier.startsWith(".") ? { resolved: relative(root, resolve(root, dirname(path), specifier)) } : {})
    })
  }
  modules.set(path, {
    path,
    owner: path.split("/").slice(0, -1).join("/"),
    sha256: createHash("sha256").update(source).digest("hex"),
    parseError: tree.rootNode.hasError,
    edges,
    unknownLoaders
  })
  for (const edge of edges) if (edge.resolved?.endsWith(".ts")) visit(edge.resolved)
}
for (const entry of entries) visit(entry)
const closures = Object.fromEntries(
  entries.map((entry) => {
    const seen = new Set()
    const pending = [entry]
    while (pending.length) {
      const path = pending.pop()
      if (seen.has(path)) continue
      seen.add(path)
      for (const edge of modules.get(path)?.edges ?? []) if (modules.has(edge.resolved)) pending.push(edge.resolved)
    }
    return [entry, [...seen].sort()]
  })
)
process.stdout.write(
  `${JSON.stringify({ schemaVersion: 1, purpose: "Pre-extraction literal import and current folder-ownership inventory", limitations: ["Not a production isolation check", "External imports are recorded but not resolved", "Loader aliases and resolver branches require separate enforcement", "Type-only and lazy literal edges are included without claiming emitted contributions"], entries, closures, modules: [...modules.values()].sort((a, b) => a.path.localeCompare(b.path)) }, null, 2)}\n`
)
