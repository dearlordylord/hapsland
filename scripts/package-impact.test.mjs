import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { analyzePackageImpact, parseChangedPaths, parseOptions, renderPackageImpact } from "./package-impact.mjs"

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 10000 }).trim()
const write = (root, path, content) => {
  const target = join(root, path)
  mkdirSync(join(target, ".."), { recursive: true })
  writeFileSync(target, content)
}
const manifest = (root, name, dependencies = [], role = "production") =>
  write(
    root,
    `packages/${name}/package.json`,
    JSON.stringify({
      name: `@hapsland/${name}`,
      private: true,
      type: "module",
      dependencies: Object.fromEntries(dependencies.map((dependency) => [`@hapsland/${dependency}`, "workspace:*"])),
      hapsland: { workspaceRole: role }
    })
  )
const save = (root) => {
  git(root, "add", "-A")
  git(root, "-c", "user.name=Impact Test", "-c", "user.email=impact@example.invalid", "commit", "-qm", "fixture")
  return git(root, "rev-parse", "HEAD")
}
const fixture = (t) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-package-impact-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, "init", "-q", "-b", "main")
  write(
    root,
    "package.json",
    JSON.stringify({ workspaces: ["core", "app", "top", "independent"].map((name) => `packages/${name}`) })
  )
  manifest(root, "core")
  manifest(root, "app", ["core"])
  manifest(root, "top", ["app"])
  manifest(root, "independent")
  for (const name of ["core", "app", "top", "independent"]) write(root, `packages/${name}/index.ts`, `// ${name}\n`)
  write(root, ".gitignore", "ignored/\n")
  return { root, base: save(root) }
}
const names = (nodes) => nodes.map((node) => node.name)

