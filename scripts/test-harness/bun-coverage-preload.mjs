import { plugin } from "bun"
import { createHash, randomBytes } from "node:crypto"
import {
  readFileSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  lstatSync,
  unlinkSync
} from "node:fs"
import { resolve, relative, join, dirname } from "node:path"
import { readPackageGraph } from "../package-graph.mjs"
import { compiledCoverageSource, compilerCoverageImports } from "./coverage-source.mjs"

const directory = process.env.HAPSLAND_BUN_COVERAGE_DIRECTORY
const root = process.env.HAPSLAND_BUN_COVERAGE_ROOT
if (!directory || !root) throw new Error("Bun coverage requires an owned directory and source root")
const sourceRoot = realpathSync(resolve(root, "src"))
const packageManifest = existsSync(join(root, "package.json"))
  ? JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  : {}
const graph = packageManifest.workspaces ? readPackageGraph(root) : undefined
const sourceRoots = [sourceRoot, ...[...(graph?.packages.values() ?? [])].map((node) => resolve(node.path, "src"))]
const manifestPath = process.env.HAPSLAND_BUN_COVERAGE_MANIFEST
if (!manifestPath) {
  const { createInstrumenter } = await import("istanbul-lib-instrument")
  const instrumenterOptions = { esModules: true, parserPlugins: ["typescript"], compact: false }
  const instrumenter = createInstrumenter(instrumenterOptions)
  const instrumentedSourceCachePath = resolve(directory, "instrumented-source")
  mkdirSync(instrumentedSourceCachePath, { recursive: true })
  const instrumentedSourceCacheMetadata = lstatSync(instrumentedSourceCachePath)
  if (!instrumentedSourceCacheMetadata.isDirectory() || instrumentedSourceCacheMetadata.isSymbolicLink())
    throw new Error("Bun coverage instrumentation cache is not a regular directory")
  const instrumentedSourceCache = realpathSync(instrumentedSourceCachePath)
  const digest = (value) => createHash("sha256").update(value).digest("hex")
  const instrumentedSource = (filename, source, emittedCode) => {
    // This cache is scoped to one coverage run. The version fences changes to
    // instrumentation or compiler-edge rewriting; content digests and the
    // canonical owner path fence edits while child processes share the cache.
    const version = "hapsland-instrumented-source-v1"
    const key = digest(
      JSON.stringify({
        version,
        filename,
        source: digest(source),
        emitted: emittedCode === undefined ? null : digest(emittedCode),
        instrumenterOptions
      })
    )
    const cachePath = join(instrumentedSourceCache, `${key}.json`)
    const readCached = () => {
      let metadata
      try {
        metadata = lstatSync(cachePath)
      } catch (cause) {
        if (cause && typeof cause === "object" && cause.code === "ENOENT") return undefined
        throw cause
      }
      if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(cachePath) !== cachePath)
        throw new Error("Bun coverage instrumentation cache entry is not a regular file")
      const cached = JSON.parse(readFileSync(cachePath, "utf8"))
      if (
        cached.version !== version ||
        cached.key !== key ||
        typeof cached.contents !== "string" ||
        cached.contentDigest !== digest(cached.contents)
      )
        throw new Error("Bun coverage instrumentation cache entry is invalid")
      return cached.contents
    }
    const cached = readCached()
    if (cached !== undefined) return cached

    const instrumented = instrumenter.instrumentSync(source, filename)
    const contents =
      emittedCode === undefined ? instrumented : compilerCoverageImports(instrumented, source, emittedCode)
    const record = JSON.stringify({ version, key, contentDigest: digest(contents), contents })
    const temporary = `${cachePath}.${process.pid}-${randomBytes(8).toString("hex")}.tmp`
    writeFileSync(temporary, record, { flag: "wx", mode: 0o600 })
    try {
      renameSync(temporary, cachePath)
    } catch (cause) {
      let raced
      let cacheError
      try {
        raced = readCached()
      } catch (readCause) {
        cacheError = readCause
      }
      try {
        unlinkSync(temporary)
      } catch (cleanupCause) {
        if (cleanupCause?.code !== "ENOENT") throw cacheError ?? cleanupCause
      }
      if (cacheError) throw cacheError
      if (raced !== undefined) return raced
      throw cause
    }
    return contents
  }
  plugin({
    name: "hapsland-source-coverage",
    setup(build) {
      const instrumentSource = ({ path }) => {
        const emitted = graph && compiledCoverageSource(root, path, graph)
        if (emitted) {
          const original = readFileSync(emitted.source, "utf8")
          return { contents: instrumentedSource(emitted.source, original, emitted.code), loader: "ts" }
        }
        const canonical = realpathSync(path)
        const owned = sourceRoots.some((directory) => {
          const local = relative(directory, canonical)
          return local !== ".." && !local.startsWith("../")
        })
        if (!owned || path.endsWith(".test.ts") || path.endsWith(".d.ts"))
          return { contents: readFileSync(path, "utf8"), loader: "ts" }
        return { contents: instrumentedSource(canonical, readFileSync(path, "utf8")), loader: "ts" }
      }
      build.onLoad({ filter: /\.ts$/ }, instrumentSource)
      const emittedRoots = [...(graph?.packages.values() ?? [])]
        .filter((node) => node.compiler === "typescript")
        .map((node) => `${resolve(node.path, "dist")}/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      if (emittedRoots.length)
        build.onLoad({ filter: new RegExp(`^(?:${emittedRoots.join("|")}).*\\.js$`) }, instrumentSource)
    }
  })
}
mkdirSync(directory, { recursive: true })
const destination = join(directory, `${process.pid}-${randomBytes(8).toString("hex")}.json`)
let sourceManifest
const flush = () => {
  const coverage = globalThis.__coverage__
  if (!coverage) return
  const temporary = `${destination}.tmp`
  if (Object.keys(coverage).some((path) => path.startsWith("/hapsland-source/")) && !sourceManifest)
    sourceManifest = JSON.parse(readFileSync(manifestPath ?? join(dirname(Bun.main), "source-manifest.json"), "utf8"))
  writeFileSync(temporary, JSON.stringify({ root: resolve(root), coverage, sourceManifest }))
  renameSync(temporary, destination)
}
// A killed fixture may not emit exit; retain conservative counters while alive.
setInterval(flush, 100).unref()
process.on("exit", flush)
