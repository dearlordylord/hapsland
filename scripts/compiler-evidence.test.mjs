import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { fileEvidence } from "./compiler-evidence.mjs"

const hash = (text) => createHash("sha256").update(text).digest("hex")
const fixture = (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(resolve(tmpdir(), "hapsland-file-evidence-")))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = resolve(root, "input")
  fs.writeFileSync(file, "AAAA", { mode: 0o600 })
  return { root, file }
}
test("repeated evidence detects same-size edits even with restored mtime", (t) => {
  const { root, file } = fixture(t)
  const time = new Date(0)
  fs.utimesSync(file, time, time)
  assert.equal(fileEvidence(root, file).sha256, hash("AAAA"))
  assert.equal(fileEvidence(root, file).sha256, hash("AAAA"))
  fs.writeFileSync(file, "BBBB")
  fs.utimesSync(file, time, time)
  assert.equal(fileEvidence(root, file).sha256, hash("BBBB"))
  fs.chmodSync(file, 0o755)
  assert.equal(fileEvidence(root, file).mode, 0o755)
  const replacement = resolve(root, "replacement")
  fs.writeFileSync(replacement, "CCCC")
  fs.renameSync(replacement, file)
  assert.equal(fileEvidence(root, file).sha256, hash("CCCC"))
  assert.equal(fileEvidence(file, file).path, "")
  fs.rmSync(file)
  assert.throws(() => fileEvidence(root, file), { code: "ENOENT" })
})
test("regular-file evidence cannot be reused after symlink or directory replacement", (t) => {
  const { root, file } = fixture(t)
  fileEvidence(root, file)
  fs.renameSync(file, resolve(root, "target"))
  fs.symlinkSync("target", file)
  assert.throws(() => fileEvidence(root, file), /regular file/)
  fs.rmSync(file)
  fs.mkdirSync(file)
  assert.throws(() => fileEvidence(root, file), /regular file/)
})
for (const mutation of ["write", "replace"])
  test(`reused digest rejects ${mutation} between descriptor observations`, (t) => {
    const { root, file } = fixture(t)
    fileEvidence(root, file)
    const stat = fs.fstatSync
    const inode = String(fs.statSync(file).ino)
    let changed = false
    fs.fstatSync = (...args) => {
      const observed = stat(...args)
      if (!changed && String(observed.ino) === inode) {
        changed = true
        if (mutation === "write") fs.writeFileSync(file, "BBBB")
        else {
          fs.writeFileSync(resolve(root, "replacement"), "BBBB")
          fs.renameSync(resolve(root, "replacement"), file)
        }
      }
      return observed
    }
    syncBuiltinESMExports()
    try {
      assert.throws(() => fileEvidence(root, file), /changed during hashing/)
    } finally {
      fs.fstatSync = stat
      syncBuiltinESMExports()
    }
    assert.equal(fileEvidence(root, file).sha256, hash("BBBB"))
  })
for (const mutation of ["write", "replace"])
  test(`descriptor evidence rejects ${mutation} during hashing and recovers on current bytes`, (t) => {
    const { root, file } = fixture(t)
    const read = fs.readFileSync
    const inode = fs.statSync(file).ino
    fs.readFileSync = (...args) => {
      const bytes = read(...args)
      if (typeof args[0] === "number" && fs.fstatSync(args[0]).ino === inode) {
        if (mutation === "write") fs.writeFileSync(file, "BBBB")
        else {
          fs.writeFileSync(resolve(root, "replacement"), "BBBB")
          fs.renameSync(resolve(root, "replacement"), file)
        }
      }
      return bytes
    }
    syncBuiltinESMExports()
    try {
      assert.throws(() => fileEvidence(root, file), /changed during hashing/)
    } finally {
      fs.readFileSync = read
      syncBuiltinESMExports()
    }
    assert.equal(fileEvidence(root, file).sha256, hash("BBBB"))
  })
