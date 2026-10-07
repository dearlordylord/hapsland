import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { test } from "node:test"
import { readBendToolchain } from "./bend-toolchain.mjs"
const repository = resolve(import.meta.dirname, "..")
const authoritative = readBendToolchain(repository)
test("reads the producer-owned compiler and proof kernel cohort unchanged", () => {
  const manifest = JSON.parse(readFileSync(resolve(repository, "packages/agent-flow-bend/package.json"), "utf8"))
  assert.deepEqual(authoritative, manifest.hapsland.toolchain)
  assert.equal(authoritative.bend.version, "2.0.35")
  assert.equal(authoritative.lean.version, "4.34.0")
})
for (const [name, change] of [
  ["missing cohort", (manifest) => delete manifest.hapsland.toolchain],
  ["compiler range", (manifest) => (manifest.hapsland.toolchain.bend.version = "^2.0.35")],
  ["unknown source", (manifest) => (manifest.hapsland.toolchain.bend.source = "latest")],
  ["proof kernel range", (manifest) => (manifest.hapsland.toolchain.lean.version = "4.x")],
  ["empty archive inventory", (manifest) => (manifest.hapsland.toolchain.platforms = {})],
  ["malformed archive", (manifest) => (manifest.hapsland.toolchain.platforms["linux-arm64"] = null)],
  ["missing digest", (manifest) => delete manifest.hapsland.toolchain.platforms["linux-arm64"].bend],
  ["escaped archive name", (manifest) => (manifest.hapsland.toolchain.platforms["linux-arm64"].leanName = "../linux")]
])
  test(`rejects ${name} before installation or generation`, (t) => {
    const root = mkdtempSync(resolve(tmpdir(), "hapsland-toolchain-metadata-"))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const directory = resolve(root, "packages/agent-flow-bend")
    mkdirSync(directory, { recursive: true })
    const manifest = { hapsland: { toolchain: structuredClone(authoritative) } }
    change(manifest)
    writeFileSync(resolve(directory, "package.json"), JSON.stringify(manifest))
    assert.throws(() => readBendToolchain(root), /Invalid .*toolchain/)
  })

for (const [name, change] of [
  [
    "compiler version array",
    (metadata) => {
      metadata.bend.version = [metadata.bend.version]
    }
  ],
  [
    "proof kernel version array",
    (metadata) => {
      metadata.lean.version = [metadata.lean.version]
    }
  ],
  [
    "compiler source array",
    (metadata) => {
      metadata.bend.source = [metadata.bend.source]
    }
  ],
  [
    "compiler source number",
    (metadata) => {
      metadata.bend.source = 1234567
    }
  ],
  [
    "compiler digest array",
    (metadata) => {
      metadata.platforms["linux-arm64"].bend = [metadata.platforms["linux-arm64"].bend]
    }
  ],
  [
    "proof kernel digest array",
    (metadata) => {
      metadata.platforms["linux-arm64"].lean = [metadata.platforms["linux-arm64"].lean]
    }
  ],
  [
    "proof kernel archive name array",
    (metadata) => {
      metadata.platforms["linux-arm64"].leanName = [metadata.platforms["linux-arm64"].leanName]
    }
  ],
  [
    "proof kernel archive name number",
    (metadata) => {
      metadata.platforms["linux-arm64"].leanName = 123
    }
  ]
])
  test(`rejects coerced ${name}`, (t) => {
    const root = mkdtempSync(resolve(tmpdir(), "hapsland-toolchain-types-"))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const directory = resolve(root, "packages/agent-flow-bend")
    mkdirSync(directory, { recursive: true })
    const metadata = structuredClone(authoritative)
    change(metadata)
    writeFileSync(resolve(directory, "package.json"), JSON.stringify({ hapsland: { toolchain: metadata } }))
    assert.throws(() => readBendToolchain(root), /Invalid .*toolchain/)
  })
