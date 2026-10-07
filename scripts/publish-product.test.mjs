import test from "node:test"
import assert from "node:assert/strict"
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileEvidence } from "./compiler-evidence.mjs"
import { publishProduct, revokePublishedProduct } from "./publish-product.mjs"

const fixture = (t) => {
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-publication-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const artifact = (name, publicPath, contents, mode = 0o644) => {
    const path = resolve(root, "packages/entry/artifacts", name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
    chmodSync(path, mode)
    return { ...fileEvidence(root, path), publicPath }
  }
  const mappings = [
    artifact("command", "dist/bin/linux-arm64/hapsland-hook", "current command", 0o755),
    artifact("entry.js", "dist/pi/entry.js", "export const current = true"),
    artifact("helper.node", "native/prebuilt/linux-arm64/helper.node", "current native")
  ]
  return { root, mappings }
}

test("publishes exact release inventory and replaces native files while preserving open old inodes", async (t) => {
  const { root, mappings } = fixture(t)
  mkdirSync(resolve(root, "dist/old"), { recursive: true })
  writeFileSync(resolve(root, "dist/old/stale.js"), "stale")
  const native = resolve(root, "native/prebuilt/linux-arm64/helper.node")
  mkdirSync(dirname(native), { recursive: true })
  writeFileSync(native, "old native")
  writeFileSync(resolve(dirname(native), "obsolete.node"), "obsolete")
  const fd = openSync(native, "r")
  t.after(() => closeSync(fd))
  revokePublishedProduct(root)
  let checks = 0
  const inventory = await publishProduct(root, mappings, async () => {
    checks++
  })
  assert.equal(checks, 3)
  assert.equal(inventory.length, 2)
  assert.equal(existsSync(resolve(root, "dist/old/stale.js")), false)
  assert.equal(readFileSync(native, "utf8"), "current native")
  assert.equal(readFileSync(fd, "utf8"), "old native")
  assert.deepEqual(readdirSync(dirname(native)), ["helper.node"])
  for (const mapping of mappings) {
    const actual = fileEvidence(root, resolve(root, mapping.publicPath))
    assert.equal(actual.mode, mapping.mode)
    assert.equal(actual.sha256, mapping.sha256)
  }
  assert.deepEqual(readdirSync(resolve(root, ".test-runs")), [])
})

for (const failedCheck of [1, 2, 3])
  test(`fresh guard failure at boundary ${failedCheck} leaves no publishable release`, async (t) => {
    const { root, mappings } = fixture(t)
    revokePublishedProduct(root)
    let checks = 0
    await assert.rejects(
      publishProduct(root, mappings, async () => {
        if (++checks === failedCheck) throw new Error("Inputs changed")
      }),
      /Inputs changed/
    )
    assert.equal(existsSync(resolve(root, "dist")), false)
    assert.deepEqual(readdirSync(resolve(root, ".test-runs")), [])
  })

test("rejects source drift during admission before exposing the staged release", async (t) => {
  const { root, mappings } = fixture(t)
  let checks = 0
  await assert.rejects(
    publishProduct(root, mappings, async () => {
      if (++checks === 2) writeFileSync(resolve(root, mappings[0].path), "changed artifact")
    }),
    /Publication source changed/
  )
  assert.equal(existsSync(resolve(root, "dist")), false)
})

test("refuses artifact drift in the final guard before exposing dist", async (t) => {
  const { root, mappings } = fixture(t)
  await assert.rejects(
    publishProduct(root, mappings, async (boundary) => {
      assert.equal(existsSync(resolve(root, "dist")), false)
      if (boundary === "publish") writeFileSync(resolve(root, mappings[0].path), "late artifact change")
    }),
    /Publication source changed/
  )
  assert.equal(existsSync(resolve(root, "dist")), false)
})

for (const publicPath of ["../escape", "dist/../escape", "native/prebuilt/linux-arm64/../../escape", "/tmp/escape"])
  test(`rejects escaping destination ${publicPath}`, async (t) => {
    const { root, mappings } = fixture(t)
    await assert.rejects(
      publishProduct(root, [{ ...mappings[0], publicPath }], async () => {}),
      /publication path|ownership/
    )
    assert.equal(existsSync(resolve(root, "dist")), false)
  })

test("rejects competing owners for one destination", async (t) => {
  const { root, mappings } = fixture(t)
  await assert.rejects(
    publishProduct(root, [...mappings, mappings[0]], async () => {}),
    /Duplicate/
  )
})
