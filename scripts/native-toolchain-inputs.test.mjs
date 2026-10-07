import { test } from "node:test"
import assert from "node:assert/strict"
import { nativeToolLibraries, nativeSearchDirectories, nativeToolSelection } from "./native-toolchain-inputs.mjs"
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
test("accounts for loaded libraries and ELF loader while identifying kernel vdso", () => {
  assert.deepEqual(
    nativeToolLibraries("linux-vdso.so.1 (0xabcd)\nlibc.so.6 => /lib/libc.so.6 (0x123)\n/lib/ld.so (0x123)"),
    ["/lib/ld.so", "/lib/libc.so.6"]
  )
})
for (const text of ["libc.so.6 => not found", "statically linked", "linux-vdso.so.1 (0xabc)", "unknown"])
  test(`rejects missing or unsupported tool library evidence ${text}`, () =>
    assert.throws(() => nativeToolLibraries(text), /native tool library/))
test("preserves search order and absent directory candidates", () => {
  assert.deepEqual(nativeSearchDirectories("install: /tools/\nprograms: =/tools/:/other/\nlibraries: =/lib/"), {
    install: ["/tools/"],
    programs: ["/tools/", "/other/"],
    libraries: ["/lib/"]
  })
})
for (const text of [
  "programs: =/tools/",
  "install: /tools/\nprograms: =relative\nlibraries: =/lib/",
  "install: /tools/\ninstall: /other/"
])
  test(`rejects incomplete search profile ${text}`, () =>
    assert.throws(() => nativeSearchDirectories(text), /native compiler search/))

const selectionFixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-tool-selection-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const name of ["first", "second"]) mkdirSync(resolve(root, name))
  const executable = resolve(root, "second/cc")
  writeFileSync(executable, "compiler")
  chmodSync(executable, 0o755)
  const env = { PATH: `${resolve(root, "first")}:${resolve(root, "second")}` }
  return { root, env, executable, select: () => nativeToolSelection(root, "cc", env) }
}
test("tracks absent earlier candidates and detects a new executable shadow", (t) => {
  const f = selectionFixture(t),
    before = f.select()
  assert.equal(before.candidates[0].state, "absent")
  writeFileSync(resolve(f.root, "first/cc"), "shadow")
  chmodSync(resolve(f.root, "first/cc"), 0o755)
  const after = f.select()
  assert.equal(after.requested, resolve(f.root, "first/cc"))
  assert.notDeepEqual(after, before)
})
test("skips non-executable files and directories, then detects permission changes", (t) => {
  const f = selectionFixture(t)
  writeFileSync(resolve(f.root, "first/cc"), "not executable")
  assert.equal(f.select().candidates[0].state, "not-executable")
  chmodSync(resolve(f.root, "first/cc"), 0o755)
  assert.equal(f.select().requested, resolve(f.root, "first/cc"))
  rmSync(resolve(f.root, "first/cc"))
  mkdirSync(resolve(f.root, "first/cc"))
  assert.equal(f.select().candidates[0].state, "not-executable")
})
test("tracks dangling and selected symlinks, including target retargeting", (t) => {
  const f = selectionFixture(t)
  symlinkSync("missing", resolve(f.root, "first/cc"))
  assert.equal(f.select().candidates[0].state, "dangling")
  rmSync(resolve(f.root, "first/cc"))
  symlinkSync("../second/cc", resolve(f.root, "first/cc"))
  const before = f.select()
  assert.equal(before.candidates[0].target, "../second/cc")
  writeFileSync(resolve(f.root, "second/other"), "other compiler")
  chmodSync(resolve(f.root, "second/other"), 0o755)
  rmSync(resolve(f.root, "first/cc"))
  symlinkSync("../second/other", resolve(f.root, "first/cc"))
  assert.notDeepEqual(f.select(), before)
})
test("ignores changed unrelated agent binaries and candidates after selection", (t) => {
  const f = selectionFixture(t),
    before = f.select()
  writeFileSync(resolve(f.root, "first/kimi"), "updated agent")
  chmodSync(resolve(f.root, "first/kimi"), 0o755)
  assert.deepEqual(f.select(), before)
  f.env.PATH += `:${resolve(f.root, "unsearched")}`
  assert.deepEqual(f.select(), before)
})
test("honors relative and empty PATH entries in producer working directory", (t) => {
  const f = selectionFixture(t)
  assert.equal(nativeToolSelection(f.root, "cc", { PATH: ":second" }).requested, f.executable)
})
test("rejects missing executable and unsupported relative command paths", (t) => {
  const f = selectionFixture(t)
  chmodSync(f.executable, 0o644)
  assert.throws(f.select, /Missing executable/)
  assert.throws(() => nativeToolSelection(f.root, "second/cc", f.env), /Unsupported relative/)
})
