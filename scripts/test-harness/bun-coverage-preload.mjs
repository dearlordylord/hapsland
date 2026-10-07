import { plugin } from "bun"
import { readFileSync, realpathSync, mkdirSync, writeFileSync, renameSync } from "node:fs"
import { resolve, relative, join, dirname } from "node:path"
import { randomBytes } from "node:crypto"

const directory = process.env.HAPSLAND_BUN_COVERAGE_DIRECTORY
const root = process.env.HAPSLAND_BUN_COVERAGE_ROOT
if (!directory || !root) throw new Error("Bun coverage requires an owned directory and source root")
const sourceRoot = realpathSync(resolve(root, "src"))
const manifestPath = process.env.HAPSLAND_BUN_COVERAGE_MANIFEST
if (!manifestPath) {
  const { createInstrumenter } = await import("istanbul-lib-instrument")
  const instrumenter = createInstrumenter({ esModules: true, parserPlugins: ["typescript"], compact: false })
  plugin({
    name: "hapsland-source-coverage",
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, ({ path }) => {
        const local = relative(sourceRoot, realpathSync(path))
        if (local.startsWith("..") || local.endsWith(".test.ts") || local.endsWith(".d.ts"))
          return { contents: readFileSync(path, "utf8"), loader: "ts" }
        return {
          contents: instrumenter.instrumentSync(readFileSync(path, "utf8"), resolve(root, "src", local)),
          loader: "ts"
        }
      })
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
