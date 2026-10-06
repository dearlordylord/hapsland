import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  artifactIdentities,
  artifactStoreDirectory,
  ensurePackageArtifact,
  ensureExecutionArtifact,
  treeInventory
} from "./artifact-store.mjs"

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000 }).trim()
async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), "hapsland-artifacts-"))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const root = join(temp, "main")
  await mkdir(root)
  git(root, "init", "-q")
  git(root, "config", "user.name", "Artifact fixture")
  git(root, "config", "user.email", "fixture@example.invalid")
  await writeFile(join(root, ".gitignore"), "dist/\nnode_modules/\n")
  await writeFile(join(root, "package.json"), JSON.stringify({ files: ["src", "README.md", "dist"] }))
  await writeFile(join(root, "README.md"), "packaged guidance")
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/main.ts"), "source")
  git(root, "add", ".")
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture")
  const dependencies = join(temp, "dependencies")
  await mkdir(dependencies)
  await writeFile(join(dependencies, "dependency.js"), "dependency")
  await symlink(dependencies, join(root, "node_modules"), "dir")
  const linked = join(temp, "linked")
  git(root, "worktree", "add", "--detach", linked)
  await symlink(dependencies, join(linked, "node_modules"), "dir")
  const toolchain = { platform: process.platform, architecture: process.arch, bun: "fixture" }
  const calls = []
  const runStage = async (stage) => {
    calls.push(stage.name)
    if (stage.name === "package-build") {
      await mkdir(join(stage.cwd, "dist"), { recursive: true })
      await writeFile(join(stage.cwd, "dist/main"), "compiled")
    } else await writeFile(join(stage.args.at(-1), "fixture.tgz"), "archive")
    return { exitCode: 0 }
  }
  return { root, linked, dependencies, toolchain, calls, runStage }
}

test("immutable execution artifacts reuse across worktrees without running package stages", async (t) => {
  const f = await fixture(t)
  let builds = 0
  const identify = async () => ({ identity: "a".repeat(64), sourceDigest: "fixture-source" })
  const prepare = async (directory) => {
    builds++
    await writeFile(join(directory, "cli.mjs"), "portable execution")
  }
  const request = (root) =>
    ensureExecutionArtifact({
      root,
      kind: "source-runtime",
      identify,
      prepare,
      destination: (identity) => join(root, ".test-runs/source-runtime", identity)
    })
  const [first, second] = await Promise.all([request(f.root), request(f.linked)])
  assert.equal(builds, 1)
  assert.equal(Number(first.reused) + Number(second.reused), 1)
  assert.notEqual(first.directory, second.directory)
  assert.equal(await readFile(join(second.directory, "cli.mjs"), "utf8"), "portable execution")
  assert.deepEqual(f.calls, [])
  await ensurePackageArtifact(f)
  await ensurePackageArtifact(f)
  assert.equal(await readFile(join(first.directory, "cli.mjs"), "utf8"), "portable execution")
  await writeFile(join(second.directory, "cli.mjs"), "corrupted")
  await assert.rejects(request(f.linked), /Materialized execution artifact differs/)
  assert.equal(await readFile(join(first.directory, "cli.mjs"), "utf8"), "portable execution")
})

test("execution source changes and preparation failures never publish manifests", async (t) => {
  const f = await fixture(t)
  let identity = "b".repeat(64)
  const options = {
    root: f.root,
    kind: "source-runtime",
    identify: async () => ({ identity }),
    destination: (identity) => join(f.root, "dist/source", identity)
  }
  await assert.rejects(
    ensureExecutionArtifact({
      ...options,
      prepare: async (directory) => {
        await writeFile(join(directory, "cli.mjs"), "mixed sources")
        identity = "c".repeat(64)
      }
    }),
    /Execution inputs changed during preparation/
  )
  const store = await artifactStoreDirectory(f.root)
  assert.equal((await readdir(join(store, "source-runtime", "b".repeat(64)))).includes("artifact.json"), false)
  await assert.rejects(
    ensureExecutionArtifact({
      ...options,
      prepare: async () => {
        throw new Error("build failed")
      }
    }),
    /build failed/
  )
  assert.equal((await readdir(join(store, "source-runtime", identity))).includes("artifact.json"), false)
})

