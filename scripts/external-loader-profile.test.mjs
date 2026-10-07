import { test } from "node:test"
import assert from "node:assert/strict"
import { externalLoaderProfile, externalLoaderHash } from "./external-loader-profile.mjs"
const options = { resolveTarget: (value) => ({ path: value }) }
test("records literal CJS and ESM edges from actual syntax", () => {
  const result = externalLoaderProfile(
    'import "node:fs"; export * from "./a.js"; require("./b.js"); import("./c.js"); module.exports = 1;',
    "asset.js",
    options
  )
  assert.deepEqual(
    result.edges.map((edge) => edge.specifier),
    ["node:fs", "./a.js", "./b.js", "./c.js"]
  )
})
test("requires resolution evidence and rejects unresolved targets", () => {
  assert.throws(() => externalLoaderProfile("", "asset.js"), /missing target resolver/)
  assert.throws(
    () => externalLoaderProfile('require("missing")', "asset.js", { resolveTarget: () => undefined }),
    /unresolved/
  )
})
for (const text of [
  "require(name)",
  "import(name)",
  'const load = require; load("x")',
  '(0, eval)("x")',
  'new Function("return require")',
  '(() => {}).constructor("x")',
  'globalThis[name]("x")',
  'Reflect.get(globalThis, name)("x")',
  'module.require("x")',
  'function require(x) {} require("x")'
]) {
  test(`rejects unsupported loader shape ${text}`, () =>
    assert.throws(() => externalLoaderProfile(text, "asset.js", options), /Unsupported external loader/))
}
const native =
  'require(require("node:path").resolve(require("node:path").resolve(require("node:path").dirname(process.execPath), "../../../native/prebuilt", process.platform + "-" + process.arch), "tree-sitter-typescript", "build/Release", "tree_sitter_typescript_binding.node"))'
const approve = (text) => ({
  ...options,
  approval: {
    file: "asset.js",
    originalSha256: "b3bdc95667c309b13ffde9165aa27d3e1436ab957e99c7e5defa1eda699b0a1d",
    transformedSha256: externalLoaderHash(text),
    policy: "tree-sitter-native",
    packageName: "tree-sitter-typescript",
    nativeBinding: "tree_sitter_typescript_binding.node",
    nativeTargets: ["/native/tree_sitter_runtime_binding.node"]
  }
})
test("pins exact transformed native wrapper and finite target", () => {
  const result = externalLoaderProfile(native, "asset.js", approve(native))
  assert.equal(result.nativeUses, 1)
  assert.equal(result.edges[0].kind, "native")
})
test("appended loader cannot reuse a pinned approval", () =>
  assert.throws(() => externalLoaderProfile(native + "; require(name)", "asset.js", approve(native)), /stale pinned/))
test("even repinned appended loader is rejected", () => {
  const text = native + "; require(name)"
  assert.throws(() => externalLoaderProfile(text, "asset.js", approve(text)), /computed require/)
})
test("shadowing approved global require invalidates native shape", () => {
  const text = `function wrap(require) { ${native} }`
  assert.throws(() => externalLoaderProfile(text, "asset.js", approve(text)), /unproven approved binding/)
})
test("missing native target evidence fails closed", () => {
  const policy = approve(native)
  policy.approval.nativeTargets = []
  assert.throws(() => externalLoaderProfile(native, "asset.js", policy), /finite native/)
})
test("pinned installed parser wrappers satisfy their finite native and codegen profiles", async () => {
  const { readFileSync } = await import("node:fs")
  const { pinnedExternalLoaderProfiles } = await import("./external-loader-profile.mjs")
  for (const [name, pin] of Object.entries(pinnedExternalLoaderProfiles)) {
    const file = `node_modules/${name}/${name === "tree-sitter" ? "index.js" : "bindings/node/index.js"}`
    const original = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    assert.equal(externalLoaderHash(original), pin.originalSha256)
    const pattern =
      name === "tree-sitter"
        ? /const binding =[\s\S]*?require\('node-gyp-build'\)\(__dirname\);/
        : /module\.exports =[\s\S]*?require\("node-gyp-build"\)\(root\);/
    const call = `require(require("node:path").resolve(require("node:path").resolve(require("node:path").dirname(process.execPath), "../../../native/prebuilt", process.platform + "-" + process.arch), ${JSON.stringify(name)}, "build/Release", ${JSON.stringify(pin.nativeBinding)}))`
    const text = original.replace(
      pattern,
      name === "tree-sitter" ? `const binding = ${call};` : `module.exports = ${call};`
    )
    const approval = {
      ...pin,
      file,
      packageName: name,
      transformedSha256: externalLoaderHash(text),
      nativeTargets: [`/native/${pin.nativeBinding}`]
    }
    const result = externalLoaderProfile(text, file, { ...options, approval })
    assert.equal(result.nativeUses, 1)
    assert.equal(result.codegenUses, name === "tree-sitter" ? 1 : 0)
  }
})
test("caller cannot approve a different original dependency hash", () => {
  const policy = approve(native)
  policy.approval.originalSha256 = "a".repeat(64)
  assert.throws(() => externalLoaderProfile(native, "asset.js", policy), /unapproved external dependency/)
})
test("reviewed Effect data reflection is byte pinned and appended reflective loaders fail", async () => {
  const { readFileSync } = await import("node:fs")
  const file = "node_modules/effect/dist/internal/equal.js"
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
  externalLoaderProfile(text, file, options)
  assert.throws(
    () => externalLoaderProfile(text + '; Reflect.get(globalThis, "Function")("x")', file, options),
    /Unsupported external loader/
  )
})
test("computed constructor spelling cannot launder a callable", () => {
  assert.throws(
    () => externalLoaderProfile('(() => {})["con" + "structor"]("return require")', "asset.js", options),
    /computed callable member/
  )
})
test("Effect Function namespace is distinguished from global code generation", () => {
  externalLoaderProfile('import * as Function from "effect/Function"; Function.flow(x);', "asset.js", options)
  assert.throws(
    () => externalLoaderProfile('import * as Function from "other"; Function.flow(x);', "asset.js", options),
    /loader reference Function/
  )
})
test("indexed callback profile cannot authorize appended constructor dispatch", async () => {
  const { readFileSync } = await import("node:fs")
  const file = "node_modules/effect/dist/Pipeable.js"
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
  externalLoaderProfile(text, file, options)
  assert.throws(
    () => externalLoaderProfile(text + '; (()=>{})["con"+"structor"]("x")', file, options),
    /computed callable member/
  )
})
