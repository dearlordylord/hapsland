import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareReleaseArchive } from "./release-archive.mjs"
import {
  RELEASE_ARCHIVE_TIMEOUT_MS,
  PRODUCT_COMPILATION_TIMEOUT_MS,
  PRODUCT_ASSEMBLY_TIMEOUT_MS
} from "./build-deadlines.mjs"

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-release-archive-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync("git", ["init", "-q", root])
  await writeFile(join(root, ".gitignore"), "dist/\n.test-runs/\n")
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "release-archive-fixture",
      version: "1.0.0",
      files: ["dist"],
      scripts: { build: "node build.mjs", "verify:release-native": "node validate.mjs" }
    })
  )
  await writeFile(
    join(root, "build.mjs"),
    `import {mkdirSync,writeFileSync} from 'node:fs';
    if(!process.env.HAPSLAND_BUILD_LOCK_LEASE || process.env.HAPSLAND_BUILD_PROFILE) process.exit(1);
    mkdirSync('dist',{recursive:true});writeFileSync('dist/main.js','console.log("fixture")');`
  )
  await writeFile(join(root, "validate.mjs"), "import {readFileSync} from 'node:fs';readFileSync('dist/main.js');")
  return root
}

test("release budgets accommodate the standalone producer waves and archive work", () => {
  assert.ok(PRODUCT_ASSEMBLY_TIMEOUT_MS > 5 * 120_000)
  assert.ok(RELEASE_ARCHIVE_TIMEOUT_MS > PRODUCT_COMPILATION_TIMEOUT_MS + PRODUCT_ASSEMBLY_TIMEOUT_MS)
  assert.ok(Number.isSafeInteger(RELEASE_ARCHIVE_TIMEOUT_MS))
})

test("release runner builds, validates and packs through the owned process runner", async (t) => {
  const root = await fixture(t)
  const artifact = await prepareReleaseArchive({ root })
  assert.ok((await readFile(artifact.archivePath)).length > 0)
  assert.match(artifact.archiveDigest, /^[a-f0-9]{64}$/)
  await assert.rejects(readFile(join(root, ".test-runs/product-build/lease.json")), /ENOENT/)
})

test("release deadline aborts preparation and releases the build lease", async (t) => {
  const root = await fixture(t)
  await mkdir(join(root, ".test-runs"), { recursive: true })
  await assert.rejects(prepareReleaseArchive({ root, deadline: Date.now() - 1 }), /deadline exceeded/)
  assert.deepEqual(await readdir(join(root, ".test-runs")), [])
})

test("release deadline stops a running build before releasing its lease", async (t) => {
  const root = await fixture(t)
  await writeFile(
    join(root, "build.mjs"),
    "import {writeFileSync} from 'node:fs';writeFileSync('.test-runs/build-pid',String(process.pid));setInterval(()=>{},1000);"
  )
  await assert.rejects(prepareReleaseArchive({ root, deadline: Date.now() + 3000 }), /deadline exceeded/)
  const pid = Number(await readFile(join(root, ".test-runs/build-pid"), "utf8"))
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  await assert.rejects(readFile(join(root, ".test-runs/product-build/lease.json")), /ENOENT/)
})
