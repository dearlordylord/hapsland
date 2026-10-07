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

it("merges source-map aliases by body, then adds counters across execution contexts", async () => {
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
    await mergeSourceFunctions(worker)
    await mergeSourceFunctions(native)
    expect(Object.values(worker.fileCoverageFor(filename).data.f)).toEqual([2, 2])
    worker.merge(native)
    const result = worker.fileCoverageFor(filename).data
    expect(Object.keys(result.fnMap)).toHaveLength(2)
    expect(Object.values(result.f)).toEqual([5, 5])
    expect(result.fnMap["0"].loc.end).toEqual(position(3, 1))
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
