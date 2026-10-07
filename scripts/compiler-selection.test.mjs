import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { compilerSelectionFixture } from "./compiler-selection-test-fixture.mjs"

test("rejects a same-version nested compiler when the receipt stamp describes another selection before discovery or compilation", async (t) => {
  const f = await compilerSelectionFixture(t)
  assert.notEqual(f.rootSelection.identity.executable.sha256, f.toolingSelection.identity.executable.sha256)
  const result = f.run()
  assert.notEqual(result.status, 0, "different compiler selection must not publish a successful receipt")
  assert.match(result.stderr, /Compiler selection disagrees with recorded toolchain/)
  assert.equal(existsSync(f.marker), false, "version probes may run, actual discovery and compilation may not")
  assert.equal(existsSync(resolve(f.subject, "dist/.compile-receipt.json")), false)
})

test("publishes a receipt bound to the scripts-owned compiler that actually performed discovery and compilation", async (t) => {
  const f = await compilerSelectionFixture(t, { stampOwner: "scripts" })
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  const calls = readFileSync(f.marker, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.executable === f.nestedExecutable))
  assert.ok(calls[0].args.includes("--listFilesOnly"))
  assert.ok(calls[1].args.includes("--listEmittedFiles"))
  const receipt = JSON.parse(readFileSync(resolve(f.subject, "dist/.compile-receipt.json"), "utf8"))
  assert.deepEqual(receipt.context.toolchain.typescript, f.toolingSelection.identity)
  assert.equal(readFileSync(resolve(f.subject, "dist/main.js"), "utf8").trim(), "export const value = 243;")
})

test("rejects selection retargeting during compilation even when the previously stamped compiler files remain unchanged", async (t) => {
  const f = await compilerSelectionFixture(t, { stampOwner: "scripts", mutation: "resolution" })
  const result = f.run()
  assert.notEqual(result.status, 0, "retargeted compiler selection must not publish a successful receipt")
  assert.match(result.stderr, /Compiler selection (?:disagrees|changed)/)
  assert.ok(existsSync(f.marker), "compilation must reach the actual retargeting wrapper")
  assert.equal(existsSync(resolve(f.subject, "dist")), false)
})

for (const mutation of ["bytes", "support"])
  test(`rejects ${mutation} changes made by the selected compiler during compilation and removes its outputs`, async (t) => {
    const f = await compilerSelectionFixture(t, { stampOwner: "scripts", mutation })
    const result = f.run()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Compiler (?:toolchain identity changed|selection changed)/)
    const calls = readFileSync(f.marker, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    assert.ok(calls.some((call) => call.args.includes("--listEmittedFiles")))
    assert.equal(existsSync(resolve(f.subject, "dist")), false)
  })
