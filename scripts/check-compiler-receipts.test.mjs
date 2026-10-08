import { syncBuiltinESMExports } from "node:module"
import test from "node:test"
import assert from "node:assert/strict"
import fs, { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
import { compilerContext, readCompilerToolchain } from "./compiler-context.mjs"
import { readPackageGraph } from "./package-graph.mjs"
import { checkCompilerReceipts } from "./check-compiler-receipts.mjs"

test("receipts reject corruption, stale inputs, extra output and missing evidence", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-compiler-receipt-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = resolve(root, "packages/subject")
  mkdirSync(resolve(directory, "src"), { recursive: true })
  mkdirSync(resolve(directory, "dist"))
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ workspaces: ["packages/subject"] }))
  writeFileSync(
    resolve(directory, "package.json"),
    JSON.stringify({ name: "@hapsland/subject", private: true, type: "module", hapsland: { host: "bun" } })
  )
  const source = resolve(directory, "src/main.ts"),
    output = resolve(directory, "dist/main.js"),
    receipt = resolve(directory, "dist/.compile-receipt.json")
  for (const path of [
    "bun.lock",
    "tsconfig.json",
    "tsconfig.package.json",
    "scripts/compile-package.mjs",
    "scripts/build-lock.mjs",
    "scripts/build-groups.mjs",
    "scripts/owned-lock.mjs",
    "scripts/build-process.mjs",
    "scripts/build-workspaces.mjs",
    "scripts/build-bend-producers.mjs",
    "scripts/compiler-evidence.mjs",
    "scripts/compiler-context.mjs",
    "scripts/pinned-typescript.mjs",
    "scripts/package-graph.mjs",
    "scripts/authored-task-inputs.mjs",
    "packages/subject/tsconfig.json"
  ]) {
    const absolute = resolve(root, path)
    mkdirSync(resolve(absolute, ".."), { recursive: true })
    writeFileSync(absolute, "fixture")
  }
  mkdirSync(resolve(root, ".test-runs"))
  writeFileSync(resolve(root, ".test-runs/build-toolchain.json"), JSON.stringify({ compiler: "fixture" }))
  const node = readPackageGraph(root).packages.get("@hapsland/subject")
  writeFileSync(source, "export const value = 1\n")
  writeFileSync(output, "export const value = 1\n")
  writeFileSync(
    receipt,
    JSON.stringify({
      context: compilerContext(root, node),
      package: "@hapsland/subject",
      host: "bun",
      inputs: [fileEvidence(root, source)],
      outputs: fileInventory(directory, resolve(directory, "dist"))
    })
  )
  assert.equal(checkCompilerReceipts(root), 1)
  // A single synchronous pass observes the shared executable at start and end,
  // regardless of how many workspace receipts share it.
  const compiler = resolve(root, "compiler")
  writeFileSync(compiler, "compiler bytes")
  const stampPath = resolve(root, ".test-runs/build-toolchain.json")
  writeFileSync(stampPath, JSON.stringify({ typescript: { executable: fileEvidence(root, compiler) } }))
  const release = { workspaces: ["packages/subject", "packages/second", "packages/third"] }
  writeFileSync(resolve(root, "package.json"), JSON.stringify(release))
  for (const name of ["second", "third"]) {
    const target = resolve(root, "packages", name)
    mkdirSync(resolve(target, "src"), { recursive: true })
    mkdirSync(resolve(target, "dist"))
    writeFileSync(
      resolve(target, "package.json"),
      JSON.stringify({ name: `@hapsland/${name}`, private: true, type: "module", hapsland: { host: "bun" } })
    )
    writeFileSync(resolve(target, "tsconfig.json"), "fixture")
    writeFileSync(resolve(target, "src/main.ts"), "export const value = 1\n")
    writeFileSync(resolve(target, "dist/main.js"), "export const value = 1\n")
  }
  for (const owner of readPackageGraph(root).packages.values()) {
    writeFileSync(
      resolve(owner.path, "dist/.compile-receipt.json"),
      JSON.stringify({
        context: compilerContext(root, owner),
        package: owner.manifest.name,
        host: "bun",
        inputs: [fileEvidence(root, resolve(owner.path, "src/main.ts"))],
        outputs: fileInventory(owner.path, resolve(owner.path, "dist")).filter(
          (value) => value.path !== "dist/.compile-receipt.json"
        )
      })
    )
  }
  const originalOpen = fs.openSync
  let observations = 0,
    mutate = false,
    replaceStamp = false
  fs.openSync = function (path, ...args) {
    if (resolve(String(path)) === compiler) observations++
    const descriptor = originalOpen.call(this, path, ...args)
    if (mutate && resolve(String(path)) === output) {
      mutate = false
      writeFileSync(compiler, "changed compiler bytes")
      if (replaceStamp)
        writeFileSync(stampPath, JSON.stringify({ typescript: { executable: fileEvidence(root, compiler) } }))
    }
    return descriptor
  }
  syncBuiltinESMExports()
  try {
    assert.equal(checkCompilerReceipts(root), 3)
    assert.equal(observations, 2)
    observations = 0
    assert.equal(checkCompilerReceipts(root), 3)
    assert.equal(observations, 2)
    mutate = true
    assert.throws(() => checkCompilerReceipts(root), /Compiler toolchain identity changed/)
    assert.throws(() => checkCompilerReceipts(root), /Compiler toolchain identity changed/)
    writeFileSync(compiler, "compiler bytes")
    mutate = true
    replaceStamp = true
    assert.throws(() => checkCompilerReceipts(root), /Compiler toolchain changed during receipt validation/)
    writeFileSync(compiler, "compiler bytes")
    writeFileSync(stampPath, JSON.stringify({ typescript: { executable: fileEvidence(root, compiler) } }))
  } finally {
    fs.openSync = originalOpen
    syncBuiltinESMExports()
  }
  // Continue the original corruption cases with one owner and its fresh context.
  writeFileSync(compiler, "compiler bytes")
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ workspaces: ["packages/subject"] }))
  writeFileSync(
    receipt,
    JSON.stringify({
      context: compilerContext(root, readPackageGraph(root).packages.get("@hapsland/subject")),
      package: "@hapsland/subject",
      host: "bun",
      inputs: [fileEvidence(root, source)],
      outputs: fileInventory(directory, resolve(directory, "dist")).filter(
        (value) => value.path !== "dist/.compile-receipt.json"
      )
    })
  )
  writeFileSync(output, "corrupt")
  assert.throws(() => checkCompilerReceipts(root), /Corrupt/)
  writeFileSync(output, "export const value = 1\n")
  writeFileSync(source, "export const value = 2\n")
  assert.throws(() => checkCompilerReceipts(root), /Stale compiler (?:input|context)/)
  writeFileSync(source, "export const value = 1\n")
  writeFileSync(resolve(directory, "dist/obsolete.js"), "old")
  assert.throws(() => checkCompilerReceipts(root), /Corrupt/)
  rmSync(resolve(directory, "dist/obsolete.js"))
  const added = resolve(directory, "src/added.ts")
  writeFileSync(added, "export const added = true")
  assert.throws(() => checkCompilerReceipts(root), /Stale compiler context/)
  rmSync(added)
  writeFileSync(resolve(root, "tsconfig.json"), "changed")
  assert.throws(() => checkCompilerReceipts(root), /Stale compiler context/)
  writeFileSync(resolve(root, "tsconfig.json"), "fixture")
  writeFileSync(
    resolve(root, ".test-runs/build-toolchain.json"),
    JSON.stringify({ typescript: { version: "different" } })
  )
  assert.throws(() => checkCompilerReceipts(root), /Stale compiler context/)
  rmSync(receipt)
  assert.throws(() => checkCompilerReceipts(root), /ENOENT/)
})

test("same-version compiler or support byte changes invalidate the recorded toolchain", (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-compiler-identity-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(resolve(root, ".test-runs"))
  const compiler = resolve(root, "compiler"),
    support = resolve(root, "support.js")
  writeFileSync(compiler, "Version fixture; original compiler body")
  writeFileSync(support, "original support body")
  const toolchain = {
    typescript: { version: "fixture", executable: fileEvidence(root, compiler), support: [fileEvidence(root, support)] }
  }
  writeFileSync(resolve(root, ".test-runs/build-toolchain.json"), JSON.stringify(toolchain))
  assert.deepEqual(readCompilerToolchain(root), toolchain)
  writeFileSync(compiler, "Version fixture; changed compiler body")
  assert.throws(() => readCompilerToolchain(root), /Compiler toolchain identity changed/)
  writeFileSync(compiler, "Version fixture; original compiler body")
  writeFileSync(support, "changed support body")
  assert.throws(() => readCompilerToolchain(root), /Compiler toolchain identity changed/)
})
