import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { BunPlugin } from "bun"
import {
  configureNativeBindings,
  nativeParserBindings,
  physicalNativeBindings,
  transformNativeBindingModule
} from "@hapsland/source-analysis/direct-event/languages/native-bindings"
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const fixture = (name: string, contents: string) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-native-loader-"))
  roots.push(root)
  const path = join(root, name, "bindings/node/index.js")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  return { root, path }
}
const wrapper =
  'const root = require("path").join(__dirname, "..", ".."); module.exports = require("node-gyp-build")(root);'
describe("physical native parser loading", () => {
  it.each(Object.keys(nativeParserBindings) as Array<keyof typeof nativeParserBindings>)(
    "transforms actual installed %s wrapper into a finite native target",
    (name) => {
      const path = resolve("node_modules", name, name === "tree-sitter" ? "index.js" : "bindings/node/index.js")
      const transformed = transformNativeBindingModule(path, JSON.stringify("/retained/native"))
      expect(transformed.original).toBe(readFileSync(path, "utf8"))
      expect(transformed.packageName).toBe(name)
      expect(transformed.nativeBinding).toBe(nativeParserBindings[name])
      expect(transformed.transformed).not.toContain("require('node-gyp-build')")
      expect(transformed.transformed).not.toContain('require("node-gyp-build")')
      expect(transformed.transformed).toContain(JSON.stringify(nativeParserBindings[name]))
      expect(transformed.transformed).not.toContain("export default")
    }
  )
  it("runtime ESM exports the CJS binding as its default value", async () => {
    const f = fixture("tree-sitter-typescript", wrapper)
    const transformed = transformNativeBindingModule(f.path, JSON.stringify("/native"), true)
    // Supply a lexical require to the ESM fixture: native binding execution is
    // represented by a sentinel, so this tests wrapper export behavior offline.
    const text =
      'const __dirname = "/fixture"; const require = (specifier) => specifier === "node:path" ? { resolve: (...parts) => parts.join("/") } : { nativeTarget: specifier };\n' +
      transformed.transformed
    const loaded = (await import(`data:text/javascript,${encodeURIComponent(text)}`)) as {
      default: { nativeTarget: string }
    }
    expect(loaded.default).toEqual({
      nativeTarget: "/native/tree-sitter-typescript/build/Release/tree_sitter_typescript_binding.node"
    })
  })
  it("rejects a changed binding loader instead of publishing unsupported bytes", () => {
    const f = fixture("tree-sitter-rust", 'module.exports = require("other-loader")(root);')
    expect(() => transformNativeBindingModule(f.path, '"/native"')).toThrow(/differs from the checked binding shape/)
  })
  it("rejects unknown package identity before constructing a native path", () => {
    const f = fixture("unrecognized-grammar", wrapper)
    expect(() => transformNativeBindingModule(f.path, '"/native"')).toThrow(/Unsupported native binding module/)
  })
  it("plugin reports the exact original and returned transformed bytes to its observer", () => {
    const f = fixture("tree-sitter-rust", wrapper)
    let load: ((args: { path: string }) => unknown) | undefined
    let observed: ReturnType<typeof transformNativeBindingModule> | undefined
    const plugin = physicalNativeBindings('"/native"', false, (value) => {
      observed = value
    })
    plugin.setup({
      onLoad: (_options: unknown, callback: typeof load) => {
        load = callback
      }
    } as unknown as Parameters<BunPlugin["setup"]>[0])
    const result = load?.({ path: f.path }) as { contents: string; loader: string; resolveDir: string }
    expect(observed?.original).toBe(wrapper)
    expect(result.contents).toBe(observed?.transformed)
    expect(result.loader).toBe("js")
    expect(result.resolveDir).toBe(dirname(f.path))
  })
  it("configures only native packages whose physical binding exists", () => {
    const root = mkdtempSync(join(tmpdir(), "hapsland-native-config-"))
    roots.push(root)
    const names = ["TREE_SITTER_PREBUILD", "TREE_SITTER_TYPESCRIPT_PREBUILD", "TREE_SITTER_RUST_PREBUILD"] as const
    const before = names.map((name) => process.env[name])
    try {
      for (const name of names) process.env[name] = "unchanged"
      const native = join(root, "tree-sitter-rust", "build/Release", nativeParserBindings["tree-sitter-rust"])
      mkdirSync(dirname(native), { recursive: true })
      writeFileSync(native, "fixture")
      configureNativeBindings(root)
      expect(process.env.TREE_SITTER_RUST_PREBUILD).toBe(join(root, "tree-sitter-rust"))
      expect(process.env.TREE_SITTER_PREBUILD).toBe("unchanged")
      expect(process.env.TREE_SITTER_TYPESCRIPT_PREBUILD).toBe("unchanged")
    } finally {
      names.forEach((name, index) => {
        if (before[index] === undefined) delete process.env[name]
        else process.env[name] = before[index]
      })
    }
  })
})
