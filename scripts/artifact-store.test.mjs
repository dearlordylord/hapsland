import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  artifactStoreDirectory,
  preparePackageArchive,
  packageSourceIdentity,
  ensureExecutionArtifact
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
  await writeFile(join(root, ".gitignore"), "dist/\nnode_modules/\n.test-runs/\n")
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
    } else if (stage.name === "package-pack") await writeFile(join(stage.args.at(-1), "fixture.tgz"), "archive")
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
  await preparePackageArchive(f)
  await preparePackageArchive(f)
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

test("every preparation invokes ordinary build, fresh validation and packing while identical archive bytes share retention", async (t) => {
  const f = await fixture(t)
  const first = await preparePackageArchive(f),
    second = await preparePackageArchive(f)
  assert.deepEqual(f.calls, [
    "package-build",
    "package-validation",
    "package-pack",
    "package-build",
    "package-validation",
    "package-pack"
  ])
  assert.equal(first.archivePath, second.archivePath)
  assert.equal(await readFile(first.archivePath, "utf8"), "archive")
  assert.equal("buildReused" in second, false)
  assert.equal("buildIdentity" in second, false)
})
test("all package stages inherit one active checkout build lease", async (t) => {
  const f = await fixture(t),
    leases = []
  await preparePackageArchive({
    ...f,
    runStage: async (stage) => {
      const token = stage.env.HAPSLAND_BUILD_LOCK_LEASE
      assert.equal(typeof token, "string")
      const lease = JSON.parse(await readFile(join(f.root, ".test-runs/product-build/lease.json"), "utf8"))
      assert.equal(lease.token, token)
      leases.push(token)
      return f.runStage(stage)
    }
  })
  assert.equal(new Set(leases).size, 1)
  await assert.rejects(readFile(join(f.root, ".test-runs/product-build/lease.json")), /ENOENT/)
})
for (const failed of ["package-build", "package-validation", "package-pack"])
  test(`failed ${failed} prevents archive publication and a later attempt can recover`, async (t) => {
    const f = await fixture(t),
      calls = []
    await assert.rejects(
      preparePackageArchive({
        ...f,
        runStage: async (stage) => {
          calls.push(stage.name)
          return stage.name === failed
            ? { exitCode: 0, state: "failed", logPath: "fixture failure" }
            : f.runStage(stage)
        }
      }),
      /failed/
    )
    assert.equal(calls.at(-1), failed)
    const store = await artifactStoreDirectory(f.root)
    await assert.rejects(readdir(join(store, "archives")), /ENOENT/)
    assert.equal(await readFile((await preparePackageArchive(f)).archivePath, "utf8"), "archive")
  })
