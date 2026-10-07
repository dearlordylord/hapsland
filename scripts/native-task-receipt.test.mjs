import { nativeDirectoryInventory, nativeToolSelection, nativeToolNames } from "./native-toolchain-inputs.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { checkNativeReceipt, nativeReceiptDigest } from "./native-task-receipt.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-native-cache-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ["source.c", "header.h", "lib.so", "cc", "tool.so", "ld.cache", "output"])
    writeFileSync(resolve(root, name), name)
  mkdirSync(resolve(root, "search"))
  for (const name of nativeToolNames) {
    writeFileSync(resolve(root, name), name)
    chmodSync(resolve(root, name), 0o755)
  }
  const context = { platform: "linux", architecture: "arm64", flags: ["-O2"], environment: { CPATH: null, PATH: root } }
  const receipt = {
    context,
    headers: ["source.c", "header.h"].map((name) => fileEvidence(root, resolve(root, name))),
    linker: [fileEvidence(root, resolve(root, "lib.so"))],
    tools: nativeToolNames
      .filter((name) => name !== "ldd")
      .map((name) => ({ name, requested: resolve(root, name), ...fileEvidence(root, resolve(root, name)) })),
    toolSelections: nativeToolNames.map((name) => ({ name, ...nativeToolSelection(root, name, context.environment) })),
    toolLibraries: [fileEvidence(root, resolve(root, "tool.so"))],
    resolution: [fileEvidence(root, resolve(root, "ld.cache"))],
    search: [{ path: "search", entries: [] }],
    output: fileEvidence(root, resolve(root, "output"))
  }
  receipt.digest = nativeReceiptDigest(receipt)
  const check = () => checkNativeReceipt(root, receipt, context, resolve(root, "source.c"), resolve(root, "output"))
  return { root, receipt, context, check }
}
test("validates current native producer context and all contributions", (t) => {
  const f = fixture(t)
  assert.equal(f.check(), f.receipt)
})
for (const name of ["source.c", "header.h", "lib.so", "cc", "tool.so", "ld.cache", "output"])
  test(`rejects changed native contribution ${name}`, (t) => {
    const f = fixture(t)
    writeFileSync(resolve(f.root, name), "changed")
    assert.throws(f.check, /Stale native|Native tool selection changed/)
  })
test("rejects output permission changes", (t) => {
  const f = fixture(t)
  chmodSync(resolve(f.root, "output"), 0o700)
  assert.throws(f.check, /Stale native|Native tool selection changed/)
})
test("rejects caller context changes", (t) => {
  const f = fixture(t)
  f.context.environment.CPATH = "/other"
  assert.throws(f.check, /corrupt or stale/)
})
test("rejects search shadowing by an added candidate", (t) => {
  const f = fixture(t)
  writeFileSync(resolve(f.root, "search/lib.so"), "new candidate")
  assert.throws(f.check, /search directory changed/)
})
test("rejects evidence omission", (t) => {
  const f = fixture(t)
  f.receipt.linker = []
  f.receipt.digest = nativeReceiptDigest(f.receipt)
  assert.throws(f.check, /Missing native linker/)
})
test("rejects a requested path retargeted to another file", (t) => {
  const f = fixture(t)
  symlinkSync("header.h", resolve(f.root, "selected.h"))
  f.receipt.headers[1].requested = "selected.h"
  f.receipt.digest = nativeReceiptDigest(f.receipt)
  f.check()
  rmSync(resolve(f.root, "selected.h"))
  symlinkSync("lib.so", resolve(f.root, "selected.h"))
  assert.throws(f.check, /Stale native|Native tool selection changed/)
})

test("rejects changed search candidate bytes without a directory-name change", (t) => {
  const f = fixture(t),
    directory = resolve(f.root, "search"),
    candidate = resolve(directory, "lib.so")
  writeFileSync(candidate, "old candidate")
  f.receipt.search[0].entries = nativeDirectoryInventory(directory)
  f.receipt.digest = nativeReceiptDigest(f.receipt)
  f.check()
  writeFileSync(candidate, "replacement candidate")
  assert.throws(f.check, /search directory changed/)
})
test("rejects a formerly dangling search symlink becoming usable", (t) => {
  const f = fixture(t),
    directory = resolve(f.root, "search")
  symlinkSync("../new-library.so", resolve(directory, "lib.so"))
  f.receipt.search[0].entries = nativeDirectoryInventory(directory)
  f.receipt.digest = nativeReceiptDigest(f.receipt)
  f.check()
  writeFileSync(resolve(f.root, "new-library.so"), "newly selected library")
  assert.throws(f.check, /search directory changed/)
})

test("rejects added headers inside an existing nested include directory", (t) => {
  const f = fixture(t),
    directory = resolve(f.root, "search")
  mkdirSync(resolve(directory, "nested"))
  f.receipt.search[0] = { path: "search", recursive: true, entries: nativeDirectoryInventory(directory, true) }
  f.receipt.digest = nativeReceiptDigest(f.receipt)
  f.check()
  writeFileSync(resolve(directory, "nested/new-header.h"), "new header")
  assert.throws(f.check, /search directory changed/)
})

test("rejects omission of ordered tool resolution evidence", (t) => {
  const f = fixture(t)
  delete f.receipt.toolSelections
  f.receipt.digest = nativeReceiptDigest(f.receipt)
  assert.throws(f.check, /tool selection evidence/)
})
test("ignores an unrelated Kimi update in PATH but rejects new compiler shadowing", (t) => {
  const f = fixture(t),
    earlier = resolve(f.root, "earlier")
  mkdirSync(earlier)
  f.context.environment.PATH = `${earlier}:${f.root}`
  f.receipt.context = structuredClone(f.context)
  f.receipt.toolSelections = nativeToolNames.map((name) => ({
    name,
    ...nativeToolSelection(f.root, name, f.context.environment)
  }))
  f.receipt.digest = nativeReceiptDigest(f.receipt)
  writeFileSync(resolve(earlier, "kimi"), "new agent binary")
  chmodSync(resolve(earlier, "kimi"), 0o755)
  f.check()
  writeFileSync(resolve(earlier, "cc"), "shadow compiler")
  chmodSync(resolve(earlier, "cc"), 0o755)
  assert.throws(f.check, /Native tool selection changed: cc/)
})