test("identical worktrees share one checked build and package under concurrent use", async (t) => {
  const f = await fixture(t)
  assert.equal(await artifactStoreDirectory(f.root), await artifactStoreDirectory(f.linked))
  assert.deepEqual(await artifactIdentities(f.root, f.toolchain), await artifactIdentities(f.linked, f.toolchain))
  const [first, second] = await Promise.all([ensurePackageArtifact(f), ensurePackageArtifact({ ...f, root: f.linked })])
  assert.equal(first.archivePath, second.archivePath)
  assert.deepEqual(f.calls, ["package-build", "package-pack"])
  assert.equal(Number(first.buildReused) + Number(second.buildReused), 1)
  assert.equal(Number(first.packageReused) + Number(second.packageReused), 1)
  assert.equal(await readFile(join(f.linked, "dist/main"), "utf8"), "compiled")
})

test("packaged documentation repacks without recompilation; source, dependencies and toolchain invalidate builds", async (t) => {
  const f = await fixture(t)
  const first = await ensurePackageArtifact(f)
  await writeFile(join(f.root, "README.md"), "new packaged guidance")
  const docs = await ensurePackageArtifact(f)
  assert.equal(docs.buildReused, true)
  assert.equal(docs.packageReused, false)
  assert.equal(first.buildIdentity, docs.buildIdentity)
  await writeFile(join(f.root, "src/main.ts"), "changed source")
  assert.equal((await ensurePackageArtifact(f)).buildReused, false)
  await writeFile(join(f.dependencies, "dependency.js"), "changed dependency")
  assert.equal((await ensurePackageArtifact(f)).buildReused, false)
  assert.equal(
    (await ensurePackageArtifact({ ...f, toolchain: { ...f.toolchain, bun: "changed" } })).buildReused,
    false
  )
  assert.equal(f.calls.filter((stage) => stage === "package-build").length, 4)
})

test("failed packing never publishes a candidate and a later attempt can recover", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    ensurePackageArtifact({
      ...f,
      runStage: async (stage) => {
        await f.runStage(stage)
        return { exitCode: stage.name === "package-pack" ? 1 : 0, logPath: "failed-pack.log" }
      }
    }),
    /failed-pack.log/
  )
  const key = await artifactIdentities(f.root, f.toolchain)
  const directory = join(await artifactStoreDirectory(f.root), "packages", key.package)
  assert.equal((await readdir(directory)).includes("artifact.json"), false)
  const recovered = await ensurePackageArtifact(f)
  assert.equal(recovered.buildReused, true)
  assert.equal(recovered.packageReused, false)
})

test("changed inputs during a build cannot publish a build or archive", async (t) => {
  const f = await fixture(t)
  const key = await artifactIdentities(f.root, f.toolchain)
  await assert.rejects(
    ensurePackageArtifact({
      ...f,
      runStage: async (stage) => {
        await f.runStage(stage)
        await writeFile(join(f.root, "src/main.ts"), "concurrent mutation")
        return { exitCode: 0 }
      }
    }),
    /inputs changed/
  )
  assert.deepEqual(f.calls, ["package-build"])
  const directory = join(await artifactStoreDirectory(f.root), "builds", key.build)
  assert.equal((await readdir(directory)).includes("artifact.json"), false)
})

test("archive corruption is rejected instead of reused", async (t) => {
  const f = await fixture(t)
  const artifact = await ensurePackageArtifact(f)
  await writeFile(artifact.archivePath, "corrupted")
  await assert.rejects(ensurePackageArtifact(f), /archive checksum/)
  assert.deepEqual(f.calls, ["package-build", "package-pack"])
})

