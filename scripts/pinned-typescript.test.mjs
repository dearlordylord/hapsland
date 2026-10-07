import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { test } from "node:test"
import { resolvePinnedTypeScript } from "./pinned-typescript.mjs"

const expectedVersion = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")).catalog
  .typescript
const compilerPackage = createRequire(import.meta.url).resolve("typescript/package.json")
const fixture = (run) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-typescript-selection-"))
  return Promise.resolve()
    .then(() => run(root))
    .finally(() => rmSync(root, { recursive: true, force: true }))
}
const owner = (root, version = "catalog:") =>
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "compiler-test-owner", type: "module", dependencies: { typescript: version } })
  )

test("selects catalog-declared TypeScript despite a scorer-owned shared tsc binary", () =>
  fixture(async (root) => {
    owner(root)
    mkdirSync(join(root, "node_modules/.bin"), { recursive: true })
    symlinkSync(dirname(compilerPackage), join(root, "node_modules/typescript"), "dir")
    const scorer = join(root, "node_modules/.bin/tsc")
    writeFileSync(scorer, '#!/bin/sh\necho "Version 5.9.3"\n', { mode: 0o700 })
    assert.equal(spawnSync(scorer, ["--version"], { encoding: "utf8", timeout: 5000 }).stdout.trim(), "Version 5.9.3")
    const selected = await resolvePinnedTypeScript(root)
    assert.equal(selected.version, expectedVersion)
    assert.notEqual(selected.executable, realpathSync(scorer))
    assert.equal(
      spawnSync(selected.executable, ["--version"], { encoding: "utf8", timeout: 5000 }).stdout.trim(),
      `Version ${expectedVersion}`
    )
    assert.equal(selected.identity.compiler.path, realpathSync(compilerPackage))
    assert.match(selected.identity.helper.sha256, /^[a-f0-9]{64}$/)
    assert.ok(selected.identity.support.length > 0)
    assert.ok(selected.identity.platformSupport.length > 0)
    const cli = spawnSync(process.execPath, [join(import.meta.dirname, "pinned-typescript.mjs"), "--version"], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000
    })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(cli.stdout.trim(), `Version ${expectedVersion}`)
  }))

test("rejects an owner declaring the research scorer version", () =>
  fixture(async (root) => {
    owner(root, "5.9.3")
    await assert.rejects(resolvePinnedTypeScript(root), /declare TypeScript through the root catalog/)
  }))

test("rejects a compiler package with mismatching version before loading helper code", () =>
  fixture(async (root) => {
    owner(root)
    const packageRoot = join(root, "node_modules/typescript")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "typescript", version: "5.9.3" }))
    await assert.rejects(resolvePinnedTypeScript(root), /Selected compiler must be TypeScript/)
  }))

test("rejects an unaccounted platform dependency before loading helper code", () =>
  fixture(async (root) => {
    owner(root)
    const packageRoot = join(root, "node_modules/typescript")
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(
      join(packageRoot, "package.json"),
      JSON.stringify({ name: "typescript", version: expectedVersion, optionalDependencies: {} })
    )
    await assert.rejects(resolvePinnedTypeScript(root), /Unsupported declared TypeScript platform/)
  }))
