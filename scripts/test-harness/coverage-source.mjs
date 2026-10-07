import { readPackageGraph } from "../package-graph.mjs"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { resolve, dirname, basename } from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "@babel/parser"

const moduleLiterals = (code) => {
  const literals = []
  const visit = (node) => {
    if (!node || typeof node !== "object") return
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type) &&
      node.source &&
      node.importKind !== "type" &&
      node.exportKind !== "type" &&
      !(
        node.specifiers?.length &&
        node.specifiers.every((specifier) => specifier.importKind === "type" || specifier.exportKind === "type")
      )
    )
      literals.push(node.source)
    if (
      node.type === "CallExpression" &&
      (node.callee.type === "Import" || (node.callee.type === "Identifier" && node.callee.name === "require")) &&
      node.arguments[0]?.type === "StringLiteral"
    )
      literals.push(node.arguments[0])
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === "object") visit(child)
  }
  visit(parse(code, { sourceType: "module", plugins: ["typescript"] }))
  return literals
}

/** Preserve the compiler-selected graph after original-source instrumentation. */
export function compilerCoverageImports(instrumented, original, emitted) {
  const before = new Set(moduleLiterals(original).map((node) => node.value))
  const after = new Set(moduleLiterals(emitted).map((node) => node.value))
  const edits = []
  for (const node of moduleLiterals(instrumented)) {
    if (!node.value.startsWith(".") || !/\.(ts|tsx|mts|cts)$/.test(node.value)) continue
    if (!before.has(node.value)) throw new Error("Coverage instrumentation introduced a module edge")
    const extension = node.value.endsWith(".mts") ? ".mjs" : node.value.endsWith(".cts") ? ".cjs" : ".js"
    const rewritten = node.value.replace(/\.(ts|tsx|mts|cts)$/, extension)
    const matches = [node.value, rewritten].filter((candidate) => after.has(candidate))
    if (matches.length !== 1) throw new Error("Coverage compiler import correspondence is ambiguous or missing")
    edits.push({ start: node.start, end: node.end, text: JSON.stringify(matches[0]) })
  }
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), instrumented)
}

/**
 * Admit emitted code through its physical TypeScript owner. Fresh compiler receipt
 * admission and the runner's frozen source identity establish byte provenance;
 * a source map alone is not a replacement for those guards.
 */
export function compiledCoverageSource(root, filename, graph) {
  if (!filename.startsWith(`${resolve(root, "packages")}/`) || !filename.endsWith(".js") || !existsSync(filename))
    return
  const owner = [...(graph ?? readPackageGraph(root)).packages.values()].find(
    (node) => node.compiler === "typescript" && filename.startsWith(`${resolve(node.path, "dist")}/`)
  )
  if (!owner) return
  if (realpathSync(filename) !== filename) throw new Error("Coverage emitted source is a symlink")
  const mapPath = `${filename}.map`
  if (!existsSync(mapPath)) throw new Error("Coverage emitted source has no compiler source map")
  if (realpathSync(mapPath) !== mapPath) throw new Error("Coverage compiler source map is a symlink")
  const map = JSON.parse(readFileSync(mapPath, "utf8"))
  if (
    map.version !== 3 ||
    map.file !== basename(filename) ||
    typeof map.mappings !== "string" ||
    !Array.isArray(map.sources) ||
    map.sources.length !== 1 ||
    typeof map.sources[0] !== "string"
  )
    throw new Error("Coverage compiler source map has ambiguous ownership")
  const source = resolve(dirname(filename), map.sourceRoot ?? "", map.sources[0])
  if (
    !source.startsWith(`${resolve(owner.path, "src")}/`) ||
    !source.endsWith(".ts") ||
    source.endsWith(".d.ts") ||
    !existsSync(source) ||
    realpathSync(source) !== source
  )
    throw new Error("Coverage compiler source map escapes its authored owner")
  const original = readFileSync(source, "utf8")
  if (map.sourcesContent?.[0] !== undefined && map.sourcesContent[0] !== original)
    throw new Error("Coverage compiler source map contains stale source bytes")
  return {
    source,
    code: readFileSync(filename, "utf8"),
    map: { ...map, sources: [pathToFileURL(source).href], sourceRoot: "", sourcesContent: [original] }
  }
}
