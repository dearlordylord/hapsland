import { rmSync } from "node:fs"
import { physicalNativeBindings } from "@hapsland/runtime-environment/runtime/native-bindings"
const [entrypoint, target, outfile] = process.argv.slice(2)
if (!outfile) throw new Error("Standalone assembly requires an output path")
rmSync(outfile, { force: true })
if (!entrypoint?.endsWith(".js")) throw new Error("Standalone assembly requires an emitted JavaScript entrypoint")
const result = await Bun.build({
  entrypoints: [entrypoint],
  target: "bun",
  metafile: true,
  minify: true,
  bytecode: true,
  format: "esm",
  compile: {
    target,
    outfile,
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadTsconfig: false,
    autoloadPackageJson: false
  },
  plugins: [
    physicalNativeBindings(
      'require("node:path").resolve(require("node:path").dirname(process.execPath), "../../../native/prebuilt", process.platform + "-" + process.arch)'
    )
  ]
}).catch((error) => {
  rmSync(outfile, { force: true })
  throw error
})
if (!result.success) {
  rmSync(outfile, { force: true })
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

const inputs = Object.keys(result.metafile?.inputs ?? {})
if (inputs.length === 0 || inputs.some((path) => /\.(?:ts|tsx|mts|cts)$/.test(path))) {
  rmSync(outfile, { force: true })
  throw new Error("Standalone assembly lacks JavaScript-only input evidence")
}
