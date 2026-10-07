import test from "node:test"
import assert from "node:assert/strict"
import { standaloneBuiltin, standaloneBuiltinTarget, proveStandaloneBuiltin } from "./standalone-runtime-profile.mjs"
test("classification uses the pinned Bun set independently of Node builtin additions", () => {
  for (const value of ["node:fs", "fs", "bun:ffi", "ws", "node:test"]) assert.equal(standaloneBuiltin(value), true)
  for (const value of [
    "node:sea",
    "node:sqlite",
    "node:test/reporters",
    "bun:unknown",
    "ws/index.js",
    "constructor",
    "__proto__"
  ])
    assert.equal(standaloneBuiltin(value), false)
  assert.equal(standaloneBuiltinTarget("fs"), "node:fs")
})
test("producer must prove the exact Bun-selected builtin target", () => {
  assert.equal(
    proveStandaloneBuiltin("fs", "/asset", () => "node:fs"),
    "node:fs"
  )
  assert.throws(() => proveStandaloneBuiltin("ws", "/asset", () => "/node_modules/ws/index.js"), /resolver disagrees/)
  assert.equal(
    proveStandaloneBuiltin("node:sea", "/asset", () => "node:sea"),
    undefined
  )
})

test("the pinned Bun executable resolves every approved builtin to its declared target", async () => {
  const { spawnSync } = await import("node:child_process")
  const { fileURLToPath } = await import("node:url")
  const { standaloneBuiltinSpecifiers, standaloneRuntimeVersion } = await import("./standalone-runtime-profile.mjs")
  const script = `console.log(JSON.stringify({version:Bun.version,targets:${JSON.stringify(standaloneBuiltinSpecifiers)}.map(specifier=>[specifier,Bun.resolveSync(specifier,process.cwd())])}))`
  const result = spawnSync(fileURLToPath(new URL("../node_modules/.bin/bun", import.meta.url)), ["-e", script], {
    encoding: "utf8",
    timeout: 5000
  })
  assert.equal(result.status, 0, result.stderr)
  const observed = JSON.parse(result.stdout)
  assert.equal(observed.version, standaloneRuntimeVersion)
  for (const [specifier, target] of observed.targets)
    assert.equal(target, standaloneBuiltinTarget(specifier), specifier)
})
