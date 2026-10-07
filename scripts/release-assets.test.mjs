import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { releaseAssetMappings } from "./release-assets.mjs"
import { publishProduct, revokePublishedProduct } from "./publish-product.mjs"

const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-release-assets-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const path = resolve(root, "packages/rules")
  mkdirSync(resolve(path, "dist/defaults"), { recursive: true })
  mkdirSync(resolve(root, "dist/rules"), { recursive: true })
  writeFileSync(resolve(path, "dist/defaults/current.json"), ' {"rule":"current"}\n')
  writeFileSync(resolve(root, "dist/rules/old.json"), "{}")
  const owner = {
    path,
    manifest: {
      name: "@hapsland/rules",
      hapsland: { releaseAssets: [{ source: "dist/defaults", destination: "rules", extension: ".json" }] }
    }
  }
  return { root, path, owner, graph: { packages: new Map([["rules", owner]]) } }
}

test("publishes exact manifest-owned JSON bytes through the complete release transaction", async (t) => {
  const f = fixture(t)
  const mappings = releaseAssetMappings(f.root, f.graph)
  revokePublishedProduct(f.root)
  await publishProduct(f.root, mappings, async () => {
    assert.deepEqual(releaseAssetMappings(f.root, f.graph), mappings)
  })
  assert.deepEqual(readdirSync(resolve(f.root, "dist/rules")), ["current.json"])
  assert.equal(readFileSync(resolve(f.root, "dist/rules/current.json"), "utf8"), ' {"rule":"current"}\n')
  assert.equal(mappings.length, 1)
  assert.equal(mappings[0].publicPath, "dist/rules/current.json")
})

test("membership drift during staging refuses publication", async (t) => {
  const f = fixture(t)
  const mappings = releaseAssetMappings(f.root, f.graph)
  revokePublishedProduct(f.root)
  await assert.rejects(
    publishProduct(f.root, mappings, async (boundary) => {
      if (boundary === "staged") writeFileSync(resolve(f.path, "dist/defaults/new.json"), "{}")
      assert.deepEqual(releaseAssetMappings(f.root, f.graph), mappings)
    })
  )
  assert.throws(() => readFileSync(resolve(f.root, "dist/rules/current.json")), /ENOENT/)
})

test("changed emitted bytes refuse publication from the earlier inventory", async (t) => {
  const f = fixture(t)
  const mappings = releaseAssetMappings(f.root, f.graph)
  revokePublishedProduct(f.root)
  writeFileSync(resolve(f.path, "dist/defaults/current.json"), "{}")
  await assert.rejects(
    publishProduct(f.root, mappings, async () => {}),
    /source changed/
  )
})

for (const kind of ["invalid-json", "empty", "symlink", "directory"])
  test(`refuses ${kind} input before producing release mappings`, (t) => {
    const f = fixture(t)
    const source = resolve(f.path, "dist/defaults")
    if (kind === "invalid-json") writeFileSync(resolve(source, "current.json"), "bad")
    if (kind === "empty") rmSync(resolve(source, "current.json"))
    if (kind === "symlink") symlinkSync("current.json", resolve(source, "link.json"))
    if (kind === "directory") mkdirSync(resolve(source, "nested.json"))
    assert.throws(() => releaseAssetMappings(f.root, f.graph))
  })

test("rejects overlapping release ownership", (t) => {
  const f = fixture(t)
  f.owner.manifest.hapsland.releaseAssets.push({ ...f.owner.manifest.hapsland.releaseAssets[0] })
  assert.throws(() => releaseAssetMappings(f.root, f.graph), /Overlapping/)
})

test("rejects paths escaping release ownership", (t) => {
  const f = fixture(t)
  f.owner.manifest.hapsland.releaseAssets[0].destination = "../../escape"
  assert.throws(() => releaseAssetMappings(f.root, f.graph), /escapes/)
})