test("compiled output corruption and symbolic links are rejected", async (t) => {
  const f = await fixture(t)
  const artifact = await ensurePackageArtifact(f)
  const store = await artifactStoreDirectory(f.root)
  await writeFile(join(store, "builds", artifact.buildIdentity, "outputs/dist/main"), "corrupted")
  await assert.rejects(ensurePackageArtifact(f), /output checksum/)
  await symlink(join(f.root, "src/main.ts"), join(f.root, "dist/link"))
  await assert.rejects(treeInventory(join(f.root, "dist")), /not a regular file/)
})

test("linked dependency edits and cycles are observed without physical checkout paths", async (t) => {
  const f = await fixture(t)
  await symlink(".", join(f.dependencies, "cycle"))
  const first = await artifactIdentities(f.root, f.toolchain)
  assert.deepEqual(await artifactIdentities(f.linked, f.toolchain), first)
  await writeFile(join(f.dependencies, "dependency.js"), "updated dependency")
  assert.notEqual((await artifactIdentities(f.root, f.toolchain)).build, first.build)
  await mkdir(join(f.dependencies, ".vite"))
  const beforeGenerated = await artifactIdentities(f.root, f.toolchain)
  await writeFile(join(f.dependencies, ".vite/results.json"), "transient results")
  assert.deepEqual(await artifactIdentities(f.root, f.toolchain), beforeGenerated)
})

test("linked source contents invalidate compilation even when the symlink is unchanged", async (t) => {
  const f = await fixture(t)
  await symlink(join(f.dependencies, "dependency.js"), join(f.root, "src/linked.ts"))
  const before = await artifactIdentities(f.root, f.toolchain)
  await writeFile(join(f.dependencies, "dependency.js"), "edited linked source")
  assert.notEqual((await artifactIdentities(f.root, f.toolchain)).build, before.build)
})

test("release and development recipes share compilation but retain separate checked archives", async (t) => {
  const f = await fixture(t)
  const development = await ensurePackageArtifact(f)
  const release = await ensurePackageArtifact({ ...f, recipe: "release" })
  assert.equal(release.buildReused, true)
  assert.equal(release.packageReused, false)
  assert.equal(release.buildIdentity, development.buildIdentity)
  assert.notEqual(release.archivePath, development.archivePath)
  assert.equal(f.calls.filter((stage) => stage === "package-build").length, 1)
})

test("restoring native outputs publishes a new inode and preserves mapped readers", async (t) => {
  const f = await fixture(t)
  const { open, stat } = await import("node:fs/promises")
  const native = join(f.root, `native/prebuilt/${process.platform}-${process.arch}`, "parser.node")
  const runStage = async (stage) => {
    await f.runStage(stage)
    if (stage.name === "package-build") {
      await mkdir(join(f.root, `native/prebuilt/${process.platform}-${process.arch}`), { recursive: true })
      await writeFile(native, "compiled native")
    }
    return { exitCode: 0 }
  }
  await ensurePackageArtifact({ ...f, runStage })
  const reader = await open(native, "r")
  try {
    const previous = (await stat(native)).ino
    await writeFile(native, "running reader")
    const reused = await ensurePackageArtifact({ ...f, runStage })
    assert.equal(reused.buildReused, true)
    assert.notEqual((await stat(native)).ino, previous)
    assert.equal(await readFile(native, "utf8"), "compiled native")
    assert.equal(await reader.readFile("utf8"), "running reader")
  } finally {
    await reader.close()
  }
})

test("package preparation records verified cache reuse as successful harness evidence", async (t) => {
  const f = await fixture(t)
  await ensurePackageArtifact(f)
  const { preparePackage } = await import("./prepare-package.mjs")
  const reused = await preparePackage({ root: f.root, toolchain: f.toolchain, inherited: null })
  assert.equal(reused.buildReused, true)
  assert.equal(reused.packageReused, true)
  assert.deepEqual(f.calls, ["package-build", "package-pack"])
})

