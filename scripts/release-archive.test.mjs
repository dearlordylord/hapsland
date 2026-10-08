import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareReleaseArchive, auditPreparedArchive } from "./release-archive.mjs"
import { bendProducerEnvironmentKeys } from "./bend-producer.mjs"
import {
  RELEASE_ARCHIVE_TIMEOUT_MS,
  STANDALONE_PRODUCER_TIMEOUT_MS,
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
  assert.ok(STANDALONE_PRODUCER_TIMEOUT_MS > 165_626)
  assert.ok(PRODUCT_ASSEMBLY_TIMEOUT_MS > 5 * STANDALONE_PRODUCER_TIMEOUT_MS)
  assert.ok(RELEASE_ARCHIVE_TIMEOUT_MS > PRODUCT_COMPILATION_TIMEOUT_MS + PRODUCT_ASSEMBLY_TIMEOUT_MS)
  assert.ok(Number.isSafeInteger(RELEASE_ARCHIVE_TIMEOUT_MS))
})

test("archive audit runs in an isolated declared Bend environment and preserves caller environment", async (t) => {
  const root = await fixture(t)
  await mkdir(join(root, ".test-runs"))
  await mkdir(join(root, "scripts"))
  const environment = Object.fromEntries(bendProducerEnvironmentKeys.map((key) => [key, process.env[key] ?? null]))
  environment.PATH = `/declared-build-path:${process.env.PATH}`
  await writeFile(join(root, ".test-runs/bend-toolchain.json"), JSON.stringify({ environment }))
  await writeFile(
    join(root, "scripts/audit-release-tarball.mjs"),
    `
    const declared=JSON.parse(process.env.HAPSLAND_BEND_PRODUCER_ENV);
    const options=JSON.parse(process.argv[4]);
    process.stdout.write(JSON.stringify({path:declared.PATH,archive:process.argv[2],commit:process.argv[3],coordinates:options.coordinates}));
  `
  )
  const before = process.env.HAPSLAND_BEND_PRODUCER_ENV
  const record = await auditPreparedArchive({
    root,
    archivePath: "fixture.tgz",
    commit: "source",
    coordinates: { version: "1.0.0" },
    deadline: Date.now() + 10000
  })
  assert.deepEqual(record, {
    path: environment.PATH,
    archive: "fixture.tgz",
    commit: "source",
    coordinates: { version: "1.0.0" }
  })
  assert.equal(process.env.HAPSLAND_BEND_PRODUCER_ENV, before)
  await writeFile(
    join(root, ".test-runs/bend-toolchain.json"),
    JSON.stringify({ environment: { PATH: process.env.PATH } })
  )
  await assert.rejects(auditPreparedArchive({ root, deadline: Date.now() + 10000 }), /environment keys/)
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
