import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { piRuntimeAssetsDigest } from "./native-pi-profile.mjs"

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "pi-runtime-assets-"))
  for (const path of ["dist/pi", "native/prebuilt/linux-arm64", "schemas", "bin", "docs"])
    mkdirSync(join(root, path), { recursive: true })
  for (const [path, content] of [
    ["dist/pi/extension.js", "export default function() {}"],
    ["native/prebuilt/linux-arm64/parser.node", "native"],
    ["schemas/config.schema.json", "{}"],
    ["bin/launch.sh", "#!/bin/sh"],
    ["package-runtime.json", "{}"]
  ])
    writeFileSync(join(root, path), content)
  return root
}

test("documentation changes do not masquerade as changed native runtime assets", () => {
  const root = fixture()
  try {
    const before = piRuntimeAssetsDigest(root)
    writeFileSync(join(root, "docs", "pi-installation.md"), "updated profile guidance")
    assert.deepEqual(piRuntimeAssetsDigest(root), before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("changed extension, native binding, schema and launcher each invalidate archive reuse", () => {
  for (const path of [
    "dist/pi/extension.js",
    "native/prebuilt/linux-arm64/parser.node",
    "schemas/config.schema.json",
    "bin/launch.sh",
    "package-runtime.json"
  ]) {
    const root = fixture()
    try {
      const before = piRuntimeAssetsDigest(root)
      writeFileSync(join(root, path), "different runtime input")
      assert.notEqual(piRuntimeAssetsDigest(root).sha256, before.sha256)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
