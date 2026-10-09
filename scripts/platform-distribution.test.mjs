import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { npmToolingRequire } from "./npm-tooling.mjs"
import { archiveInventory } from "./archive-inventory.mjs"
import {
  platformFiles,
  splitPlatformArchive,
  homebrewFormula,
  PROFILES,
  verifyPlatformArchive
} from "./platform-distribution.mjs"

test("platform archives retain shared resources and exact selected executable bytes/modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-distribution-test-"))
  try {
    const files = ["package/package.json", "package/bin/launch.sh", "package/dist/pi/extension.js"]
    for (const profile of PROFILES) {
      for (const command of ["hapsland", "hapsland-hook", "hapsland-resident", "hapsland-parser", "hapsland-doctor"])
        files.push(`package/dist/bin/${profile}/${command}`)
      files.push(`package/native/prebuilt/${profile}/inspection-lock.node`)
    }
    for (const path of files) {
      await mkdir(join(root, path, ".."), { recursive: true })
      await writeFile(join(root, path), path, { mode: path.includes("dist/bin/") ? 0o755 : 0o644 })
    }
    const archive = join(root, "original.tgz")
    await npmToolingRequire()("tar").c({ file: archive, cwd: root, gzip: true }, files)
    for (const profile of PROFILES) {
      const output = join(root, `${profile}.tgz`)
      const result = await splitPlatformArchive(archive, output, profile)
      assert.ok(result.bytes > 0)
      const paths = [...(await archiveInventory(output)).keys()]
      assert.ok(paths.includes("package/dist/pi/extension.js"))
      assert.ok(paths.includes(`package/native/prebuilt/${profile}/inspection-lock.node`))
      assert.ok(!paths.some((path) => path.includes(PROFILES.find((other) => other !== profile))))
      assert.equal((await splitPlatformArchive(archive, output, profile)).sha256, result.sha256)
    }
    const inventory = await archiveInventory(archive)
    await writeFile(join(root, "package/dist/bin/darwin-arm64/hapsland"), "modified executable")
    const tampered = join(root, "tampered.tgz")
    await npmToolingRequire()("tar").c(
      { file: tampered, cwd: root, gzip: true },
      platformFiles(inventory, "darwin-arm64")
    )
    await assert.rejects(verifyPlatformArchive(inventory, tampered, "darwin-arm64"), /changed audited bytes/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test("distribution fails closed for unsupported profiles and unknown platform assets", () => {
  assert.throws(() => platformFiles(new Map(), "darwin-x64"), /Unsupported/)
  assert.throws(
    () => platformFiles(new Map([["package/dist/bin/windows-x64/hapsland", {}]]), "darwin-arm64"),
    /Unknown/
  )
})
test("Homebrew formula binds both public URLs to reviewed hashes and exposes every command", () => {
  const manifest = {
    version: "0.1.0",
    archives: PROFILES.map((profile) => ({
      profile,
      filename: `hapsland-0.1.0-${profile}.tar.gz`,
      sha256: "a".repeat(64)
    }))
  }
  const formula = homebrewFormula(manifest)
  assert.match(formula, /hapsland-releases\/releases\/download\/v0\.1\.0/)
  assert.match(formula, /bin.install_symlink/)
  assert.match(formula, /hapsland-hook hapsland-resident hapsland-parser hapsland-doctor/)
  manifest.archives[0].sha256 = "broken"
  assert.throws(() => homebrewFormula(manifest), /Invalid formula asset/)
})
