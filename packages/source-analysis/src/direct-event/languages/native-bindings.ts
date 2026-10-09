import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import type { BunPlugin } from "bun"

const bindings = {
  "tree-sitter": "tree_sitter_runtime_binding.node",
  "tree-sitter-typescript": "tree_sitter_typescript_binding.node",
  "tree-sitter-rust": "tree_sitter_rust_binding.node"
} as const
export const sourceNativeParserRoot = (root: string, profile = `${process.platform}-${process.arch}`): string =>
  join(root, "packages/source-analysis/artifacts/native", profile)
export const nativeParserBindings = bindings
const bindingEnvironment = {
  "tree-sitter": "TREE_SITTER_PREBUILD",
  "tree-sitter-typescript": "TREE_SITTER_TYPESCRIPT_PREBUILD",
  "tree-sitter-rust": "TREE_SITTER_RUST_PREBUILD"
} as const
export const configureNativeBindings = (root: string): void => {
  for (const name of Object.keys(bindings) as Array<keyof typeof bindings>) {
    const directory = join(root, name)
    if (existsSync(join(directory, "build", "Release", bindings[name])))
      process.env[bindingEnvironment[name]] = directory
  }
}
export type NativeBindingTransformation = {
  readonly path: string
  readonly packageName: keyof typeof bindings
  readonly nativeBinding: string
  readonly original: string
  readonly transformed: string
}
export const transformNativeBindingModule = (
  path: string,
  rootExpression: string,
  runtimeLoader = false
): NativeBindingTransformation => {
  const contents = readFileSync(path, "utf8")
  const matchedName = path.match(/\/(tree-sitter(?:-typescript|-rust)?)\//)?.[1]
  if (!matchedName || !Object.hasOwn(bindings, matchedName))
    throw new Error(`Unsupported native binding module: ${path}`)
  const packageName = matchedName as keyof typeof bindings
  const pattern =
    packageName === "tree-sitter"
      ? /const binding =[\s\S]*?require\('node-gyp-build'\)\(__dirname\);/
      : /const root = require\("path"\)\.join\(__dirname, "\.\.", "\.\."\);[\s\S]*?module\.exports =[\s\S]*?require\("node-gyp-build"\)\(root\);/
  if (!pattern.test(contents)) throw new Error(`Pinned ${packageName} loader differs from the checked binding shape`)
  const binding = `require(require("node:path").resolve(${rootExpression}, ${JSON.stringify(packageName)}, "build/Release", ${JSON.stringify(bindings[packageName])}))`
  const replacement = packageName === "tree-sitter" ? `const binding = ${binding};` : `module.exports = ${binding};`
  const rewritten = contents.replace(pattern, replacement)
  // Runtime onLoad returns an ES module. Preserve the pinned CommonJS
  // wrappers' default export explicitly; Bun.build handles CJS itself.
  const loaded = runtimeLoader
    ? `const module = { exports: {} }; const exports = module.exports;\n${rewritten}\nexport default module.exports;`
    : rewritten
  return { path, packageName, nativeBinding: bindings[packageName], original: contents, transformed: loaded }
}
export const physicalNativeBindings = (
  rootExpression: string,
  runtimeLoader = false,
  observe?: (transformation: NativeBindingTransformation) => void
): BunPlugin => ({
  name: "hapsland-physical-native-bindings",
  setup(build) {
    build.onLoad(
      { filter: /\/tree-sitter(?:-typescript|-rust)?\/(?:index\.js|bindings\/node\/index\.js)$/ },
      ({ path }) => {
        const transformation = transformNativeBindingModule(path, rootExpression, runtimeLoader)
        observe?.(transformation)
        return { contents: transformation.transformed, loader: "js", resolveDir: dirname(path) }
      }
    )
  }
})
