import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { typeScriptRoot, descendants } from "../../src/direct-event/languages/native-parser.ts"
import { isOptionalDevelopmentTest } from "./test-scope.mjs"
import { boundedScenarioFiles, timeoutForKind } from "./policy.mjs"

const processModules = new Set(["node:child_process", "child_process", "node:worker_threads", "worker_threads"])
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".mjs", ".js"])
const importsOf = (file) => {
  const tree = typeScriptRoot(file, readFileSync(file, "utf8"))
  const modules = []
  for (const node of descendants(tree)) {
    if (["import_statement", "export_statement"].includes(node.type)) {
      if (/^(import|export)\s+type\b/u.test(node.text)) continue
      const source = node.childForFieldName("source")
      const specifiers = descendants(node).filter((child) =>
        ["import_specifier", "export_specifier"].includes(child.type)
      )
      const clause = node.namedChildren.find((child) => child.type === "import_clause")
      if (
        specifiers.length &&
        specifiers.every((child) => /^type\s/u.test(child.text)) &&
        (node.type === "export_statement" || clause?.namedChildren.every((child) => child.type === "named_imports"))
      )
        continue
      if (source?.type === "string") modules.push(source.text.slice(1, -1))
    } else if (node.type === "call_expression" && node.childForFieldName("function")?.text === "import") {
      const argument = node.childForFieldName("arguments")?.namedChildren[0]
      if (argument?.type === "string") modules.push(argument.text.slice(1, -1))
    }
  }
  return modules
}

const localModule = (file, specifier) => {
  if (!specifier.startsWith(".")) return undefined
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

/** Find package consumers through their actual local import closure. */
export const requiredTestArtifacts = (root, selectedFiles) => {
  const pending = selectedFiles.map((file) => resolve(root, file)),
    seen = new Set()
  while (pending.length) {
    const file = pending.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (relative(root, file).replaceAll("\\", "/") === "src/test-support/test-package.ts") return ["package"]
    for (const specifier of importsOf(file)) {
      const dependency = localModule(file, specifier)
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
        const dependency = localModule(current, specifier)
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
