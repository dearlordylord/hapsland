import { readFileSync } from "node:fs"
import { dirname } from "node:path"
const [entrypoint, target, outfile] = process.argv.slice(2)
const bindings = {
  "tree-sitter": "tree_sitter_runtime_binding.node",
  "tree-sitter-typescript": "tree_sitter_typescript_binding.node",
  "tree-sitter-rust": "tree_sitter_rust_binding.node"
}
const externalBinding = (packageName) =>
  `require(require("node:path").resolve(require("node:path").dirname(process.execPath), "../../../native/prebuilt", process.platform + "-" + process.arch, ${JSON.stringify(packageName)}, "build/Release", ${JSON.stringify(bindings[packageName])}))`
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
    {
      name: "hapsland-physical-native-bindings",
      setup(build) {
        build.onLoad(
          { filter: /\/tree-sitter(?:-typescript|-rust)?\/(?:index\.js|bindings\/node\/index\.js)$/ },
          ({ path }) => {
            let contents = readFileSync(path, "utf8")
            const packageName = path.match(/\/(tree-sitter(?:-typescript|-rust)?)\//)[1]
            const pattern =
              packageName === "tree-sitter"
                ? /const binding =[\s\S]*?require\('node-gyp-build'\)\(__dirname\);/
                : /module\.exports =[\s\S]*?require\("node-gyp-build"\)\(root\);/
            if (!pattern.test(contents))
              throw new Error(`Pinned ${packageName} loader no longer matches the checked native binding shape`)
            const replacement =
              packageName === "tree-sitter"
                ? `const binding = ${externalBinding(packageName)};`
                : `module.exports = ${externalBinding(packageName)};`
            contents = contents.replace(pattern, replacement)
            return { contents, loader: "js", resolveDir: dirname(path) }
          }
        )
      }
    }
  ]
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
