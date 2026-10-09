import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { discoverQualityFiles, isQualityFile } from "./quality-file-discovery.mjs"

test("measured research fixtures remain lint inputs without requiring reformatting", () => {
  const root = join(import.meta.dirname, "..")
  const fixture = "scripts/abide-large-declaration-fixtures.mjs"
  assert.equal(isQualityFile(fixture), true)
  execFileSync(
    join(root, "node_modules/.bin/dprint"),
    ["check", fixture, "packages/runtime-environment/src/runtime/cli-names.ts"],
    { cwd: root, stdio: "pipe", timeout: 10000 }
  )
})

test("quality selection includes staged, unstaged and untracked code, excludes deleted and owned artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-quality-files-"))
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" })
  const write = (path, text = "export const value = 1\n") => {
    mkdirSync(join(root, path, ".."), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  try {
    git("init", "--quiet")
    write("src/staged.ts")
    write("src/unstaged.ts")
    write("src/deleted.ts")
    write(".gitignore", "node_modules\n")
    git("add", ".")
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-qm",
      "fixture"
    )
    write("src/staged.ts", "export const value = 2\n")
    git("add", "src/staged.ts")
    write("src/unstaged.ts", "export const value = 3\n")
    rmSync(join(root, "src/deleted.ts"))
    write("scripts/new.mts")
    for (const path of [
      "vendor/tool.ts",
      ".test-runs/sample.ts",
      "quint-specs/input.ts",
      "src/x.generated.js",
      "packages/monkey-business-bend/engine.mjs",
      "packages/monkey-business-bend/run.mjs",
      "src/fixtures/sample.ts",
      "node_modules/tool.ts"
    ])
      write(path)
    assert.deepEqual(discoverQualityFiles({ root, changed: true }), [
      "scripts/new.mts",
      "src/staged.ts",
      "src/unstaged.ts"
    ])
    assert.deepEqual(
      discoverQualityFiles({ root, files: [join(root, "src/staged.ts"), "../outside.ts", "src/deleted.ts"] }),
      ["src/staged.ts"]
    )
    assert.throws(() => discoverQualityFiles({ root, changed: true, base: "missing-base" }))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("configuration and authored package scripts participate without generated or fixture outputs", () => {
  assert.equal(isQualityFile("scripts/vitest.config.ts"), true)
  assert.equal(isQualityFile("packages/example/build.mjs"), true)
  assert.equal(isQualityFile("scripts/test-harness/setup.mts"), true)
  assert.equal(isQualityFile("packages/example/dist/index.js"), false)
  assert.equal(isQualityFile("packages/agent-flow-bend/dist/canonical.generated.js"), false)
})