test("production test-support and npm selection controls invalidate their artifact owners", async (t) => {
  const f = await fixture(t)
  await mkdir(join(f.root, "src/test-support"))
  await writeFile(join(f.root, "src/test-support/controlled-decision-model.ts"), "first")
  let previous = await artifactIdentities(f.root, f.toolchain)
  await writeFile(join(f.root, "src/test-support/controlled-decision-model.ts"), "second")
  const changed = await artifactIdentities(f.root, f.toolchain)
  assert.notEqual(previous.build, changed.build)
  previous = changed
  for (const filename of [".npmignore", "LICENSE"]) {
    await writeFile(join(f.root, filename), "pack selection or license")
    const next = await artifactIdentities(f.root, f.toolchain)
    assert.equal(previous.build, next.build)
    assert.notEqual(previous.package, next.package)
    previous = next
  }
})

test("failed harness stage with exit zero cannot publish an artifact", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    ensurePackageArtifact({
      ...f,
      runStage: async (stage) => {
        await f.runStage(stage)
        return { exitCode: 0, state: "failed", error: "stage did not complete" }
      }
    }),
    /package-build failed/
  )
  const recovered = await ensurePackageArtifact(f)
  assert.equal(recovered.buildReused, false)
})

test("unresolved descendants retain all owned artifact locks and publish no manifest", async (t) => {
  const f = await fixture(t)
  const keys = await artifactIdentities(f.root, f.toolchain)
  const store = await artifactStoreDirectory(f.root)
  await assert.rejects(
    ensurePackageArtifact({ ...f, runStage: async () => ({ exitCode: 0, state: "failed", groupUnresolved: true }) }),
    /package-build failed/
  )
  const build = join(store, "builds", keys.build)
  assert.equal(JSON.parse(await readFile(join(build, "lock/owner.json"), "utf8")).pid, process.pid)
  await assert.rejects(readFile(join(build, "artifact.json")), { code: "ENOENT" })
  const locks = await readdir(join(store, "worktrees"))
  assert.equal(locks.length, 1)
  assert.equal(
    JSON.parse(await readFile(join(store, "worktrees", locks[0], "lock/owner.json"), "utf8")).pid,
    process.pid
  )
})

test("checksum verification observes the preparation deadline on cache hits", async (t) => {
  const f = await fixture(t)
  await ensurePackageArtifact(f)
  await assert.rejects(ensurePackageArtifact({ ...f, deadline: Date.now() - 1 }), /deadline exceeded/)
})

test("source mutation while waiting for a cache lock rejects reuse", async (t) => {
  const f = await fixture(t)
  const cached = await ensurePackageArtifact(f)
  const store = await artifactStoreDirectory(f.root)
  const lock = join(store, "builds", cached.buildIdentity, "lock")
  await mkdir(lock)
  await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: process.pid }))
  let requestedReady
  const observed = new Promise((resolve) => {
    requestedReady = resolve
  })
  const preparation = ensurePackageArtifact({
    ...f,
    identity: async (...args) => {
      const inputs = await artifactIdentities(...args)
      requestedReady()
      return inputs
    }
  })
  const rejected = assert.rejects(preparation, /inputs changed during preparation/)
  await observed
  await writeFile(join(f.root, "src/main.ts"), "changed while lock held")
  await rm(lock, { recursive: true })
  await rejected
  assert.deepEqual(f.calls, ["package-build", "package-pack"])
})

test("ignored files explicitly shipped by npm participate in package identity", async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, ".gitignore"), "dist/\nnode_modules/\nshipped/\n")
  await writeFile(join(f.root, "package.json"), JSON.stringify({ files: ["src", "dist", "shipped"] }))
  await mkdir(join(f.root, "shipped"))
  await writeFile(join(f.root, "shipped/data.json"), "first")
  const first = await artifactIdentities(f.root, f.toolchain)
  await writeFile(join(f.root, "shipped/data.json"), "changed")
  const next = await artifactIdentities(f.root, f.toolchain)
  assert.equal(first.build, next.build)
  assert.notEqual(first.package, next.package)
})
