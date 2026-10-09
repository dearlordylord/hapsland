import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, symlinkSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import provider, { compiledCoverageSource, mergeCoverageScripts, mergeSourceFunctions } from "./coverage-provider.mjs"
import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"

it("attributes a real emitted private-package function hit to its original TypeScript body", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-compiled-coverage-context-"))
  try {
    const directory = join(root, "packages/subject")
    mkdirSync(join(directory, "src"), { recursive: true })
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/subject"] }))
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        name: "@hapsland/subject",
        private: true,
        type: "module",
        exports: { ".": { types: "./dist/main.d.ts", default: "./dist/main.js" } }
      })
    )
    const source = join(directory, "src/main.ts")
    writeFileSync(
      source,
      'export function choose(flag: boolean) { return flag ? "yes" : "no" }\nexport function untouched() { return "never" }\n'
    )
    const compiler = await resolvePinnedTypeScript(join(import.meta.dirname))
    execFileSync(
      compiler.executable,
      [
        source,
        "--ignoreConfig",
        "--target",
        "es2022",
        "--module",
        "esnext",
        "--declaration",
        "--sourceMap",
        "--outDir",
        join(directory, "dist")
      ],
      { timeout: 10000 }
    )
    const emitted = join(directory, "dist/main.js")
    const code = `import {Session} from 'node:inspector';const s=new Session();s.connect();const post=(m,p={})=>new Promise((resolve,reject)=>s.post(m,p,(e,r)=>e?reject(e):resolve(r)));await post('Profiler.enable');await post('Profiler.startPreciseCoverage',{callCount:true,detailed:true});const mod=await import(${JSON.stringify(pathToFileURL(emitted).href)});if(mod.choose(true)!=='yes')throw new Error('behavior');const c=await post('Profiler.takePreciseCoverage');console.log(JSON.stringify(c.result.find(x=>x.url===${JSON.stringify(pathToFileURL(emitted).href)})));s.disconnect();`
    const script = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 10000 })
    )
    const instance = provider.getProvider()
    instance.ctx = { config: { root }, logger: console }
    instance.options = {}
    const sources = await instance.getSources(script.url, async () => null, script.functions)
    const coverage = instance.createCoverageMap()
    coverage.merge(await instance.remapCoverage(script.url, 0, sources, script.functions))
    await mergeSourceFunctions(coverage)
    const data = coverage.fileCoverageFor(source).data
    expect(Object.values(data.f).sort()).toEqual([0, 1])
    expect(coverage.files()).toEqual([source])
    const map = JSON.parse(readFileSync(`${emitted}.map`, "utf8"))
    writeFileSync(`${emitted}.map`, JSON.stringify({ ...map, sources: ["../../../foreign.ts"] }))
    expect(() => compiledCoverageSource(root, emitted)).toThrow(/escapes its authored owner/)
    writeFileSync(`${emitted}.map`, JSON.stringify({ ...map, sources: [...map.sources, ...map.sources] }))
    expect(() => compiledCoverageSource(root, emitted)).toThrow(/ambiguous ownership/)
    writeFileSync(`${emitted}.map`, JSON.stringify({ ...map, sourcesContent: ["// stale original"] }))
    expect(() => compiledCoverageSource(root, emitted)).toThrow(/stale source bytes/)
    writeFileSync(`${emitted}.map`, JSON.stringify({ ...map, version: 2 }))
    expect(() => compiledCoverageSource(root, emitted)).toThrow(/ambiguous ownership/)
    const copiedMap = join(directory, "retained-map.json")
    writeFileSync(copiedMap, JSON.stringify(map))
    rmSync(`${emitted}.map`)
    symlinkSync(copiedMap, `${emitted}.map`)
    expect(() => compiledCoverageSource(root, emitted)).toThrow(/source map is a symlink/)
    rmSync(`${emitted}.map`)
    expect(() => compiledCoverageSource(root, emitted)).toThrow(/no compiler source map/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("adds V8 counters only within compatible execution contexts", () => {
  const scripts = new Map()
  const script = (isExtendedContext: boolean, startOffset: number, count: number) => ({
    scriptId: "1",
    url: "file:///subject.ts",
    isExtendedContext,
    startOffset,
    functions: [{ functionName: "choose", isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: 100, count }] }]
  })
  mergeCoverageScripts(scripts, { result: [script(false, 0, 2), script(true, 0, 3), script(false, 5, 4)] })
  mergeCoverageScripts(scripts, { result: [script(false, 0, 1)] })
  expect(scripts.size).toBe(3)
  expect([...scripts.values()].map((value) => value.functions[0].ranges[0].count)).toEqual([3, 3, 4])
})