test("source changes during build prevent packing", async (t) => {
  const f = await fixture(t),
    calls = []
  await assert.rejects(
    preparePackageArchive({
      ...f,
      runStage: async (stage) => {
        calls.push(stage.name)
        await f.runStage(stage)
        await writeFile(join(f.root, "src/main.ts"), "concurrent source edit")
        return { exitCode: 0 }
      }
    }),
    /inputs changed during compilation/
  )
  assert.deepEqual(calls, ["package-build"])
})
test("runtime output changes during packing prevent archive retention", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    preparePackageArchive({
      ...f,
      runStage: async (stage) => {
        await f.runStage(stage)
        if (stage.name === "package-pack") await writeFile(join(f.root, "dist/main"), "concurrent runtime change")
        return { exitCode: 0 }
      }
    }),
    /runtime outputs changed/
  )
  await assert.rejects(readdir(join(await artifactStoreDirectory(f.root), "archives")), /ENOENT/)
})
test("corrupt retained archive bytes are rejected after a fresh build, validation and pack", async (t) => {
  const f = await fixture(t),
    first = await preparePackageArchive(f)
  await writeFile(first.archivePath, "corrupt")
  await assert.rejects(preparePackageArchive(f), /archive checksum/)
  assert.equal(f.calls.length, 6)
})
test("release packaging uses ordinary build and both-platform native validation before npm pack", async (t) => {
  const f = await fixture(t),
    stages = []
  await preparePackageArchive({
    ...f,
    recipe: "release",
    environment: { ...process.env, HAPSLAND_BUILD_PROFILE: "linux-arm64" },
    runStage: async (stage) => {
      stages.push(stage)
      return f.runStage(stage)
    }
  })
  assert.equal(stages[0].env.HAPSLAND_BUILD_PROFILE, undefined)
  assert.equal(stages[1].env.HAPSLAND_BUILD_PROFILE, undefined)
  assert.equal(stages[0].args.at(-1), "build")
  assert.equal(stages[1].args.at(-1), "verify:release-native")
  assert.ok(stages[2].args.includes("--ignore-scripts=true"))
  assert.ok(stages[2].args.includes("--pack-destination"))
})
test("archive preparation observes a finite deadline before invoking stages", async (t) => {
  const f = await fixture(t)
  await assert.rejects(preparePackageArchive({ ...f, deadline: Date.now() - 1 }), /deadline exceeded/)
  assert.deepEqual(f.calls, [])
})
test("source changes during packing prevent immutable archive publication", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    preparePackageArchive({
      ...f,
      runStage: async (stage) => {
        await f.runStage(stage)
        if (stage.name === "package-pack") await writeFile(join(f.root, "README.md"), "concurrent shipped edit")
        return { exitCode: 0 }
      }
    }),
    /inputs changed during packing/
  )
})
test("archive preparation leaves installed dependency observation to the build toolkit", async (t) => {
  const f = await fixture(t)
  await preparePackageArchive({
    ...f,
    runStage: async (stage) => {
      await f.runStage(stage)
      if (stage.name === "package-build") await writeFile(join(f.dependencies, "dependency.js"), "changed dependency")
      return { exitCode: 0 }
    }
  })
  assert.deepEqual(f.calls, ["package-build", "package-validation", "package-pack"])
})
test("explicitly shipped ignored files participate in fresh package-source drift checks", async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.root, ".gitignore"), "dist/\nnode_modules/\n.test-runs/\nignored-input.txt\n")
  const manifest = JSON.parse(await readFile(join(f.root, "package.json"), "utf8"))
  manifest.files.push("ignored-input.txt")
  await writeFile(join(f.root, "package.json"), JSON.stringify(manifest))
  await writeFile(join(f.root, "ignored-input.txt"), "before")
  const before = await packageSourceIdentity(f.root)
  await writeFile(join(f.root, "ignored-input.txt"), "after")
  assert.notEqual(await packageSourceIdentity(f.root), before)
})
test("an unresolved stage retains the owned checkout lease and cannot publish an archive", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    preparePackageArchive({ ...f, runStage: async () => ({ exitCode: 0, state: "failed", groupUnresolved: true }) }),
    (error) => error.groupUnresolved === true
  )
  const lease = JSON.parse(await readFile(join(f.root, ".test-runs/product-build/lease.json"), "utf8"))
  assert.equal(lease.state, "closing")
  assert.ok(await readdir(join(f.root, ".test-runs/product-build/lock")))
  await assert.rejects(readdir(join(await artifactStoreDirectory(f.root), "archives")), /ENOENT/)
})
test("symbolic runtime outputs are rejected before packing", async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    preparePackageArchive({
      ...f,
      runStage: async (stage) => {
        await f.runStage(stage)
        if (stage.name === "package-build") await symlink("main", join(f.root, "dist/link"))
        return { exitCode: 0 }
      }
    }),
    /not a regular file/
  )
  assert.equal(f.calls.includes("package-pack"), false)
})

test("linked authored source and package selection controls remain strong archive inputs", async (t) => {
  const f = await fixture(t)
  await symlink(join(f.dependencies, "dependency.js"), join(f.root, "src/linked.ts"))
  let before = await packageSourceIdentity(f.root)
  await writeFile(join(f.dependencies, "dependency.js"), "edited linked source")
  assert.notEqual(await packageSourceIdentity(f.root), before)
  for (const [filename, contents] of [
    ["src/.npmignore", "main.ts\n"],
    ["LICENSE", "package license"]
  ]) {
    before = await packageSourceIdentity(f.root)
    await writeFile(join(f.root, filename), contents)
    assert.notEqual(await packageSourceIdentity(f.root), before)
  }
})
