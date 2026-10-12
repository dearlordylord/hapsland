import { parse } from "@babel/parser"
import { readFileSync, realpathSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { bendImportInputs } from "./bend-import-inputs.mjs"

const inside = (root, path) => {
  const local = relative(root, path)
  return local !== "" && !local.startsWith("../") && local !== ".."
}
export const hasBendPrecompile = (node) => node.manifest?.hapsland?.bendPrecompile !== undefined

/** The authored default-core declaration owns required runtime entry methods. */
export function bendPrecompileEntryMethods(source) {
  const body = parse(source, { sourceType: "module", plugins: ["typescript"] }).program.body
  const defaults = body.filter((node) => node.type === "ExportDefaultDeclaration")
  if (defaults.length !== 1 || defaults[0].declaration.type !== "Identifier")
    throw new Error("Bend precompile ABI requires one named default core")
  const name = defaults[0].declaration.name
  const declarations = body
    .flatMap((node) => (node.type === "VariableDeclaration" ? node.declarations : []))
    .filter((node) => node.id.type === "Identifier" && node.id.name === name)
  const type = declarations.length === 1 ? declarations[0].id.typeAnnotation?.typeAnnotation : undefined
  if (type?.type !== "TSTypeLiteral" || !type.members.length)
    throw new Error("Bend precompile ABI requires an explicit core method declaration")
  const methods = type.members.map((member) => {
    if (member.type !== "TSMethodSignature" || member.computed || member.optional || member.key.type !== "Identifier")
      throw new Error("Bend precompile ABI requires named required methods")
    return member.key.name
  })
  if (new Set(methods).size !== methods.length) throw new Error("Duplicate Bend precompile ABI method")
  return methods
}

/** Authored owner recipe, independent of stamps, compiler execution and outputs. */
export function readBendPrecompile(root, node) {
  if (!hasBendPrecompile(node)) return undefined
  const sourceRoot = resolve(node.path, "src")
  const name = node.manifest.hapsland.bendPrecompile
  if (node.compiler !== "typescript" || typeof name !== "string" || !/^src\/[\w/-]+\.json$/.test(name))
    throw new Error(`Invalid Bend precompile recipe owner: ${node.manifest.name}`)
  const recipe = resolve(node.path, name)
  if (!inside(sourceRoot, recipe) || realpathSync(recipe) !== recipe) throw new Error("Escaped Bend precompile recipe")
  const entries = JSON.parse(readFileSync(recipe, "utf8"))
  if (!Array.isArray(entries) || !entries.length) throw new Error("Empty Bend precompile recipe")
  const outputs = new Set()
  const artifacts = entries.map((entry) => {
    if (!entry || Object.keys(entry).sort().join(",") !== "declaration,output,source")
      throw new Error("Invalid Bend precompile artifact")
    const { source, output, declaration } = entry
    if (
      typeof source !== "string" ||
      !/^(?:[\w-]+\/)*[\w-]+\.bend$/.test(source) ||
      typeof output !== "string" ||
      !/^(?:[\w-]+\/)*[\w-]+-core\.js$/.test(output) ||
      declaration !== output.replace(/\.js$/, ".d.ts") ||
      dirname(source) !== dirname(output) ||
      outputs.has(output)
    )
      throw new Error("Invalid or duplicate Bend precompile output")
    outputs.add(output)
    const input = resolve(dirname(recipe), source)
    const abi = resolve(dirname(recipe), declaration)
    if (realpathSync(input) !== input || realpathSync(abi) !== abi)
      throw new Error("Escaped Bend precompile artifact source")
    const target = relative(sourceRoot, resolve(dirname(recipe), output)).replaceAll("\\", "/")
    if (
      Object.values(node.manifest.exports ?? {}).some(
        (value) => (typeof value === "string" ? value : value.default) === `./dist/${target}`
      )
    )
      throw new Error("Private Bend precompile artifact must not be a package export")
    return {
      source: input,
      declaration: abi,
      output: target,
      entryMethods: bendPrecompileEntryMethods(readFileSync(abi, "utf8"))
    }
  })
  return { recipe, artifacts }
}

export function bendPrecompileInputs(root, node, toolchain) {
  const recipe = readBendPrecompile(root, node)
  if (!recipe) return undefined
  if (!toolchain?.base?.path || !toolchain?.bend?.path) throw new Error("Missing Bend precompile toolchain")
  const closure = bendImportInputs(
    root,
    recipe.artifacts.map((artifact) => artifact.source),
    resolve(root, toolchain.base.path)
  )
  return {
    recipe: fileEvidence(root, recipe.recipe),
    artifacts: recipe.artifacts.map((artifact) => ({
      source: relative(root, artifact.source).replaceAll("\\", "/"),
      declaration: fileEvidence(root, artifact.declaration),
      output: artifact.output
    })),
    closure
  }
}
