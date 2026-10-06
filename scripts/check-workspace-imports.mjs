import { parse } from "@babel/parser"
import { readFileSync, readdirSync } from "node:fs"
import { isBuiltin } from "node:module"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageGraph, resolveWorkspaceSource } from "./package-graph.mjs"

export const checkWorkspaceImports = (root) => {
  const graph = readPackageGraph(root)
  let files = 0,
    edges = 0
  const owner = (path) => [...graph.packages.values()].find((node) => path.startsWith(`${resolve(node.path, "src")}/`))
  const inspect = (node, path) => {
    files++
    const ast = parse(readFileSync(path, "utf8"), {
      sourceType: "module",
      plugins: [["typescript", { dts: path.endsWith(".d.ts") }], "importAttributes"],
      errorRecovery: false
    })
    const edge = (specifier) => {
      edges++
      if (specifier.startsWith(".")) {
        const destination = resolve(dirname(path), specifier)
        if (owner(destination) !== node)
          throw new Error(`Import escapes source owner: ${relative(root, path)} -> ${specifier}`)
        return
      }
      if (isBuiltin(specifier) || specifier.startsWith("bun:")) return
      const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]
      if (name !== node.manifest.name && !Object.hasOwn(node.manifest.dependencies ?? {}, name))
        throw new Error(`Undeclared dependency: ${relative(root, path)} -> ${specifier}`)
      if (graph.packages.has(name)) resolveWorkspaceSource(graph, specifier)
    }
    const visit = (value) => {
      if (!value || typeof value !== "object") return
      if (Array.isArray(value)) {
        for (const child of value) visit(child)
        return
      }
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(value.type) && value.source)
        edge(value.source.value)
      if (value.type === "TSImportType" && value.argument?.type === "StringLiteral") edge(value.argument.value)
      if (
        value.type === "CallExpression" &&
        (value.callee?.type === "Import" || (value.callee?.type === "Identifier" && value.callee.name === "require"))
      ) {
        const argument = value.arguments[0]
        if (argument?.type === "StringLiteral") edge(argument.value)
        else if (!relative(root, path).endsWith("/direct-event/demo-validation.ts"))
          throw new Error(`Unsupported computed loader: ${relative(root, path)}`)
      }
      for (const [key, child] of Object.entries(value))
        if (!["loc", "start", "end", "comments", "tokens"].includes(key)) visit(child)
    }
    visit(ast)
  }
  const walk = (node, directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Source symlinks are unsupported: ${path}`)
      if (entry.isDirectory()) walk(node, path)
      else if (/\.(?:ts|js)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) inspect(node, path)
    }
  }
  for (const node of graph.packages.values()) walk(node, resolve(node.path, "src"))
  return { packages: graph.packages.size, files, edges }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(checkWorkspaceImports(resolve(import.meta.dirname, "..")))
