import test from "node:test"
import assert from "node:assert/strict"
import { parse } from "@babel/parser"
import traverseModule from "@babel/traverse"
import { loaderPolicy } from "./source-loader-policy.mjs"

const inspect = (source, name) => {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript"] })
  const paths = new WeakMap()
  let target
  const traverse = traverseModule.default ?? traverseModule
  traverse(ast, {
    enter(path) {
      paths.set(path.node, path)
      if (name === "demo-session" && path.isCallExpression() && path.node.callee.type === "Import")
        target = path.node.arguments[0]
      if (name === "inspection-native-lock" && path.isCallExpression() && path.node.callee.type === "CallExpression")
        target = path.node
    }
  })
  assert.ok(target)
  const policy = loaderPolicy(name)
  return name === "demo-session" ? policy.computedImport(target, paths) : policy.nativeRequire(target, paths)
}
const demo = 'await import(pathToFileURL(join(root, "session.ts")).href)'
const demoImports = 'import {join} from "node:path"; import {pathToFileURL} from "node:url";'
const native =
  'createRequire(packageAssetPath("package.json"))(packageAssetPath("native", "prebuilt", `${process.platform}-${process.arch}`, "inspection-lock.node"))'
const nativeImports =
  'import {createRequire} from "node:module"; import {packageAssetPath} from "@hapsland/runtime-environment/runtime/package-runtime";'

test("demo loader uses the imported helpers and its declared directory parameter", () => {
  assert.equal(
    inspect(`${demoImports} export const validateDemoSession = async (root: string) => ${demo}`, "demo-session"),
    true
  )
})
for (const source of [
  `${demoImports} export const validateDemoSession = async (root: string) => { const join = () => "hidden"; return ${demo} }`,
  `${demoImports} export const validateDemoSession = async (root: string) => { const pathToFileURL = () => ({href:"hidden"}); return ${demo} }`,
  `${demoImports} export const validateDemoSession = async (root: string) => { return (async (root: string) => ${demo})("hidden") }`,
  `${demoImports} export const validateDemoSession = async (root: string) => { root = "hidden"; return ${demo} }`,
  `import {join} from "untrusted"; import {pathToFileURL} from "node:url"; export const validateDemoSession = async (root: string) => ${demo}`
])
  test("rejects altered demo loader binding provenance", () => assert.equal(inspect(source, "demo-session"), false))

test("native loader uses the approved imports and runtime platform", () => {
  assert.equal(inspect(`${nativeImports} const run = () => ${native}`, "inspection-native-lock"), true)
})
for (const declaration of [
  'const packageAssetPath = () => "/hidden";',
  "const createRequire = () => () => undefined;",
  'const process = {platform:"hidden",arch:"hidden"};'
])
  test(`rejects native loader shadowing: ${declaration}`, () => {
    assert.equal(
      inspect(`${nativeImports} const run = () => { ${declaration} return ${native} }`, "inspection-native-lock"),
      false
    )
  })
