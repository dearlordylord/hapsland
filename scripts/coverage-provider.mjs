import { compiledCoverageSource } from "./test-harness/coverage-source.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, resolve, relative } from "node:path"
import { mergeScriptCovs } from "@bcoe/v8-coverage"
import v8 from "@vitest/coverage-v8"
import { V8CoverageProvider } from "@vitest/coverage-v8/dist/provider.js"
import { configureNativeBindings } from "../packages/source-analysis/src/direct-event/languages/native-bindings.ts"
import { packageAssetPath } from "@hapsland/runtime-environment/runtime/package-runtime"
import { prepareBunCoveragePreload } from "./test-harness/bun-coverage-preload-build.mjs"

export { compiledCoverageSource } from "./test-harness/coverage-source.mjs"

configureNativeBindings(packageAssetPath("native", "prebuilt", `${process.platform}-${process.arch}`))
const { default: Parser } = await import("tree-sitter")
const { default: TypeScript } = await import("tree-sitter-typescript")

const functionKinds = new Set([
  "arrow_function",
  "function_expression",
  "function_declaration",
  "generator_function",
  "generator_function_declaration",
  "method_definition"
])

// Source maps describe a declaration differently in native Node and Vite.
// Bind both descriptions to the same original function body before combining
// function counters. Distinct bodies remain separate; unmatched entries remain
// untouched so the strict analyzer can still reject ambiguous evidence.
export async function mergeSourceFunctions(coverageMap) {
  for (const filename of coverageMap.files()) {
    const source = await readFile(filename, "utf8")
    const parser = new Parser()
    parser.setLanguage(filename.endsWith(".tsx") ? TypeScript.tsx : TypeScript.typescript)
    const tree = parser.parse(source)
    const bodies = new Map()
    const declarations = new Map()
    const signatures = []
    const sourceFunctions = new Map()
    for (const node of tree.rootNode.descendantsOfType([...functionKinds])) {
      const body = node.childForFieldName("body")
      if (!body) continue
      sourceFunctions.set(`${body.startIndex}:${body.endIndex}`, node)
      signatures.push({ start: node.startPosition, end: body.startPosition, body })
      const anchors = [node, node.childForFieldName("name")]
      const parameters = node.childForFieldName("parameters")
      if (parameters) anchors.push(parameters.namedChildren[0])
      if (node.parent?.type === "variable_declarator") {
        anchors.push(node.parent.childForFieldName("name"))
      }
      for (const anchor of anchors) {
        if (!anchor) continue
        const key = `${anchor.startPosition.row + 1}:${anchor.startPosition.column}`
        const matches = declarations.get(key) || []
        if (!matches.includes(body)) matches.push(body)
        declarations.set(key, matches)
      }
      let start = body
      do {
        // Native Node can omit a leading parenthesis or whitespace when
        // anchoring an expression. These positions belong to this AST body.
        let index = start.startIndex
        let row = start.startPosition.row
        let column = start.startPosition.column
        do {
          const key = `${row + 1}:${column}`
          const matches = bodies.get(key) || []
          if (!matches.includes(body)) matches.push(body)
          bodies.set(key, matches)
          if (!/[\s(]/.test(source[index] || "")) break
          if (source[index++] === "\n") {
            row++
            column = 0
          } else column++
        } while (index < start.endIndex)
        start = start.type === "parenthesized_expression" ? start.namedChildren[0] : undefined
      } while (start)
    }
    const data = coverageMap.fileCoverageFor(filename).data
    // A remapped V8 range can retain its end line but lose its end column.
    // Resolve that omission only when the authored AST identifies one exact
    // range. A positive partial range can describe an enclosing execution
    // extent, so it also needs an independent precise hit in this context.
    // Keep unsupported, ambiguous and unmatched ranges as separate evidence.
    const statementRanges = new Map()
    const pendingNodes = [tree.rootNode]
    while (pendingNodes.length > 0) {
      const node = pendingNodes.pop()
      const key = `${node.startPosition.row + 1}:${node.startPosition.column}:${node.endPosition.row + 1}`
      const ends = statementRanges.get(key) ?? new Set()
      ends.add(node.endPosition.column)
      statementRanges.set(key, ends)
      pendingNodes.push(...node.namedChildren)
    }
    const preciseStatementHits = new Set(
      Object.entries(data.statementMap)
        .filter(([id, entry]) => Number.isInteger(entry.end.column) && data.s[id] > 0)
        .map(([, entry]) => JSON.stringify(entry))
    )
    const statementMap = {}
    const statementCounts = {}
    const statementIdentities = new Map()
    for (const [id, entry] of Object.entries(data.statementMap)) {
      const ends = statementRanges.get(`${entry.start.line}:${entry.start.column}:${entry.end.line}`)
      const candidate =
        (entry.end.column === null || entry.end.column === Infinity) && ends?.size === 1
          ? { ...entry, end: { ...entry.end, column: [...ends][0] } }
          : undefined
      // Istanbul treats Infinity as a containing source extent and can add
      // its hits to an unrelated precise zero counter during context merge.
      // An unresolved source-map end is unknown, never container evidence.
      const unresolved = entry.end.column === Infinity ? { ...entry, end: { ...entry.end, column: null } } : entry
      const normalized =
        candidate && (data.s[id] === 0 || preciseStatementHits.has(JSON.stringify(candidate))) ? candidate : unresolved
      const identity = JSON.stringify(normalized)
      const prior = statementIdentities.get(identity)
      if (prior !== undefined) {
        statementCounts[prior] = Math.max(statementCounts[prior], data.s[id])
      } else {
        statementIdentities.set(identity, id)
        statementMap[id] = normalized
        statementCounts[id] = data.s[id]
      }
    }
    data.statementMap = statementMap
    data.s = statementCounts
    const fnMap = {}
    const counts = {}
    const identities = new Map()
    for (const [id, entry] of Object.entries(data.fnMap)) {
      const point = entry.loc.start
      const declaration = entry.decl.start
      const declarationEnd = entry.decl.end
      const candidates =
        bodies.get(`${point.line}:${point.column}`) ??
        declarations.get(`${declaration.line}:${declaration.column}`) ??
        declarations.get(`${declarationEnd.line}:${declarationEnd.column}`)
      // Vite may anchor a multiline callback inside its parameter list and
      // leave the mapped end column null. A unique signature still identifies
      // its exact AST body; enclosing function bodies are not signature matches.
      const signatureMatches =
        candidates === undefined && Number.isInteger(point.column)
          ? signatures
              .filter(({ start, end }) => {
                const row = point.line - 1
                const afterStart = row > start.row || (row === start.row && point.column >= start.column)
                const beforeBody = row < end.row || (row === end.row && point.column < end.column)
                return afterStart && beforeBody
              })
              .map(({ body }) => body)
          : candidates
      const body = signatureMatches?.length === 1 ? signatureMatches[0] : undefined
      const sourceFunction = body && sourceFunctions.get(`${body.startIndex}:${body.endIndex}`)
      const identity = body ? `${body.startIndex}:${body.endIndex}` : `unmatched:${id}`
      const prior = identities.get(identity)
      if (prior !== undefined) {
        counts[prior] = Math.max(counts[prior], data.f[id])
        continue
      }
      identities.set(identity, id)
      fnMap[id] = body
        ? {
            ...entry,
            decl: {
              start: { line: sourceFunction.startPosition.row + 1, column: sourceFunction.startPosition.column },
              end: { line: body.startPosition.row + 1, column: body.startPosition.column }
            },
            loc: {
              start: { line: body.startPosition.row + 1, column: body.startPosition.column },
              end: { line: body.endPosition.row + 1, column: body.endPosition.column }
            }
          }
        : entry
      counts[id] = data.f[id]
    }
    data.fnMap = fnMap
    data.f = counts
  }
}

export function mergeCoverageScripts(scripts, coverage) {
  for (const script of coverage.result) {
    const key = JSON.stringify([script.url, !!script.isExtendedContext, script.startOffset || 0])
    const previous = scripts.get(key)
    const merged = mergeScriptCovs(previous ? [previous, script] : [script])
    merged.startOffset = script.startOffset || 0
    merged.isExtendedContext = !!script.isExtendedContext
    scripts.set(key, merged)
  }
}

// Vitest 5.0.1 merges worker and native Node ranges by URL before remapping.
// Those contexts execute different transformed code, so their offsets cannot
// be merged. Preserve that distinction until both have Istanbul source ranges.
export async function mergeBunCoverage(coverageMap, directory, root) {
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8").catch((error) => {
      if (error.code === "ENOENT") return "{}"
      throw error
    })
  )
  const ownedRoots = [
    resolve(root, "src"),
    ...(manifest.workspaces
      ? [...readPackageGraph(root).packages.values()].map((node) => resolve(node.path, "src"))
      : [])
  ]
  for (const name of (
    await readdir(directory).catch((error) => {
      if (error.code === "ENOENT") return []
      throw error
    })
  ).filter((name) => name.endsWith(".json"))) {
    const record = JSON.parse(await readFile(join(directory, name), "utf8"))
    if (record.root !== resolve(root) || !record.coverage) throw new Error("Bun coverage provenance is invalid")
    const isolated = new V8CoverageProvider().createCoverageMap()
    for (const [path, data] of Object.entries(record.coverage)) {
      let filename = path
      if (path.startsWith("/hapsland-source/")) {
        filename = resolve(root, path.slice("/hapsland-source/".length))
      }
      const owned = ownedRoots.some((directory) => {
        const local = relative(directory, filename)
        return local !== ".." && !local.startsWith("../") && !local.startsWith("..\\")
      })
      if (!owned || data.path !== path || !path.endsWith(".ts") || path.endsWith(".test.ts") || path.endsWith(".d.ts"))
        throw new Error("Bun coverage contains a foreign source file")
      if (filename !== path) {
        const digest = record.sourceManifest?.[path]
        const source = await readFile(filename)
        if (!/^[a-f0-9]{64}$/.test(digest ?? "") || createHash("sha256").update(source).digest("hex") !== digest)
          throw new Error("Bun bundle coverage source digest differs from the owned source")
      }
      isolated.merge({ [filename]: { ...data, path: filename } })
    }
    // Normalize the original source function ranges before merging contexts.
    await mergeSourceFunctions(isolated)
    coverageMap.merge(isolated)
  }
}
class ContextAwareV8CoverageProvider extends V8CoverageProvider {
  isIncluded(filename) {
    if (super.isIncluded(filename)) return true
    const emitted = compiledCoverageSource(this.ctx.config.root, filename)
    return emitted ? super.isIncluded(emitted.source) : false
  }
  async getSources(url, onTransform, functions = [], isExtendedContext = false) {
    const emitted = url.startsWith("file:")
      ? compiledCoverageSource(this.ctx.config.root, fileURLToPath(url))
      : undefined
    if (!emitted) return super.getSources(url, onTransform, functions, isExtendedContext)
    return super.getSources(
      url,
      async (...args) => (await onTransform(...args)) ?? { code: emitted.code, map: emitted.map },
      functions,
      isExtendedContext
    )
  }
  initialize(ctx) {
    super.initialize(ctx)
    this.bunCoverageDirectory = join(this.coverageFilesDirectory, "bun")
    process.env.HAPSLAND_BUN_COVERAGE_DIRECTORY = this.bunCoverageDirectory
    process.env.HAPSLAND_BUN_COVERAGE_ROOT = ctx.config.root
    const preload = prepareBunCoveragePreload(
      join(ctx.config.root, ".test-runs", "coverage-preload", String(process.pid))
    )
    const flag = `--preload=${pathToFileURL(preload).href}`
    process.env.HAPSLAND_BUN_COVERAGE_PRELOAD_FLAG = flag
    const options = (process.env.BUN_OPTIONS ?? "").split(/\s+/).filter((option) => option && option !== flag)
    process.env.BUN_OPTIONS = [...options, flag].join(" ")
  }
  async generateCoverage({ allTestsRun }) {
    const coverageMap = this.createCoverageMap()
    const scripts = new Map()
    await this.readCoverageFiles({
      onFileRead(coverage) {
        mergeCoverageScripts(scripts, coverage)
      },
      onFinished: async (project, environment) => {
        // Normalize duplicate source-map descriptions within each execution
        // context before Istanbul adds counts from separate contexts.
        for (const script of scripts.values()) {
          const contextMap = await this.convertCoverage({ result: [script] }, project, environment)
          await mergeSourceFunctions(contextMap)
          coverageMap.merge(contextMap)
        }
        scripts.clear()
      },
      onDebug() {}
    })
    await mergeBunCoverage(coverageMap, this.bunCoverageDirectory, this.ctx.config.root)
    if (this.options.include != null && (allTestsRun || !this.options.cleanOnRerun)) {
      const uncoveredMap = await this.getCoverageMapForUncoveredFiles(coverageMap.files())
      await mergeSourceFunctions(uncoveredMap)
      coverageMap.merge(uncoveredMap)
    }
    // Emitted files are admitted only for conversion; the report retains the
    // configured authored-source selection, never the broadened capture input.
    coverageMap.filter((filename) => existsSync(filename) && super.isIncluded(filename))
    return coverageMap
  }
}

export default { ...v8, getProvider: () => new ContextAwareV8CoverageProvider() }
