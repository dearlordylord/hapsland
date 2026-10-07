import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { cleanCompilerOutput } from "./clean-compiler-output.mjs"
const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-compiler-clean-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const owner = resolve(root, "packages/owner")
  mkdirSync(owner, { recursive: true })
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ workspaces: ["packages/owner"] }))
  writeFileSync(
    resolve(owner, "package.json"),
    JSON.stringify({ name: "@fixture/owner", private: true, type: "module" })
  )
  return { root, owner }
}
test("cleanup removes only declared compiler dist including stale born files", async (t) => {
  const f = fixture(t)
  const retained = [
    "dist/public.js",
    "packages/owner/artifacts/native/linux-arm64/native.node",
    "native/prebuilt/linux-arm64/native.node",
    "packages/owner/src/source.ts"
  ]
  for (const file of [...retained, "packages/owner/dist/current.js", "packages/owner/dist/alternate.js"]) {
    const path = resolve(f.root, file)
    mkdirSync(resolve(path, ".."), { recursive: true })
    writeFileSync(path, "retained")
  }
  await cleanCompilerOutput(f.root, f.owner)
  assert.equal(existsSync(resolve(f.owner, "dist")), false)
  for (const file of retained) assert.equal(existsSync(resolve(f.root, file)), true, file)
  await cleanCompilerOutput(f.root, f.owner)
})
test("cleanup refuses an unrecognized owner and an output symlink", async (t) => {
  const f = fixture(t)
  await assert.rejects(cleanCompilerOutput(f.root, resolve(f.root, "src")), /declared production/)
  mkdirSync(resolve(f.root, "dist"))
  writeFileSync(resolve(f.root, "dist/public.js"), "retained")
  symlinkSync(resolve(f.root, "dist"), resolve(f.owner, "dist"))
  await assert.rejects(cleanCompilerOutput(f.root, f.owner), /symlink/)
  assert.ok(existsSync(resolve(f.root, "dist/public.js")))
})
test("cleanup refuses a workspace directory symlink outside its physical owner", async (t) => {
  const f = fixture(t),
    outside = mkdtempSync(resolve(tmpdir(), "hapsland-outside-owner-"))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  writeFileSync(
    resolve(outside, "package.json"),
    JSON.stringify({ name: "@fixture/owner", private: true, type: "module" })
  )
  mkdirSync(resolve(outside, "dist"))
  writeFileSync(resolve(outside, "dist/retained.js"), "retained")
  rmSync(f.owner, { recursive: true })
  symlinkSync(outside, f.owner)
  await assert.rejects(cleanCompilerOutput(f.root, f.owner), /physical boundary/)
  assert.ok(existsSync(resolve(outside, "dist/retained.js")))
})
