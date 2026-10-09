import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "@babel/parser"
import { readPackageGraph, resolveDevelopmentWorkspaceSource } from "../package-graph.mjs"
import { isOptionalDevelopmentTest } from "./test-scope.mjs"
import { boundedScenarioFiles, timeoutForKind } from "./policy.mjs"

const processModules = new Set(["node:child_process", "child_process", "node:worker_threads", "worker_threads"])
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs", ".js"])
const importsOf = (file, sourceOnly = false) => {
  const ast = parse(readFileSync(file, "utf8"), {
    sourceType: "unambiguous",
    plugins: [
      ["typescript", { dts: /\.d\.[cm]?ts$/.test(file) }],
      "importAttributes",
      ...(file.endsWith(".tsx") ? ["jsx"] : [])
    ]
  })
  const modules = []
  const pending = [ast]
  while (pending.length) {
    const node = pending.pop()
    if (!node || typeof node !== "object") continue
    if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)) {
      const kind = node.importKind ?? node.exportKind
      const specifiers = node.specifiers ?? []
      if (
        kind !== "type" &&
        !(specifiers.length && specifiers.every((value) => (value.importKind ?? value.exportKind) === "type")) &&
        node.source
      )
        modules.push(node.source.value)
    } else if (node.type === "CallExpression" && (node.callee?.type === "Import" || node.callee?.name === "require")) {
      const argument = node.arguments?.[0]
      if (sourceOnly) modules.push(undefined)
      else if (argument?.type === "StringLiteral") modules.push(argument.value)
    } else if (
      sourceOnly &&
      node.type === "Identifier" &&
      ["require", "module", "process", "global", "globalThis", "eval", "Function"].includes(node.name)
    ) {
      modules.push(undefined)
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "comments", "tokens"].includes(key)) continue
      if (Array.isArray(value)) pending.push(...value)
      else if (value && typeof value === "object") pending.push(value)
    }
  }
  return modules
}

/** Recognize native Node tests from their parsed import graph, not filename alone. */
export const isNodeTestModule = (file) => importsOf(file).includes("node:test")

const localModule = (root, file, specifier) => {
  if (!specifier.startsWith(".")) {
    const manifestPath = resolve(root, "package.json")
    if (!existsSync(manifestPath) || !JSON.parse(readFileSync(manifestPath, "utf8")).workspaces) return undefined
    return resolveDevelopmentWorkspaceSource(readPackageGraph(root), specifier)
  }
  const target = resolve(dirname(file), specifier)
  const candidates = [
    target,
    ...[".ts", ".tsx", ".mts", ".mjs", ".js"].map((extension) => target + extension),
    resolve(target, "index.ts")
  ]
  if (target.endsWith(".js")) candidates.push(target.slice(0, -3) + ".ts")
  return candidates.find(
    (candidate) => sourceExtensions.has(extname(candidate)) && existsSync(candidate) && statSync(candidate).isFile()
  )
}

const sourceOnlyBuiltins = new Set(["node:test", "node:assert", "node:assert/strict"])

/** Recognize the source-only .mjs convention; every other selection prepares
 * workspaces. This is a bounded import check, not general JS loader analysis. */
export const workspaceCompilationReason = (root, selectedFiles) => {
  let current = selectedFiles[0] ?? "."
  try {
    const canonicalRoot = realpathSync(root),
      pending = selectedFiles.map((file) => resolve(root, file)),
      seen = new Set()
    while (pending.length) {
      const requested = pending.pop()
      current = relative(root, requested)
      const file = realpathSync(requested),
        local = relative(canonicalRoot, file)
      const required = (reason) => ({ path: current, reason })
      if (local.startsWith("..") || local.split(/[\\/]/).includes("dist") || !file.endsWith(".mjs"))
        return required("Outside the source-only .mjs convention")
      if (seen.has(file)) continue
      seen.add(file)
      for (const specifier of importsOf(file, true)) {
        if (typeof specifier !== "string") return required("Dynamic loading or ambient globals")
        if (sourceOnlyBuiltins.has(specifier)) continue
        if (!specifier.startsWith(".") || !specifier.endsWith(".mjs"))
          return required(`Dependency outside explicit source-only ESM imports: ${specifier}`)
        pending.push(resolve(dirname(file), specifier))
      }
    }
    return null
  } catch {
    return { path: current, reason: "Unreadable module or unsupported syntax" }
  }
}

const testFiles = (root) => {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (/\.test\.(ts|mts)$/u.test(entry.name) && !isOptionalDevelopmentTest(relative(root, path)))
        files.push(path)
    }
  }
  for (const directory of ["src", "scripts"]) visit(resolve(root, directory))
  return files.sort()
}

/** Native Node tests written in TypeScript must stay out of Vitest discovery. */
export const nodeMtsTestFiles = (root) =>
  testFiles(root)
    .filter(
      (file) =>
        file.endsWith(".test.mts") &&
        relative(root, file).replaceAll("\\", "/").startsWith("scripts/") &&
        isNodeTestModule(file)
    )
    .map((file) => relative(root, file).replaceAll("\\", "/"))

/** Find package consumers through their actual local import closure. */
export const requiredTestArtifacts = (root, selectedFiles) => {
  const pending = selectedFiles.map((file) => resolve(root, file)),
    seen = new Set()
  while (pending.length) {
    const file = pending.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (relative(root, file).replaceAll("\\", "/") === "scripts/test-support/test-package.ts") return ["package"]
    for (const specifier of importsOf(file)) {
      const dependency = localModule(root, file, specifier)
      if (dependency) pending.push(dependency)
    }
  }
  return []
}

/** Conservative static inventory: a process-capable import is not proof that
 * every test in the file actually launches a child. Type-only imports do not count. */
export const inventoryTestHarness = (root, selectedFiles) => {
  const files =
    selectedFiles === undefined
      ? testFiles(root)
      : selectedFiles.map((file) => {
          if (typeof file !== "string") throw new Error("Focused inventory requires test file paths")
          const path = resolve(root, file)
          const local = relative(root, path)
          if (local === ".." || local.startsWith("../") || local.startsWith("..\\") || !statSync(path).isFile())
            throw new Error(`Invalid focused inventory file: ${file}`)
          return path
        })
  const cache = new Map()
  const dependencies = (file) => {
    if (!cache.has(file)) cache.set(file, importsOf(file))
    return cache.get(file)
  }
  return [...new Set(files)].sort().map((file) => {
    const path = relative(root, file).replaceAll("\\", "/")
    const pending = [file],
      seen = new Set()
    let evidence
    while (pending.length && evidence === undefined) {
      const current = pending.shift()
      if (seen.has(current)) continue
      seen.add(current)
      for (const specifier of dependencies(current)) {
        if (processModules.has(specifier)) {
          evidence = relative(root, current).replaceAll("\\", "/")
          break
        }
        const dependency = localModule(root, current, specifier)
        if (dependency !== undefined) pending.push(dependency)
      }
    }
    const scenario = boundedScenarioFiles.get(path)
    const kind = evidence !== undefined ? "process" : scenario !== undefined ? "bounded-scenario" : "unit"
    return {
      path,
      kind,
      timeoutMs: timeoutForKind(kind),
      ...(evidence === undefined ? {} : { processImportIn: evidence }),
      ...(scenario === undefined ? {} : { scenario })
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "../..")
  console.log(
    JSON.stringify(
      { policy: "test scheduling only; no product deadline changes", tests: inventoryTestHarness(root) },
      null,
      2
    )
  )
}
