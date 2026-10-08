import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { artifactStoreDirectory } from "./artifact-store.mjs"
import { releaseSourceTree } from "./release-inputs.mjs"
import { retainReleaseAudit, readPreparedRelease } from "./prepared-release.mjs"
import { ensurePinnedBunLauncher, resolveBunRuntime } from "./pinned-bun.mjs"

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
const fixture = (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-release-process-")))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, "scripts"))
  mkdirSync(join(root, "tools"))
  writeFileSync(join(root, ".gitignore"), "tools/\ninvoked\n")
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@hapsland/hapsland", version: "0.1.0", packageManager: "bun@1.3.14" })
  )
  git(root, "init", "-qb", "master")
  git(root, "config", "user.name", "Fixture")
  git(root, "config", "user.email", "fixture@example.invalid")
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "source")
  const pin = {
    packageName: "@hapsland/hapsland",
    version: "0.1.0",
    tag: "latest",
    repositoryUrl: "https://github.com/dearlordylord/hapsland.git",
    sourceCommit: git(root, "rev-parse", "HEAD"),
    archiveSha256: "a".repeat(64)
  }
  writeFileSync(join(root, "scripts/npm-release-pin.json"), JSON.stringify(pin))
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "pin")
  git(root, "update-ref", "refs/remotes/origin/master", git(root, "rev-parse", "HEAD"))
  for (const tool of ["npm", "mise"])
    writeFileSync(join(root, "tools", tool), "#!/bin/sh\ntouch invoked\nexit 1\n", { mode: 0o755 })
  return { root, pin }
}

test("obsolete release pin fails before npm, dependency installation or build", (t) => {
  const { root } = fixture(t)
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "local-release.mjs")], {
    cwd: root,
    env: { ...process.env, PATH: `${join(root, "tools")}:${process.env.PATH}` },
    encoding: "utf8",
    timeout: 5000
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /release:prepare/)
  assert.equal(existsSync(join(root, "invoked")), false)
})

async function preparedFixture(t) {
  const f = fixture(t)
  const bytes = Buffer.from("reviewed immutable archive")
  const archiveSha256 = createHash("sha256").update(bytes).digest("hex")
  const sourceCommit = git(f.root, "rev-parse", "HEAD")
  const buildPlatform = "darwin-arm64"
  const sourceTreeSha256 = releaseSourceTree(f.root, sourceCommit, buildPlatform)
  const audit = {
    format: 1,
    package: "@hapsland/hapsland@0.1.0",
    repositoryUrl: f.pin.repositoryUrl,
    commit: sourceCommit,
    sourceTreeSha256,
    archiveSha256,
    buildPlatform,
    toolchain: { node: "v24.20.0", bun: "1.3.14" },
    status: "audited"
  }
  const auditSha256 = await retainReleaseAudit(f.root, audit)
  const pin = { ...f.pin, format: 1, sourceCommit, archiveSha256, sourceTreeSha256, auditSha256, buildPlatform }
  const directory = join(await artifactStoreDirectory(f.root), "archives", archiveSha256)
  mkdirSync(directory, { recursive: true })
  const archivePath = join(directory, "hapsland-hapsland-0.1.0.tgz")
  writeFileSync(archivePath, bytes)
  writeFileSync(join(f.root, "scripts/npm-release-pin.json"), JSON.stringify(pin))
  git(f.root, "add", ".")
  git(f.root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "prepared pin")
  git(f.root, "update-ref", "refs/remotes/origin/master", git(f.root, "rev-parse", "HEAD"))
  return { ...f, pin, bytes, archivePath }
}
const invokeRelease = (f, extraArgs = []) =>
  spawnSync(process.execPath, [...extraArgs, resolve(import.meta.dirname, "local-release.mjs")], {
    cwd: f.root,
    env: { ...process.env, PATH: `${join(f.root, "tools")}:${process.env.PATH}` },
    encoding: "utf8",
    timeout: 5000
  })

test("pin-only commit admits the audited archive without compiler receipts or dependencies", async (t) => {
  const f = await preparedFixture(t)
  assert.equal((await readPreparedRelease(f.root, f.pin)).archivePath, f.archivePath)
  assert.equal(existsSync(join(f.root, "node_modules")), false)
  assert.equal(existsSync(join(f.root, "dist")), false)
})

for (const path of ["package.json", "scripts/new-source.mjs", "README.md", "bun.lock"])
  test(`committed ${path} change rejects publication before npm`, async (t) => {
    const f = await preparedFixture(t)
    if (path === "package.json") {
      const manifest = JSON.parse(readFileSync(join(f.root, path), "utf8"))
      manifest.description = "changed packaged input"
      writeFileSync(join(f.root, path), JSON.stringify(manifest))
    } else writeFileSync(join(f.root, path), "changed input")
    git(f.root, "add", ".")
    git(f.root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "changed sources")
    git(f.root, "update-ref", "refs/remotes/origin/master", git(f.root, "rev-parse", "HEAD"))
    const result = invokeRelease(f)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /pin is stale/)
    assert.equal(existsSync(join(f.root, "invoked")), false)
  })

