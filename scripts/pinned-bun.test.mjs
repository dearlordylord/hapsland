import test from "node:test"
import assert from "node:assert/strict"
import { resolveBunRuntime } from "./pinned-bun.mjs"
import { BUN_VERSION } from "../src/runtime/bun-runtime.ts"

test("resolves the exact product runtime and preserves an explicit selection", () => {
  const resolved = resolveBunRuntime()
  assert.equal(resolved.version, BUN_VERSION)
  assert.deepEqual(resolveBunRuntime({ HAPSLAND_BUILD_BUN: resolved.executable }), resolved)
})

test("an invalid explicit runtime cannot fall back to PATH", () => {
  assert.throws(() => resolveBunRuntime({ HAPSLAND_BUILD_BUN: process.execPath }), /must select exact Bun/)
  assert.throws(() => resolveBunRuntime({ HAPSLAND_BUILD_BUN: "" }), /must select exact Bun/)
})
