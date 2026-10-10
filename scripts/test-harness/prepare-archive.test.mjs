import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { prepareArchive } from "./prepare-archive.mjs"
import { packageSourceIdentity } from "../artifact-store.mjs"
import { sourceIdentity } from "./source-identity.mjs"

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-archive-stage-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync("git", ["init", "--quiet"], { cwd: root })
  await writeFile(join(root, ".gitignore"), "dist/\ncoverage/\n.test-runs/\n")
  await writeFile(join(root, "package.json"), JSON.stringify({ files: ["src", "README.md"] }))
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/source.ts"), "before")
  execFileSync("git", ["add", "."], { cwd: root })
  const runDirectory = join(root, ".test-runs", "one")
  return { root, runDirectory, toolchain: { platform: process.platform, architecture: process.arch, fixture: true } }
}

test("source identity observes dirty, new and deleted verification inputs but excludes generated outputs", async (t) => {
  const { root } = await fixture(t)
  const original = await sourceIdentity(root)
  await mkdir(join(root, "dist"))
  await writeFile(join(root, "dist", "generated.js"), "output")
  assert.equal(await sourceIdentity(root), original)
  await writeFile(join(root, "src/source.ts"), "after")
  const dirty = await sourceIdentity(root)
  assert.notEqual(dirty, original)
  await writeFile(join(root, "src/extra.ts"), "new input")
  const untracked = await sourceIdentity(root)
  assert.notEqual(untracked, dirty)
  await rm(join(root, "src/source.ts"))
  assert.notEqual(await sourceIdentity(root), untracked)
})

test("builds and packs once, records fresh archive evidence, refuses an occupied run directory", async (t) => {
  const settings = await fixture(t)
  const calls = []
  const runStage = async (stage) => {
    calls.push(stage)
    if (stage.name === "package-build") {
      await mkdir(join(settings.root, "dist"))
      await writeFile(join(settings.root, "dist/main"), "built runtime")
      await mkdir(join(settings.root, "quint-specs"))
      await writeFile(join(settings.root, "quint-specs", "quint.lock"), "parallel survey")
    }
    if (stage.name === "package-pack") await writeFile(join(stage.args.at(-1), "fixture.tgz"), "archive bytes")
    return { exitCode: 0, signal: null, timedOut: false }
  }
  const result = await prepareArchive({ ...settings, runStage })
  assert.deepEqual(
    calls.map((stage) => stage.name),
    ["package-build", "package-validation", "package-pack"]
  )
  assert.equal(calls[2].command, process.execPath)
  assert.equal(calls[2].args[0], join(settings.root, "scripts/dev-pack.mjs"))
  assert.equal(result.sourceDigest, await packageSourceIdentity(settings.root))
  assert.match(result.archiveDigest, /^[a-f0-9]{64}$/)
  assert.deepEqual(JSON.parse(await readFile(join(settings.runDirectory, "archive.json"), "utf8")), result)
  await assert.rejects(prepareArchive({ ...settings, runStage }), /must be empty/)
  assert.equal(calls.length, 3)
})

test("source mutation during build rejects the archive before packing", async (t) => {
  const settings = await fixture(t)
  const calls = []
  await assert.rejects(
    prepareArchive({
      ...settings,
      runStage: async (stage) => {
        calls.push(stage.name)
        await writeFile(join(settings.root, "src/source.ts"), "concurrent change")
        return { exitCode: 0 }
      }
    }),
    /inputs changed/
  )
  assert.deepEqual(calls, ["package-build"])
})

test("failed build stops packaging and points to its log", async (t) => {
  const settings = await fixture(t)
  const calls = []
  await assert.rejects(
    prepareArchive({
      ...settings,
      runStage: async (stage) => {
        calls.push(stage.name)
        return { exitCode: 1, logPath: "/tmp/build.log" }
      }
    }),
    /build.log/
  )
  assert.deepEqual(calls, ["package-build"])
})