for (const kind of ["missing archive", "corrupt archive", "missing audit", "corrupt audit"])
  test(`${kind} rejects publication before npm`, async (t) => {
    const f = await preparedFixture(t)
    const path = kind.includes("archive")
      ? f.archivePath
      : join(await artifactStoreDirectory(f.root), "release-audits", `${f.pin.auditSha256}.json`)
    if (kind.startsWith("missing")) rmSync(path)
    else writeFileSync(path, "corrupted")
    const result = invokeRelease(f)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /release:prepare/)
    assert.equal(existsSync(join(f.root, "invoked")), false)
  })

test("publisher uploads the audited bytes without installing or building", async (t) => {
  const f = await preparedFixture(t)
  const npm = `#!/usr/bin/env node
import {writeFileSync,existsSync,readFileSync,appendFileSync} from 'node:fs';
const args=process.argv.slice(2);appendFileSync('invoked',JSON.stringify(args)+'\\n');
if(args[0]==='whoami') console.log('fixture');
else if(args[0]==='publish') {writeFileSync('tools/published',readFileSync(args[1]));}
else if(args[0]==='view' && args[2]==='version') console.log('0.1.0');
else if(args[0]==='view' && existsSync('tools/published')) console.log(JSON.stringify('https://registry.npmjs.org/fixture.tgz'));
else if(args[0]==='view') {console.error('E404');process.exitCode=1;}
else process.exitCode=90;
`
  writeFileSync(join(f.root, "tools/npm"), npm, { mode: 0o755 })
  const preload = join(f.root, "tools/registry.mjs")
  writeFileSync(
    preload,
    `import {readFileSync} from 'node:fs';globalThis.fetch=async (url)=>{if(url!=='https://registry.npmjs.org/fixture.tgz')throw Error('unexpected URL');return new Response(readFileSync('tools/published'));};`
  )
  const result = invokeRelease(f, ["--import", preload])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readFileSync(join(f.root, "tools/published")), f.bytes)
  const calls = readFileSync(join(f.root, "invoked"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.equal(calls.filter((args) => args[0] === "publish").length, 1)
  assert.equal(
    calls.some((args) => ["run", "install", "pack"].includes(args[0])),
    false
  )
  assert.match(result.stdout, /registry SHA-256 matches/)
})

test("dirty preparation rejects before dependency installation or build", (t) => {
  const f = fixture(t)
  writeFileSync(join(f.root, "README.md"), "uncommitted change")
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "prepare-release.mjs")], {
    cwd: f.root,
    env: { ...process.env, PATH: `${join(f.root, "tools")}:${process.env.PATH}` },
    encoding: "utf8",
    timeout: 5000
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /clean committed checkout/)
  assert.equal(existsSync(join(f.root, "invoked")), false)
})

test("an audit for another toolchain is rejected even when its file checksum matches", async (t) => {
  const f = await preparedFixture(t)
  const artifact = await readPreparedRelease(f.root, f.pin)
  const auditSha256 = await retainReleaseAudit(f.root, {
    ...artifact.audit,
    toolchain: { ...artifact.audit.toolchain, bun: "0.0.0" }
  })
  await assert.rejects(readPreparedRelease(f.root, { ...f.pin, auditSha256 }), /audit does not match/)
})

test("source changes during npm authentication prevent upload", async (t) => {
  const f = await preparedFixture(t)
  writeFileSync(
    join(f.root, "tools/npm"),
    `#!/usr/bin/env node
import {writeFileSync,existsSync,readFileSync,appendFileSync} from 'node:fs';
const args=process.argv.slice(2);appendFileSync('invoked',JSON.stringify(args)+'\\n');
if(args[0]==='whoami'){writeFileSync('README.md','concurrent source change');console.log('fixture');}
else if(args[0]==='view'){console.error('E404');process.exitCode=1;}
else process.exitCode=90;
`,
    { mode: 0o755 }
  )
  const result = invokeRelease(f)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /inputs changed before publication/)
  assert.equal(readFileSync(join(f.root, "invoked"), "utf8").includes('"publish"'), false)
})

test("frozen dependency launcher is initialized from the verified pinned Bun without postinstall", (t) => {
  const f = fixture(t)
  const directory = join(f.root, "node_modules/bun")
  mkdirSync(join(directory, "bin"), { recursive: true })
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "bun", version: "1.3.14", bin: { bun: "bin/bun.exe" } })
  )
  const path = join(directory, "bin/bun.exe")
  writeFileSync(path, "#!/bin/sh\nexit 90\n", { mode: 0o755 })
  assert.equal(ensurePinnedBunLauncher(f.root, resolveBunRuntime()), path)
  assert.equal(execFileSync(path, ["--version"], { encoding: "utf8" }).trim(), "1.3.14")
  assert.equal(existsSync(join(f.root, "invoked")), false)
})
