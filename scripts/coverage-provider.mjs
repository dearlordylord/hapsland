import { compiledCoverageSource } from "./test-harness/coverage-source.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { performance } from "node:perf_hooks"
import { pathToFileURL, fileURLToPath } from "node:url"
import { join, resolve, relative } from "node:path"
import { mergeScriptCovs } from "@bcoe/v8-coverage"
import v8 from "@vitest/coverage-v8"
import { V8CoverageProvider } from "@vitest/coverage-v8/dist/provider.js"
import {
  configureNativeBindings,
  sourceNativeParserRoot
} from "../packages/source-analysis/src/direct-event/languages/native-bindings.ts"
import { prepareBunCoveragePreload } from "./test-harness/bun-coverage-preload-build.mjs"

export { compiledCoverageSource } from "./test-harness/coverage-source.mjs"

configureNativeBindings(sourceNativeParserRoot(resolve(import.meta.dirname, "..")))
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

const executableStatementKinds = new Set([
  "break_statement",
  "continue_statement",
  "debugger_statement",
  "do_statement",
  "expression_statement",
  "for_in_statement",
  "for_statement",
  "if_statement",
  "labeled_statement",
  "lexical_declaration",
  "return_statement",
  "switch_statement",
  "throw_statement",
  "try_statement",
  "variable_declaration",
  "while_statement"
])

function sourceRangeKey(range) {
  return `${range.start.line}:${range.start.column}:${range.end.line}:${range.end.column}`
}

// Source maps describe a declaration differently in native Node and Vite.
// Bind both descriptions to the same original function body before combining
// function counters. Distinct bodies remain separate; unmatched entries remain
// untouched so the strict analyzer can still reject ambiguous evidence.
function getSourceMetadata(filename, source, sourceBytes, cache) {
  const cached = cache.get(filename)
  if (cached?.sourceBytes.equals(sourceBytes)) return cached.metadata

  const parser = new Parser()
  parser.setLanguage(filename.endsWith(".tsx") ? TypeScript.tsx : TypeScript.typescript)
  const tree = parser.parse(source)
  const bodies = new Map()
  const declarations = new Map()
  const signatures = []
  const sourceFunctions = new Map()
  const expressionFunctionBodies = new Map()
  for (const node of tree.rootNode.descendantsOfType([...functionKinds])) {
    const body = node.childForFieldName("body")
    if (!body) continue
    const bodyIdentity = `${body.startIndex}:${body.endIndex}`
    sourceFunctions.set(bodyIdentity, node)
    if (body.type !== "statement_block") {
      const range = {
        start: { line: body.startPosition.row + 1, column: body.startPosition.column },
        end: { line: body.endPosition.row + 1, column: body.endPosition.column }
      }
      const matches = expressionFunctionBodies.get(sourceRangeKey(range)) ?? new Set()
      matches.add(bodyIdentity)
      expressionFunctionBodies.set(sourceRangeKey(range), matches)
    }
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
  // Keep the tree alive because cached metadata contains nodes owned by it.
  const metadata = {
    tree,
    bodies,
    declarations,
    signatures,
    sourceFunctions,
    expressionFunctionBodies,
    statementRanges: new Map(),
    executableStatementRanges: new Map(),
    statementExpressionRanges: new Map()
  }
  const pendingNodes = [tree.rootNode]
  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop()
    const key = `${node.startPosition.row + 1}:${node.startPosition.column}:${node.endPosition.row + 1}`
    const ends = metadata.statementRanges.get(key) ?? new Set()
    ends.add(node.endPosition.column)
    metadata.statementRanges.set(key, ends)
    const expression =
      node.type === "variable_declarator"
        ? node.childForFieldName("value")
        : node.type === "expression_statement" || node.type === "return_statement" || node.type === "throw_statement"
          ? node.namedChildren[0]
          : undefined
    if (expression && !functionKinds.has(expression.type)) {
      const expressionKey = `${expression.startPosition.row + 1}:${expression.startPosition.column}:${expression.endPosition.row + 1}`
      const expressionEnds = metadata.statementExpressionRanges.get(expressionKey) ?? new Set()
      expressionEnds.add(expression.endPosition.column)
      metadata.statementExpressionRanges.set(expressionKey, expressionEnds)
    }
    if (executableStatementKinds.has(node.type)) {
      const endColumns = metadata.executableStatementRanges.get(key) ?? new Map()
      const candidates = endColumns.get(node.endPosition.column) ?? new Set()
      candidates.add(`${node.type}:${node.startIndex}:${node.endIndex}`)
      endColumns.set(node.endPosition.column, candidates)
      metadata.executableStatementRanges.set(key, endColumns)
    }
    pendingNodes.push(...node.namedChildren)
  }
  cache.set(filename, { sourceBytes, metadata })
  return metadata
}

