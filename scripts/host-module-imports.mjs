import { parse } from "@babel/parser"
import traverseModule from "@babel/traverse"
const traverse = traverseModule.default ?? traverseModule
const builtins = new Set(["node:child_process", "node:crypto", "node:url", "node:path", "node:os", "node:fs"])

/** Supported host assets are static ESM; source ownership is checked separately. */
export function hostModuleImports(text, file) {
  const ast = parse(text, { sourceType: "module", createImportExpressions: true })
  const imports = []
  const reject = (kind) => {
    throw new Error(`Unsupported host module loader: ${file}: ${kind}`)
  }
  traverse(ast, {
    enter(path) {
      const node = path.node
      if (node.type === "ImportExpression") reject("dynamic import")
      if (node.type === "Identifier" && ["require", "module", "eval", "Function"].includes(node.name)) reject(node.name)
      if (["MemberExpression", "OptionalMemberExpression"].includes(node.type)) {
        const property = node.computed ? node.property.value : node.property.name
        if (["require", "module", "eval", "Function", "constructor"].includes(property)) reject(property)
      }
      if (!["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)) return
      if (!node.source) return
      if (node.attributes?.length || node.assertions?.length || node.phase) reject("import attributes or phase")
      if (node.source.type !== "StringLiteral") reject("nonliteral specifier")
      const specifier = node.source.value
      if (specifier.startsWith("node:") && !builtins.has(specifier)) reject(specifier)
      imports.push({
        specifier,
        start: node.source.start,
        end: node.source.end,
        kind: node.type,
        builtin: builtins.has(specifier)
      })
    }
  })
  return imports.sort((a, b) => a.start - b.start)
}