it("reuses source metadata across contexts and refreshes it when source bytes change", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-contexts-"))
  try {
    const filename = join(root, "subject.ts")
    const source =
      'export function choose(flag: boolean) {\n  return "😀";\n}\nconst sort = (a: string, b: string) => (a.length) - (b.length);\n'
    writeFileSync(filename, source)
    const position = (line: number, column: number) => ({ line, column })
    const entry = (name: string, line: number, column: number) => ({
      name,
      decl: { start: position(line, column), end: position(line, column + 1) },
      loc: { start: position(line, column), end: position(line, column + 1) },
      line
    })
    const callbackColumn = source.split("\n")[3]!.indexOf("(a.length)")
    const coverage = () => provider.getProvider().createCoverageMap()
    const worker = coverage()
    const sourceMetadataCache = new Map()
    worker.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: {
        "0": entry("choose", 1, source.indexOf("{")),
        "1": entry("sort", 4, callbackColumn),
        "2": entry("sort alias", 4, callbackColumn + 1)
      },
      f: { "0": 2, "1": 2, "2": 1 }
    })
    const native = coverage()
    native.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: { "0": entry("choose", 1, source.indexOf("function")), "1": entry("sort", 4, callbackColumn + 1) },
      f: { "0": 3, "1": 3 }
    })
    await mergeSourceFunctions(worker, sourceMetadataCache)
    expect(sourceMetadataCache.size).toBe(1)
    const cachedMetadata = sourceMetadataCache.get(filename)?.metadata
    expect(cachedMetadata).toBeDefined()
    await mergeSourceFunctions(native, sourceMetadataCache)
    expect(sourceMetadataCache.size).toBe(1)
    expect(sourceMetadataCache.get(filename)?.metadata).toBe(cachedMetadata)
    expect(Object.values(worker.fileCoverageFor(filename).data.f)).toEqual([2, 2])
    worker.merge(native)
    const result = worker.fileCoverageFor(filename).data
    expect(Object.keys(result.fnMap)).toHaveLength(2)
    expect(Object.values(result.f)).toEqual([5, 5])
    expect(result.fnMap["0"].loc.end).toEqual(position(3, 1))

    const changedSource = '/* moved */\nexport function choose(flag: boolean) {\n  return flag ? "new" : "old";\n}\n'
    writeFileSync(filename, changedSource)
    const refreshed = coverage()
    const functionLine = changedSource.split("\n")[1]!
    const bodyColumn = functionLine.indexOf("{")
    refreshed.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: { "0": entry("choose", 2, bodyColumn) },
      f: { "0": 7 }
    })
    await mergeSourceFunctions(refreshed, sourceMetadataCache)
    expect(sourceMetadataCache.size).toBe(1)
    expect(sourceMetadataCache.get(filename)?.metadata).not.toBe(cachedMetadata)
    expect(refreshed.fileCoverageFor(filename).data.fnMap["0"].loc.end).toEqual(position(4, 1))
    expect(refreshed.fileCoverageFor(filename).data.f).toEqual({ "0": 7 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it.each([false, true])("keeps multiline callbacks distinct for uncovered=%s source maps", async (uncovered) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-signatures-"))
  try {
    const filename = join(root, "subject.ts")
    const source = [
      "function* collect(composed = false) {",
      "  const items = [];",
      "  return items.filter(",
      "    ({ capability: item, content }) =>",
      "      (composed ? item.group : item.partition) && content.delivery,",
      "  ).filter(",
      "    notice =>",
      "      (composed ? notice.group : notice.partition) && notice.pending?.delivery,",
      "  );",
      "}",
      ""
    ].join("\n")
    writeFileSync(filename, source)
    const position = (line: number, column: number | null) => ({ line, column })
    const entry = (declLine: number, declColumn: number, bodyLine: number, bodyColumn: number, endLine: number) => ({
      name: "anonymous",
      decl: { start: position(declLine, declColumn), end: position(declLine, null) },
      loc: { start: position(bodyLine, bodyColumn), end: position(endLine, null) },
      line: bodyLine
    })
    const map = provider.getProvider().createCoverageMap()
    map.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: { "0": entry(1, 0, 1, source.indexOf("{"), 10), "1": entry(3, 21, 4, 25, 5), "2": entry(6, 10, 7, 10, 8) },
      f: { "0": uncovered ? 0 : 7, "1": uncovered ? 0 : 3, "2": uncovered ? 0 : 2 }
    })
    await mergeSourceFunctions(map)
    const result = map.fileCoverageFor(filename).data
    expect(Object.values(result.f)).toEqual(uncovered ? [0, 0, 0] : [7, 3, 2])
    expect(Object.keys(result.fnMap)).toHaveLength(3)
    expect(result.fnMap["0"].loc.end).toEqual(position(10, 1))
    expect(result.fnMap["1"].loc.start).toEqual(position(5, 6))
    expect(result.fnMap["1"].loc.end).toEqual(position(5, source.split("\n")[4]!.length - 1))
    expect(result.fnMap["2"].loc.start).toEqual(position(8, 6))
    expect(result.fnMap["2"].loc.end).toEqual(position(8, source.split("\n")[7]!.length - 1))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("preserves evidence when nested default callbacks have ambiguous signature ownership", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-ambiguous-signature-"))
  try {
    const filename = join(root, "subject.ts")
    const source = "function outer(run = () => 1) { return run(); }\n"
    writeFileSync(filename, source)
    const column = source.indexOf("=>")
    const loc = { start: { line: 1, column }, end: { line: 1, column: null } }
    const original = { name: "unresolved", decl: loc, loc, line: 1 }
    const map = provider.getProvider().createCoverageMap()
    map.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: { "0": original },
      f: { "0": 5 }
    })
    await mergeSourceFunctions(map)
    const result = map.fileCoverageFor(filename).data
    expect(result.fnMap["0"]).toEqual(original)
    expect(result.f).toEqual({ "0": 5 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("normalizes declaration ownership for a multiline factory returning an arrow", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-arrow-factory-"))
  try {
    const filename = join(root, "subject.ts")
    writeFileSync(
      filename,
      "export const factory =\n  (options = {}) =>\n  (api: unknown): void => {\n    void api\n  }\n"
    )
    const position = (line: number, column: number | null) => ({ line, column })
    const map = provider.getProvider().createCoverageMap()
    map.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: {
        "0": {
          name: "(anonymous_0)",
          decl: { start: position(1, 13), end: position(1, null) },
          loc: { start: position(3, 2), end: position(5, 3) },
          line: 2
        },
        "1": {
          name: "(anonymous_1)",
          decl: { start: position(2, 23), end: position(2, null) },
          loc: { start: position(3, 25), end: position(5, 3) },
          line: 3
        }
      },
      f: { "0": 3, "1": 2 }
    })
    await mergeSourceFunctions(map)
    const result = map.fileCoverageFor(filename).data
    expect(Object.keys(result.fnMap)).toHaveLength(2)
    expect(result.f).toEqual({ "0": 3, "1": 2 })
    expect(result.fnMap["0"].decl.start).toEqual(position(2, 2))
    expect(result.fnMap["1"].decl.start).toEqual(position(3, 2))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it.each([null, Infinity])(
  "attributes incomplete statement ends %s without hiding uncovered or ambiguous evidence",
  async (missingEnd) => {
    const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-statements-"))
    try {
      const filename = join(root, "subject.ts")
      writeFileSync(filename, "const choose = (flag: boolean) =>\n  flag &&\n  true;\nconst untouched = () => false;\n")
      const range = (line: number, column: number, endLine: number, endColumn: number | null) => ({
        start: { line, column },
        end: { line: endLine, column: endColumn }
      })
      const makeCoverage = (count: number) => {
        const map = provider.getProvider().createCoverageMap()
        map.addFileCoverage({
          path: filename,
          statementMap: {
            "0": range(2, 2, 3, 6),
            "1": range(2, 2, 3, missingEnd),
            "2": range(4, 24, 4, 29),
            "3": range(4, 24, 4, missingEnd),
            "4": range(4, 18, 4, missingEnd),
            "5": range(9, 0, 9, missingEnd)
          },
          s: { "0": count, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {}
        })
        return map
      }
      const worker = makeCoverage(2)
      const native = makeCoverage(3)
      await mergeSourceFunctions(worker)
      await mergeSourceFunctions(native)
      const data = worker.fileCoverageFor(filename).data
      expect(Object.values(data.statementMap)).toContainEqual(range(2, 2, 3, 6))
      expect(Object.values(data.s)).toEqual([2, 0, 0, 0])
      // The arrow and its parameter both start at column 18 on this line;
      // there is no unique authored end for this partial range.
      expect(Object.values(data.statementMap)).toContainEqual(range(4, 18, 4, null))
      expect(Object.values(data.statementMap)).toContainEqual(range(9, 0, 9, null))
      worker.merge(native)
      expect(Object.values(worker.fileCoverageFor(filename).data.s)).toEqual([5, 0, 0, 0])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)

it.each([null, Infinity])(
  "preserves precise uncovered statements against positive partial ends %s",
  async (missingEnd) => {
    const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-execution-extent-"))
    try {
      const filename = join(root, "subject.ts")
      writeFileSync(filename, "const choose = (flag: boolean) =>\n  flag &&\n  true;\n")
      const exact = { start: { line: 2, column: 2 }, end: { line: 3, column: 6 } }
      const partial = { ...exact, end: { line: 3, column: missingEnd } }
      const unresolved = { ...exact, end: { line: 3, column: null } }
      const coverage = (statements: Record<string, typeof exact | typeof partial>, counts: Record<string, number>) => {
        const map = provider.getProvider().createCoverageMap()
        map.addFileCoverage({
          path: filename,
          statementMap: statements,
          s: counts,
          fnMap: {},
          f: {},
          branchMap: {},
          b: {}
        })
        return map
      }
      const sameContext = coverage({ "0": exact, "1": partial }, { "0": 0, "1": 25 })
      await mergeSourceFunctions(sameContext)
      expect(Object.values(sameContext.fileCoverageFor(filename).data.s)).toEqual([0, 25])
      expect(Object.values(sameContext.fileCoverageFor(filename).data.statementMap)).toEqual([exact, unresolved])

      const impreciseContext = coverage({ "0": partial }, { "0": 25 })
      const preciseContext = coverage({ "0": exact }, { "0": 0 })
      await mergeSourceFunctions(impreciseContext)
      await mergeSourceFunctions(preciseContext)
      impreciseContext.merge(preciseContext)
      const merged = impreciseContext.fileCoverageFor(filename).data
      expect(Object.values(merged.s)).toEqual([25, 0])
      expect(Object.values(merged.statementMap)).toEqual([unresolved, exact])

      const corroborated = coverage({ "0": exact, "1": partial }, { "0": 2, "1": 25 })
      await mergeSourceFunctions(corroborated)
      expect(Object.values(corroborated.fileCoverageFor(filename).data.s)).toEqual([25])
      expect(Object.values(corroborated.fileCoverageFor(filename).data.statementMap)).toEqual([exact])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)

it("attributes positive partial ends to a unique executable statement", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-statement-provenance-"))
  try {
    const filename = join(root, "subject.ts")
    const source = "function choose(flag: boolean) {\n  if (flag) return true;\n  return false;\n}\n"
    writeFileSync(filename, source)
    const statementEnd = source.split("\n")[1]!.length
    const exact = { start: { line: 2, column: 2 }, end: { line: 2, column: statementEnd } }
    const partial = { ...exact, end: { ...exact.end, column: null } }
    const map = provider.getProvider().createCoverageMap()
    map.addFileCoverage({
      path: filename,
      statementMap: { "0": exact, "1": partial },
      s: { "0": 0, "1": 7 },
      fnMap: {},
      f: {},
      branchMap: {},
      b: {}
    })

    await mergeSourceFunctions(map)

    const result = map.fileCoverageFor(filename).data
    expect(Object.values(result.statementMap)).toEqual([exact])
    expect(Object.values(result.s)).toEqual([7])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("resolves zero expression roots but requires same-context evidence for positive partial ranges", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-expression-statement-provenance-"))
  try {
    const filename = join(root, "subject.ts")
    const source =
      "function choose(enabled: boolean, receiver: { run: () => boolean }) {\n  enabled && receiver.run()\n}\n"
    writeFileSync(filename, source)
    const statementLine = source.split("\n")[1]!
    const exact = { start: { line: 2, column: 2 }, end: { line: 2, column: statementLine.length } }
    const partial = { ...exact, end: { ...exact.end, column: null } }
    const partialSubexpression = {
      start: { line: 2, column: statementLine.indexOf("receiver") },
      end: { line: 2, column: null }
    }
    const functionEntry = {
      name: "choose",
      decl: { start: { line: 1, column: 0 }, end: { line: 1, column: source.split("\n")[0]!.length } },
      loc: { start: { line: 1, column: source.split("\n")[0]!.indexOf("{") }, end: { line: 3, column: 1 } },
      line: 1
    }
    const coverage = (
      statements: Record<string, typeof exact | typeof partial | typeof partialSubexpression>,
      counts: Record<string, number>,
      functionCount = 0
    ) => {
      const map = provider.getProvider().createCoverageMap()
      map.addFileCoverage({
        path: filename,
        statementMap: statements,
        s: counts,
        fnMap: { "0": functionEntry },
        f: { "0": functionCount },
        branchMap: {},
        b: {}
      })
      return map
    }

    const corroborated = coverage({ "0": exact, "1": partial }, { "0": 1, "1": 5 }, 1)
    await mergeSourceFunctions(corroborated)
    expect(Object.values(corroborated.fileCoverageFor(filename).data.statementMap)).toEqual([exact])
    expect(Object.values(corroborated.fileCoverageFor(filename).data.s)).toEqual([5])

    const partialOnly = coverage({ "0": partial }, { "0": 5 })
    await mergeSourceFunctions(partialOnly)
    expect(Object.values(partialOnly.fileCoverageFor(filename).data.statementMap)).toEqual([partial])

    const partialContext = coverage({ "0": partial }, { "0": 5 })
    const preciseContext = coverage({ "0": exact }, { "0": 1 })
    await mergeSourceFunctions(partialContext)
    await mergeSourceFunctions(preciseContext)
    partialContext.merge(preciseContext)
    const acrossContexts = partialContext.fileCoverageFor(filename).data
    expect(Object.values(acrossContexts.statementMap)).toEqual([partial, exact])
    expect(Object.values(acrossContexts.s)).toEqual([5, 1])

    const zeroRoot = coverage({ "0": partial }, { "0": 0 })
    const firstHit = coverage({ "0": exact }, { "0": 2 }, 2)
    const secondHit = coverage({ "0": exact }, { "0": 3 }, 3)
    await mergeSourceFunctions(zeroRoot)
    await mergeSourceFunctions(firstHit)
    await mergeSourceFunctions(secondHit)
    const unhit = zeroRoot.fileCoverageFor(filename).data
    expect(Object.values(unhit.statementMap)).toEqual([exact])
    expect(Object.values(unhit.s)).toEqual([0])
    expect(Object.values(unhit.f)).toEqual([0])
    zeroRoot.merge(firstHit)
    zeroRoot.merge(secondHit)
    const resolvedAcrossContexts = zeroRoot.fileCoverageFor(filename).data
    expect(Object.values(resolvedAcrossContexts.statementMap)).toEqual([exact])
    expect(Object.values(resolvedAcrossContexts.s)).toEqual([5])
    expect(Object.values(resolvedAcrossContexts.f)).toEqual([5])

    expect(partialSubexpression.start.column).toBeGreaterThan(exact.start.column)
    const shortCircuited = coverage({ "0": exact, "1": partialSubexpression }, { "0": 1, "1": 5 }, 1)
    await mergeSourceFunctions(shortCircuited)
    const subexpressionData = shortCircuited.fileCoverageFor(filename).data
    expect(Object.values(subexpressionData.statementMap)).toEqual([exact, partialSubexpression])
    expect(Object.values(subexpressionData.s)).toEqual([1, 5])
    expect(Object.values(subexpressionData.f)).toEqual([1])

    const initializerFile = join(root, "initializer.ts")
    const initializerSource = "const callback = () => work()\n"
    writeFileSync(initializerFile, initializerSource)
    const initializerStart = initializerSource.indexOf("() =>")
    const uninvokedInitializer = { start: { line: 1, column: initializerStart }, end: { line: 1, column: null } }
    const initializerCoverage = provider.getProvider().createCoverageMap()
    initializerCoverage.addFileCoverage({
      path: initializerFile,
      statementMap: { "0": uninvokedInitializer },
      s: { "0": 0 },
      fnMap: {
        "0": {
          name: "callback",
          decl: {
            start: { line: 1, column: initializerSource.indexOf("callback") },
            end: { line: 1, column: initializerSource.indexOf("callback") + "callback".length }
          },
          loc: {
            start: { line: 1, column: initializerSource.indexOf("work") },
            end: { line: 1, column: initializerSource.length - 1 }
          },
          line: 1
        }
      },
      f: { "0": 0 },
      branchMap: {},
      b: {}
    })
    await mergeSourceFunctions(initializerCoverage)
    const initializerData = initializerCoverage.fileCoverageFor(initializerFile).data
    expect(Object.values(initializerData.statementMap)).toEqual([uninvokedInitializer])
    expect(Object.values(initializerData.s)).toEqual([0])
    expect(Object.values(initializerData.f)).toEqual([0])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("uses an expression-body function hit only for the whole body range", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-expression-body-provenance-"))
  try {
    const filename = join(root, "subject.ts")
    const source = "const choose = (flag: boolean) =>\n  flag &&\n  true;\n"
    writeFileSync(filename, source)
    const range = (line: number, column: number, endLine: number, endColumn: number | null) => ({
      start: { line, column },
      end: { line: endLine, column: endColumn }
    })
    const wholeBody = range(2, 2, 3, 6)
    const wholeBodyPartial = range(2, 2, 3, null)
    const shortCircuitedLiteral = range(3, 2, 3, 6)
    const shortCircuitedLiteralPartial = range(3, 2, 3, null)
    const functionEntry = {
      name: "choose",
      decl: { start: { line: 1, column: 0 }, end: { line: 1, column: null } },
      loc: { start: { line: 2, column: 2 }, end: { line: 3, column: null } },
      line: 2
    }
    const coverage = (
      statements: Record<
        string,
        typeof wholeBody | typeof wholeBodyPartial | typeof shortCircuitedLiteral | typeof shortCircuitedLiteralPartial
      >,
      counts: Record<string, number>,
      functionCount: number
    ) => {
      const map = provider.getProvider().createCoverageMap()
      map.addFileCoverage({
        path: filename,
        statementMap: statements,
        s: counts,
        fnMap: { "0": functionEntry },
        f: { "0": functionCount },
        branchMap: {},
        b: {}
      })
      return map
    }

    const executedBody = coverage({ "0": wholeBody, "1": wholeBodyPartial }, { "0": 0, "1": 5 }, 1)
    await mergeSourceFunctions(executedBody)
    expect(Object.values(executedBody.fileCoverageFor(filename).data.statementMap)).toEqual([wholeBody])
    expect(Object.values(executedBody.fileCoverageFor(filename).data.s)).toEqual([5])

    const unexecutedBody = coverage({ "0": wholeBodyPartial }, { "0": 5 }, 0)
    await mergeSourceFunctions(unexecutedBody)
    expect(Object.values(unexecutedBody.fileCoverageFor(filename).data.statementMap)).toEqual([wholeBodyPartial])
    expect(Object.values(unexecutedBody.fileCoverageFor(filename).data.s)).toEqual([5])
    expect(Object.values(unexecutedBody.fileCoverageFor(filename).data.f)).toEqual([0])

    const partialSubexpression = coverage(
      { "0": shortCircuitedLiteral, "1": shortCircuitedLiteralPartial },
      { "0": 0, "1": 5 },
      1
    )
    await mergeSourceFunctions(partialSubexpression)
    const subexpressionResult = partialSubexpression.fileCoverageFor(filename).data
    expect(Object.values(subexpressionResult.statementMap)).toEqual([
      shortCircuitedLiteral,
      shortCircuitedLiteralPartial
    ])
    expect(Object.values(subexpressionResult.s)).toEqual([0, 5])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it("does not treat a positive function hit as evidence for an enclosing block", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-block-provenance-"))
  try {
    const filename = join(root, "subject.ts")
    const source = "function choose() {\n  return true;\n}\n"
    writeFileSync(filename, source)
    const bodyStart = source.split("\n")[0]!.indexOf("{")
    const partial = { start: { line: 1, column: bodyStart }, end: { line: 3, column: null } }
    const functionEntry = {
      name: "choose",
      decl: { start: { line: 1, column: 0 }, end: { line: 1, column: null } },
      loc: { start: { line: 1, column: bodyStart }, end: { line: 3, column: null } },
      line: 1
    }
    const map = provider.getProvider().createCoverageMap()
    map.addFileCoverage({
      path: filename,
      statementMap: { "0": partial },
      s: { "0": 4 },
      fnMap: { "0": functionEntry },
      f: { "0": 1 },
      branchMap: {},
      b: {}
    })

    await mergeSourceFunctions(map)

    const result = map.fileCoverageFor(filename).data
    expect(Object.values(result.statementMap)).toEqual([partial])
    expect(Object.values(result.s)).toEqual([4])
    expect(Object.values(result.f)).toEqual([1])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
