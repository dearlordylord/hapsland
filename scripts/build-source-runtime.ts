import { join, relative, dirname } from "node:path"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { createInstrumenter } from "istanbul-lib-instrument"
import type { BunPlugin } from "bun"
import { sourceRuntimeEntries } from "../src/runtime/source-runtime-layout.ts"
import { physicalNativeBindings } from "../src/runtime/native-bindings.ts"

const directory = process.argv[2]
if (!directory) throw new Error("Source runtime build requires an output directory")
const coverage = process.argv[3] ?? "none"
if (!["none", "istanbul"].includes(coverage)) throw new Error("Unknown source runtime coverage mode")
const sourceManifest: Record<string, string> = {}
const instrumenter = createInstrumenter({ esModules: true, parserPlugins: ["typescript"], compact: false })
const sourceCoverage: BunPlugin = {
  name: "hapsland-portable-source-coverage",
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, ({ path }) => {
      const local = relative(process.cwd(), path).replaceAll("\\", "/")
      if (!local.startsWith("src/") || local.endsWith(".test.ts") || local.endsWith(".d.ts")) return
      const source = readFileSync(path, "utf8"),
        logical = `/hapsland-source/${local}`
      sourceManifest[logical] = createHash("sha256").update(source).digest("hex")
      return { contents: instrumenter.instrumentSync(source, logical), loader: "ts", resolveDir: dirname(path) }
    })
  }
}
const nativeRoot =
  'require("node:path").resolve(require("node:path").dirname(process.argv[1]),"../../../native/prebuilt",process.platform+"-"+process.arch)'
for (const [role, entry] of Object.entries(sourceRuntimeEntries)) {
  const result = await Bun.build({
    entrypoints: [join(process.cwd(), entry)],
    outdir: directory,
    naming: `${role}.mjs`,
    target: "bun",
    format: "esm",
    minify: true,
    plugins: [physicalNativeBindings(nativeRoot), ...(coverage === "istanbul" ? [sourceCoverage] : [])]
  })
  if (!result.success) throw new Error(result.logs.map(String).join("\n"))
}
writeFileSync(join(directory, "source-manifest.json"), JSON.stringify(sourceManifest))