export async function mergeSourceFunctions(coverageMap, sourceMetadataCache = new Map()) {
  for (const filename of coverageMap.files()) {
    // Read on every call so a same-path source edit invalidates this run's cache.
    const sourceBytes = await readFile(filename)
    const source = sourceBytes.toString("utf8")
    const {
      bodies,
      declarations,
      signatures,
      sourceFunctions,
      expressionFunctionBodies,
      statementRanges,
      executableStatementRanges,
      statementExpressionRanges
    } = getSourceMetadata(filename, source, sourceBytes, sourceMetadataCache)
    const data = coverageMap.fileCoverageFor(filename).data
    const fnMap = {}
    const counts = {}
    const identities = new Map()
    const observedExpressionBodies = new Set()
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
      const bodyIdentity = body && `${body.startIndex}:${body.endIndex}`
      const sourceFunction = bodyIdentity && sourceFunctions.get(bodyIdentity)
      if (body && sourceFunction && body.type !== "statement_block" && data.f[id] > 0) {
        observedExpressionBodies.add(bodyIdentity)
      }
      const identity = bodyIdentity ?? `unmatched:${id}`
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

    // A remapped V8 range can retain its end line but lose its end column.
    // Resolve it from a unique executable statement node, or from an exact
    // expression-bodied function whose own counter hit in this context. A
    // generic expression still needs an independent precise hit here: its
    // partial extent may enclose a subexpression that did not execute.
    const preciseStatementHits = new Set(
      Object.entries(data.statementMap)
        .filter(([id, entry]) => Number.isInteger(entry.end.column) && data.s[id] > 0)
        .map(([, entry]) => JSON.stringify(entry))
    )
    const statementMap = {}
    const statementCounts = {}
    const statementIdentities = new Map()
    for (const [id, entry] of Object.entries(data.statementMap)) {
      const key = `${entry.start.line}:${entry.start.column}:${entry.end.line}`
      const ends = statementRanges.get(key)
      const expressionEnds = statementExpressionRanges.get(key)
      const corroboratedExpression =
        expressionEnds?.size === 1 ? { ...entry, end: { ...entry.end, column: [...expressionEnds][0] } } : undefined
      const candidate =
        entry.end.column === null || entry.end.column === Infinity
          ? ends?.size === 1
            ? { ...entry, end: { ...entry.end, column: [...ends][0] } }
            : corroboratedExpression &&
                (data.s[id] === 0 || preciseStatementHits.has(JSON.stringify(corroboratedExpression)))
              ? corroboratedExpression
              : undefined
          : undefined
      const executableCandidates = candidate && executableStatementRanges.get(key)?.get(candidate.end.column)
      const expressionBodies = candidate && expressionFunctionBodies.get(sourceRangeKey(candidate))
      const exactExpressionBodyWasObserved =
        expressionBodies?.size === 1 && observedExpressionBodies.has([...expressionBodies][0])
      const uniqueExecutableStatement = executableCandidates?.size === 1
      // Istanbul treats Infinity as a containing source extent and can add
      // its hits to an unrelated precise zero counter during context merge.
      // An unresolved source-map end is unknown, never container evidence.
      const unresolved = entry.end.column === Infinity ? { ...entry, end: { ...entry.end, column: null } } : entry
      const normalized =
        candidate &&
        (data.s[id] === 0 ||
          preciseStatementHits.has(JSON.stringify(candidate)) ||
          uniqueExecutableStatement ||
          exactExpressionBodyWasObserved)
          ? candidate
          : unresolved
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
export async function mergeBunCoverage(coverageMap, directory, root, sourceMetadataCache = new Map()) {
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
  const filenames = new Set()
  let records = 0
  for (const name of (
    await readdir(directory).catch((error) => {
      if (error.code === "ENOENT") return []
      throw error
    })
  ).filter((name) => name.endsWith(".json"))) {
    records++
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
    await mergeSourceFunctions(isolated, sourceMetadataCache)
    for (const filename of isolated.files()) filenames.add(filename)
    coverageMap.merge(isolated)
  }
  return { records, files: filenames.size }
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
    const sourceMetadataCache = new Map()
    const v8Started = performance.now()
    const v8Files = new Set()
    let v8Contexts = 0
    let v8ContextFiles = 0
    await this.readCoverageFiles({
      onFileRead(coverage) {
        mergeCoverageScripts(scripts, coverage)
      },
      onFinished: async (project, environment) => {
        // Normalize duplicate source-map descriptions within each execution
        // context before Istanbul adds counts from separate contexts.
        const scriptCoverages = [...scripts.values()]
        for (const chunk of this.toSlices(scriptCoverages, this.options.processingConcurrency)) {
          const contextMaps = await Promise.all(
            chunk.map(async (script) => {
              const contextMap = await this.convertCoverage({ result: [script] }, project, environment)
              await mergeSourceFunctions(contextMap, sourceMetadataCache)
              return contextMap
            })
          )
          for (const contextMap of contextMaps) {
            v8Contexts++
            const files = contextMap.files()
            v8ContextFiles += files.length
            for (const filename of files) v8Files.add(filename)
            coverageMap.merge(contextMap)
          }
        }
        scripts.clear()
      },
      onDebug() {}
    })
    this.ctx.logger.log(
      `[coverage] v8 contexts=${v8Contexts} files=${v8Files.size} context-files=${v8ContextFiles} elapsed=${Math.round(performance.now() - v8Started)}ms`
    )
    const bunStarted = performance.now()
    const bun = await mergeBunCoverage(
      coverageMap,
      this.bunCoverageDirectory,
      this.ctx.config.root,
      sourceMetadataCache
    )
    this.ctx.logger.log(
      `[coverage] bun records=${bun.records} files=${bun.files} elapsed=${Math.round(performance.now() - bunStarted)}ms`
    )
    let uncoveredFiles = 0
    let uncoveredElapsed = 0
    if (this.options.include != null && (allTestsRun || !this.options.cleanOnRerun)) {
      const uncoveredStarted = performance.now()
      const uncoveredMap = await this.getCoverageMapForUncoveredFiles(coverageMap.files())
      await mergeSourceFunctions(uncoveredMap, sourceMetadataCache)
      coverageMap.merge(uncoveredMap)
      uncoveredFiles = uncoveredMap.files().length
      uncoveredElapsed = Math.round(performance.now() - uncoveredStarted)
    }
    this.ctx.logger.log(`[coverage] uncovered files=${uncoveredFiles} elapsed=${uncoveredElapsed}ms`)
    // Emitted files are admitted only for conversion; the report retains the
    // configured authored-source selection, never the broadened capture input.
    coverageMap.filter((filename) => existsSync(filename) && super.isIncluded(filename))
    return coverageMap
  }
}

export default { ...v8, getProvider: () => new ContextAwareV8CoverageProvider() }