test("committed changes propagate transitively, while outside files remain explicit", (t) => {
  const { root, base } = fixture(t)
  write(root, "packages/core/index.ts", "// changed core\n")
  write(root, "docs/example.md", "example\n")
  const head = save(root)
  const result = analyzePackageImpact(root, { base, head })
  assert.deepEqual(names(result.direct), ["@hapsland/core"])
  assert.deepEqual(names(result.downstream), ["@hapsland/app", "@hapsland/top"])
  assert.equal(result.downstream.find((node) => node.name === "@hapsland/top").via, "@hapsland/app")
  assert.deepEqual(result.unaffected, ["@hapsland/independent"])
  assert.deepEqual(result.unownedPaths, ["docs/example.md"])
  assert.deepEqual(result.edgeChanges, [])
  assert.match(renderPackageImpact(result), /\* core\n  `--> ~ app/)
  assert.match(renderPackageImpact(result), /potential downstream/)
  // Historical manifests are read from Git, not from the dirty checkout.
  write(root, "packages/app/package.json", "invalid JSON")
  assert.deepEqual(analyzePackageImpact(root, { base, head }), result)
})

test("cross-package renames preserve both owners and deleted packages retain old edges", (t) => {
  const { root, base } = fixture(t)
  renameSync(join(root, "packages/core/index.ts"), join(root, "packages/independent/moved file.ts"))
  const renamed = analyzePackageImpact(root, { base, head: save(root) })
  assert.ok(renamed.changes.some((change) => change.status === "R100" && change.oldPath === "packages/core/index.ts"))
  assert.deepEqual(names(renamed.direct), ["@hapsland/core", "@hapsland/independent"])
  rmSync(join(root, "packages/core"), { recursive: true })
  write(
    root,
    "package.json",
    JSON.stringify({ workspaces: ["app", "top", "independent"].map((name) => `packages/${name}`) })
  )
  manifest(root, "app")
  const deleted = analyzePackageImpact(root, { base, head: save(root) })
  assert.equal(deleted.direct.find((node) => node.name === "@hapsland/core").state, "removed")
  assert.ok(
    deleted.edges.some(([dependency, consumer]) => dependency === "@hapsland/core" && consumer === "@hapsland/app")
  )
  assert.deepEqual(deleted.edgeChanges, [{ kind: "removed", edge: ["@hapsland/core", "@hapsland/app"] }])
  assert.ok(names(deleted.downstream).includes("@hapsland/top"))
})

test("worktree mode includes staged, unstaged and untracked paths, excluding ignored files", (t) => {
  const { root, base } = fixture(t)
  write(root, "packages/core/index.ts", "// staged\n")
  git(root, "add", "packages/core/index.ts")
  write(root, "packages/app/index.ts", "// unstaged\n")
  write(root, "packages/independent/new\nfile.ts", "// untracked\n")
  write(root, "ignored/output.txt", "ignored\n")
  const result = analyzePackageImpact(root, { worktree: true })
  assert.equal(result.base, base)
  assert.equal(result.head, null)
  assert.deepEqual(names(result.direct), ["@hapsland/app", "@hapsland/core", "@hapsland/independent"])
  assert.ok(
    result.changes.some((change) => change.status === "?" && change.path === "packages/independent/new\nfile.ts")
  )
  assert.equal(
    result.changes.some((change) => change.path.startsWith("ignored/")),
    false
  )
  assert.equal(git(root, "rev-parse", "HEAD"), base)
})

test("merge-base mode compares branch changes instead of differences from advanced main", (t) => {
  const { root, base } = fixture(t)
  git(root, "checkout", "-qb", "feature")
  write(root, "packages/app/index.ts", "// feature\n")
  const head = save(root)
  git(root, "checkout", "-q", "main")
  write(root, "packages/core/index.ts", "// main advanced\n")
  const main = save(root)
  const endpoints = analyzePackageImpact(root, { base: "main", head: "feature" })
  assert.deepEqual(names(endpoints.direct), ["@hapsland/app", "@hapsland/core"])
  const branch = analyzePackageImpact(root, { base: "main", head: "feature", mergeBase: true })
  assert.equal(branch.base, base)
  assert.equal(branch.requestedBase, main)
  assert.equal(branch.head, head)
  assert.deepEqual(names(branch.direct), ["@hapsland/app"])
})

test("verification cycles are rejected by the maintained package graph", (t) => {
  const { root } = fixture(t)
  for (const name of ["core", "app", "top", "independent"]) manifest(root, name, [], "verification")
  manifest(root, "app", ["core", "independent"], "verification")
  manifest(root, "independent", ["app"], "verification")
  const base = save(root)
  write(root, "packages/core/index.ts", "// cycle input changed\n")
  const head = save(root)
  assert.throws(() => analyzePackageImpact(root, { base, head }), /Package dependency cycle/)
})

test("root-only package membership changes are visible", (t) => {
  const { root } = fixture(t)
  const release = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  release.workspaces = release.workspaces.filter((directory) => directory !== "packages/top")
  write(root, "package.json", JSON.stringify(release))
  const previous = git(root, "rev-parse", "HEAD")
  const membership = analyzePackageImpact(root, { base: previous, head: save(root) })
  assert.deepEqual(names(membership.direct), ["@hapsland/top"])
  assert.equal(membership.direct[0].state, "removed")
})

test("changed workspace metadata uses the head role", (t) => {
  const { root, base } = fixture(t)
  manifest(root, "independent", [], "verification")
  const result = analyzePackageImpact(root, { base, head: save(root) })
  assert.equal(result.direct.find((node) => node.name === "@hapsland/independent").role, "verification")
})

test("actual CLI emits JSON from a subdirectory and rejects ambiguous endpoints", (t) => {
  const { root, base } = fixture(t)
  write(root, "packages/core/index.ts", "// CLI changed\n")
  const head = save(root)
  const tool = fileURLToPath(new URL("./package-impact.mjs", import.meta.url))
  const invoke = (...args) =>
    spawnSync(process.execPath, [tool, ...args], { cwd: join(root, "packages/core"), encoding: "utf8", timeout: 10000 })
  const success = invoke("--base", base, "--head", head, "--format", "json")
  assert.equal(success.status, 0, success.stderr)
  assert.deepEqual(names(JSON.parse(success.stdout).direct), ["@hapsland/core"])
  const failure = invoke("--worktree", "--head", "HEAD")
  assert.equal(failure.status, 1)
  assert.match(failure.stderr, /Choose --head or --worktree/)
  assert.throws(() => analyzePackageImpact(root, { base: "missing-ref", head }), /Command failed/)
})

test("NUL parser preserves unusual paths and CLI rejects invalid options", () => {
  assert.deepEqual(parseChangedPaths("R100\0old name\0new\nname\0D\0deleted\0"), [
    { status: "R100", oldPath: "old name", path: "new\nname" },
    { status: "D", path: "deleted" }
  ])
  assert.throws(() => parseChangedPaths("R100\0old\0"), /Missing renamed/)
  assert.throws(() => parseOptions(["--format", "html"]), /ascii or json/)
  assert.throws(() => parseOptions(["--base"]), /Missing value/)
  assert.throws(() => parseOptions(["--unknown"]), /Unknown option/)
})