test("submodule identity includes checkout revision and dirty or untracked bytes", async (t) => {
  const { root } = await fixture(t)
  const upstream = await mkdtemp(join(tmpdir(), "hapsland-submodule-"))
  t.after(() => rm(upstream, { recursive: true, force: true }))
  const git = (directory, args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" })
  git(upstream, ["init", "--quiet"])
  await writeFile(join(upstream, "input.ts"), "initial")
  git(upstream, ["add", "."])
  git(upstream, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "initial"])
  git(root, ["-c", "protocol.file.allow=always", "submodule", "add", "--quiet", upstream, "vendor/module"])
  const initial = await sourceIdentity(root)
  const checkout = join(root, "vendor/module")
  await writeFile(join(checkout, "input.ts"), "dirty")
  const dirty = await sourceIdentity(root)
  assert.notEqual(dirty, initial)
  await writeFile(join(checkout, "extra.ts"), "untracked")
  assert.notEqual(await sourceIdentity(root), dirty)
  await rm(join(checkout, "extra.ts"))
  git(checkout, ["add", "."])
  git(checkout, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "next"])
  assert.notEqual(await sourceIdentity(root), dirty)
  git(root, ["submodule", "deinit", "--force", "vendor/module"])
  await assert.rejects(sourceIdentity(root), /submodule is missing or uninitialized/)
})

test("unrelated tracked and new documents do not invalidate verification, but published docs do", async (t) => {
  const { root } = await fixture(t)
  await mkdir(join(root, "docs"))
  await writeFile(join(root, "docs", "research.md"), "research before")
  execFileSync("git", ["add", "."], { cwd: root })
  const initial = await sourceIdentity(root)
  await writeFile(join(root, "docs", "research.md"), "research after")
  await mkdir(join(root, "quint-specs"))
  await writeFile(join(root, "quint-specs", "quint.lock"), "unrelated concurrent survey")
  assert.equal(await sourceIdentity(root), initial)
  await writeFile(join(root, "package.json"), JSON.stringify({ files: ["docs/install.md"] }))
  await writeFile(join(root, "docs", "install.md"), "published before")
  const published = await sourceIdentity(root)
  await writeFile(join(root, "docs", "install.md"), "published after")
  assert.notEqual(await sourceIdentity(root), published)
  await rm(join(root, "docs", "install.md"))
  assert.notEqual(await sourceIdentity(root), published)
})

test("changes to manifests, test fixtures and newly added tooling remain verification inputs", async (t) => {
  const { root } = await fixture(t)
  for (const path of [
    "package-runtime.json",
    "bun.lock",
    "tsconfig.build.json",
    ".hapsland.jsonc",
    "src/test-support/fixtures/input.json",
    "scripts/new-check.mjs"
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    const before = await sourceIdentity(root)
    await writeFile(join(root, path), "new input")
    assert.notEqual(await sourceIdentity(root), before, path)
  }
})
test("exact generated-output exclusions preserve foreign supplier and authored-input evidence", async (t) => {
  const { root } = await fixture(t)
  for (const name of [
    "native/prebuilt/linux-arm64/helper",
    "native/prebuilt/darwin-arm64/helper",
    "native/prebuilt/linux-arm64/tree-sitter/binding.node",
    "packages/owner/dist/module.js"
  ]) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), "before")
  }
  const options = {
    excludedFiles: ["native/prebuilt/linux-arm64/helper"],
    excludedDirectories: ["packages/owner/dist"]
  }
  const before = await sourceIdentity(root, undefined, undefined, options)
  await writeFile(join(root, "native/prebuilt/linux-arm64/helper"), "regenerated")
  await writeFile(join(root, "packages/owner/dist/module.js"), "regenerated")
  assert.equal(await sourceIdentity(root, undefined, undefined, options), before)
  await writeFile(join(root, "native/prebuilt/darwin-arm64/helper"), "changed supplier")
  assert.notEqual(await sourceIdentity(root, undefined, undefined, options), before)
  await writeFile(join(root, "native/prebuilt/darwin-arm64/helper"), "before")
  await writeFile(join(root, "native/prebuilt/linux-arm64/tree-sitter/binding.node"), "changed parser supplier")
  assert.notEqual(await sourceIdentity(root, undefined, undefined, options), before)
})
test("output exclusions do not widen the default verification input scope", async (t) => {
  const { root } = await fixture(t),
    options = { excludedFiles: ["native/generated-helper"] }
  await mkdir(join(root, "docs"))
  const before = await sourceIdentity(root, undefined, undefined, options)
  await writeFile(join(root, "docs/unused-research.md"), "unrelated")
  assert.equal(await sourceIdentity(root, undefined, undefined, options), before)
  assert.throws(
    () => sourceIdentity(root, undefined, undefined, { excludedDirectories: ["../src"] }),
    /exact relative owner paths/
  )
})
