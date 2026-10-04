import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { mergeScriptCovs } from "@bcoe/v8-coverage"
import v8 from "@vitest/coverage-v8"
import { V8CoverageProvider } from "@vitest/coverage-v8/dist/provider.js"
import Parser from "tree-sitter"
import TypeScript from "tree-sitter-typescript"

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
    for (const node of tree.rootNode.descendantsOfType([...functionKinds])) {
      const body = node.childForFieldName("body")
      if (!body) continue
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
class ContextAwareV8CoverageProvider extends V8CoverageProvider {
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
    if (this.options.include != null && (allTestsRun || !this.options.cleanOnRerun)) {
      const uncoveredMap = await this.getCoverageMapForUncoveredFiles(coverageMap.files())
      await mergeSourceFunctions(uncoveredMap)
      coverageMap.merge(uncoveredMap)
    }
    coverageMap.filter(
      (filename) => existsSync(filename) && (!this.options.excludeAfterRemap || this.isIncluded(filename))
    )
    return coverageMap
  }
}

export default { ...v8, getProvider: () => new ContextAwareV8CoverageProvider() }
