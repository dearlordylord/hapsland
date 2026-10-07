import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { generateReleaseIdentity } from "./generate-release-identity.mjs"

const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-release-identity-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const roles = ["cli", "doctor", "hook", "parser", "resident"]
  const workspaces = ["packages/runtime-environment", ...roles.map((role) => `packages/${role}`)]
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@hapsland/hapsland",
      version: "0.1.0",
      packageManager: "bun@1.3.14",
      catalog: { bun: "1.3.14", "@types/bun": "1.3.14" },
      workspaces
    })
  )
  for (const directory of workspaces) {
    mkdirSync(join(root, directory, "src/runtime"), { recursive: true })
    const name = directory.slice("packages/".length)
    writeFileSync(
      join(root, directory, "package.json"),
      JSON.stringify({
        name: `@hapsland/${name}`,
        private: true,
        type: "module",
        ...(roles.includes(name)
          ? { hapsland: { role: name, entry: "src/main.ts", executable: `hapsland-${name}` } }
          : {})
      })
    )
  }
  return root
}
const modify = (root, change) => {
  const path = join(root, "package.json")
  const manifest = JSON.parse(readFileSync(path, "utf8"))
  change(manifest)
  writeFileSync(path, JSON.stringify(manifest))
}

test("runtime Bun version is a checked projection of the single shared catalog authority", (t) => {
  const root = fixture(t)
  const first = generateReleaseIdentity(root)
  assert.match(readFileSync(first.path, "utf8"), /export const BUN_VERSION = "1\.3\.14" as const/)
  generateReleaseIdentity(root, true)
  modify(root, (manifest) => {
    manifest.catalog.bun = "1.3.15"
    manifest.catalog["@types/bun"] = "1.3.15"
    manifest.packageManager = "bun@1.3.15"
  })
  assert.throws(() => generateReleaseIdentity(root, true), /Stale release identity/)
  generateReleaseIdentity(root)
  assert.match(readFileSync(first.path, "utf8"), /export const BUN_VERSION = "1\.3\.15" as const/)
})

test("Bun package manager or companion drift fails before replacing runtime identity", (t) => {
  for (const change of [
    (manifest) => {
      manifest.packageManager = "bun@1.3.15"
    },
    (manifest) => {
      manifest.catalog["@types/bun"] = "1.3.15"
    },
    (manifest) => {
      delete manifest.catalog.bun
    },
    (manifest) => {
      manifest.catalog.bun = "^1.3.14"
    }
  ]) {
    const root = fixture(t)
    const { path } = generateReleaseIdentity(root)
    const before = readFileSync(path)
    modify(root, change)
    assert.throws(() => generateReleaseIdentity(root), /authoritative Bun|catalog dependency|exact version/)
    assert.deepEqual(readFileSync(path), before)
  }
})
