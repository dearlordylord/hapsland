import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileEvidence, fileInventory } from "./compiler-evidence.mjs"
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
  writeFileSync(source, "export const value = 1\n")
  writeFileSync(output, "export const value = 1\n")
  writeFileSync(
    receipt,
    JSON.stringify({
      package: "@hapsland/subject",
      host: "bun",
      inputs: [fileEvidence(root, source)],
      outputs: fileInventory(directory, resolve(directory, "dist"))
    })
  )
  assert.equal(checkCompilerReceipts(root), 1)
  writeFileSync(output, "corrupt")
  assert.throws(() => checkCompilerReceipts(root), /Corrupt/)
  writeFileSync(output, "export const value = 1\n")
  writeFileSync(source, "export const value = 2\n")
  assert.throws(() => checkCompilerReceipts(root), /Stale compiler input/)
  writeFileSync(source, "export const value = 1\n")
  writeFileSync(resolve(directory, "dist/obsolete.js"), "old")
  assert.throws(() => checkCompilerReceipts(root), /Corrupt/)
  rmSync(resolve(directory, "dist/obsolete.js"))
  rmSync(receipt)
  assert.throws(() => checkCompilerReceipts(root), /ENOENT/)
})
