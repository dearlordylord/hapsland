import { physicalNativeBindings } from "../src/runtime/native-bindings.ts"
const [entrypoint, target, outfile] = process.argv.slice(2)
const result = await Bun.build({
  entrypoints: [entrypoint],
  target: "bun",
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
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
