import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm, cp, symlink } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { resolveBunRuntime } from "../pinned-bun.mjs"
import provider, { mergeBunCoverage } from "../coverage-provider.mjs"
import { prepareBunCoveragePreload } from "./bun-coverage-preload-build.mjs"
import { resolvePinnedTypeScript } from "../pinned-typescript.mjs"
import { compilerCoverageImports } from "./coverage-source.mjs"

test("coverage import correspondence preserves only exact compiler edges", () => {
  const original =
    'import type {Shape} from "./types.ts";import {value} from "./nested/index.ts";export {value} from "./nested/index.ts";const lazy=()=>import("./lazy.mts");'
  const emitted =
    'import {value} from "./nested/index.js";export {value} from "./nested/index.js";const lazy=()=>import("./lazy.mjs");'
  const result = compilerCoverageImports(original, original, emitted)
  assert.ok(result.includes('from "./types.ts"'))
  assert.ok(result.includes('from "./nested/index.js"'))
  assert.ok(result.includes('import("./lazy.mjs")'))
  assert.throws(
    () => compilerCoverageImports(original, original, emitted.replace("./lazy.mjs", "./other.mjs")),
    /ambiguous or missing/
  )
  assert.throws(
    () => compilerCoverageImports(original, original, emitted + 'import "./lazy.mts";'),
    /ambiguous or missing/
  )
  assert.throws(
    () => compilerCoverageImports(original + 'import "./injected.ts";', original, emitted),
    /introduced a module edge/
  )
})

test("compiled executables load the owned coverage preload without embedded development dependencies", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-compiled-coverage-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, "src"))
  const entrypoint = join(root, "src/main.ts"),
    executable = join(root, "main")
  await writeFile(entrypoint, 'console.log("ready")\n')
  const bun = resolveBunRuntime().executable
  execFileSync(bun, ["build", "--compile", entrypoint, "--outfile", executable], {
    env: { ...process.env, BUN_OPTIONS: "" },
    encoding: "utf8",
    timeout: 10000
  })
  assert.equal(
    execFileSync(executable, [], {
      env: {
        ...process.env,
        HAPSLAND_BUN_COVERAGE_DIRECTORY: join(root, "coverage"),
        HAPSLAND_BUN_COVERAGE_ROOT: root,
        BUN_OPTIONS: `--preload=${pathToFileURL(prepareBunCoveragePreload(join(root, "tooling"))).href}`
      },
      encoding: "utf8",
      timeout: 10000
    }),
    "ready\n"
  )
})

test("Bun source subprocess coverage preserves original branches and merges fresh process counters", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-bun-coverage-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, "src"))
  const path = join(root, "src/subject.ts")
  await writeFile(
    path,
    'export function choose(flag: boolean) { return flag ? "yes" : "no" }\nconsole.log(choose(process.argv[2] === "yes"))\n'
  )
  const directory = join(root, "coverage")
  const env = {
    ...process.env,
    HAPSLAND_BUN_COVERAGE_DIRECTORY: directory,
    HAPSLAND_BUN_COVERAGE_ROOT: root,
    BUN_OPTIONS: `--preload=${pathToFileURL(prepareBunCoveragePreload(join(root, "tooling"))).href}`
  }
  const bun = resolveBunRuntime().executable
  assert.equal(execFileSync(bun, [path, "yes"], { env, encoding: "utf8", timeout: 10000 }), "yes\n")
  const first = JSON.parse(await readFile(join(directory, (await readdir(directory))[0]), "utf8"))
  assert.deepEqual(Object.values(first.coverage[path].b)[0], [1, 0])
  assert.equal(execFileSync(bun, [path, "no"], { env, encoding: "utf8", timeout: 10000 }), "no\n")
  const coverage = provider.getProvider().createCoverageMap()
  await mergeBunCoverage(coverage, directory, root)
  const data = coverage.fileCoverageFor(path).data
  assert.deepEqual(Object.values(data.b)[0], [1, 1])
  assert.equal(Object.values(data.f)[0], 2)
  assert.equal(data.fnMap[0].loc.start.line, 1)
  await assert.rejects(mergeBunCoverage(coverage, directory, join(root, "foreign")), /provenance is invalid/)
})

test("Bun private workspace exports record original source hits and uncalled functions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-bun-private-coverage-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, "src"))
  await mkdir(join(root, "packages/subject/src"), { recursive: true })
  await mkdir(join(root, "packages/subject/dist"))
  await mkdir(join(root, "node_modules/@hapsland"), { recursive: true })
  await symlink(join(root, "packages/subject"), join(root, "node_modules/@hapsland/subject"), "dir")
  await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/subject"] }))
  await writeFile(
    join(root, "packages/subject/package.json"),
    JSON.stringify({
      name: "@hapsland/subject",
      private: true,
      type: "module",
      exports: { ".": { types: "./dist/main.d.ts", default: "./dist/main.js" } }
    })
  )
  const source = join(root, "packages/subject/src/main.ts")
  await writeFile(join(root, "packages/subject/src/label.ts"), 'export const positive = "yes";\n')
  await writeFile(
    source,
    'import {positive} from "./label.ts";\nexport function choose(flag: boolean) {return flag ? positive : "no"}\nexport function untouched() {return "never"}\n'
  )
  const compiler = await resolvePinnedTypeScript(resolve("scripts"))
  execFileSync(
    compiler.executable,
    [
      source,
      "--ignoreConfig",
      "--target",
      "es2022",
      "--module",
      "esnext",
      "--declaration",
      "--sourceMap",
      "--rewriteRelativeImportExtensions",
      "--outDir",
      join(root, "packages/subject/dist")
    ],
    { timeout: 10000 }
  )
  const entry = join(root, "src/main.ts")
  await writeFile(entry, 'import {choose} from "@hapsland/subject";console.log(choose(process.argv[2]==="yes"));\n')
  const directory = join(root, "coverage")
  const env = {
    ...process.env,
    HAPSLAND_BUN_COVERAGE_ROOT: root,
    HAPSLAND_BUN_COVERAGE_DIRECTORY: directory,
    BUN_OPTIONS: `--preload=${pathToFileURL(prepareBunCoveragePreload(join(root, "tooling"))).href}`
  }
  for (const flag of ["yes", "no"])
    assert.equal(
      execFileSync(resolveBunRuntime().executable, [entry, flag], { env, encoding: "utf8", timeout: 10000 }),
      `${flag}\n`
    )
  const coverage = provider.getProvider().createCoverageMap()
  await mergeBunCoverage(coverage, directory, root)
  const data = coverage.fileCoverageFor(source).data
  assert.deepEqual(Object.values(data.f).sort(), [0, 2])
  assert.deepEqual(Object.values(data.b)[0], [1, 1])
  assert.ok(coverage.files().every((file) => !file.includes("/dist/")))
})

test("portable instrumented bundles retain nested, untouched and fresh counters in another checkout", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "hapsland-bundle-coverage-"))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const first = join(temp, "first"),
    second = join(temp, "second")
  const source =
    'export function choose(flag: boolean) { return (() => flag ? "yes" : "no")() }\nexport function untouched() { return "never" }\n'
  for (const root of [first, second]) {
    await mkdir(join(root, "src/resident"), { recursive: true })
    await writeFile(join(root, "src/subject.ts"), source)
    const roles = ["cli", "doctor", "parser", "resident", "hook"]
    await writeFile(join(root, "package.json"), JSON.stringify({ workspaces: roles.map((role) => `packages/${role}`) }))
    for (const role of roles) {
      const directory = join(root, "packages", role)
      await mkdir(join(directory, "src"), { recursive: true })
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({
          name: `@hapsland/${role}`,
          private: true,
          type: "module",
          hapsland: { role, entry: "src/main.ts" }
        })
      )
      await writeFile(
        join(directory, "src/main.ts"),
        `import {choose} from "../../../src/subject.ts";export {untouched} from "../../../src/subject.ts";console.log(choose(process.argv[2]==="yes"));\n`
      )
    }
  }
  const bun = resolveBunRuntime().executable
  const firstBundle = join(first, ".test-runs/source-runtime", "e".repeat(64))
  execFileSync(bun, [resolve("scripts/build-source-runtime.ts"), firstBundle, "istanbul"], {
    cwd: first,
    encoding: "utf8",
    timeout: 10000
  })
  const secondBundle = join(second, ".test-runs/source-runtime", "e".repeat(64))
  await cp(firstBundle, secondBundle, { recursive: true })
  const directory = join(second, "coverage")
  const env = {
    ...process.env,
    HAPSLAND_BUN_COVERAGE_DIRECTORY: directory,
    HAPSLAND_BUN_COVERAGE_ROOT: second,
    HAPSLAND_BUN_COVERAGE_MANIFEST: join(secondBundle, "source-manifest.json"),
    BUN_OPTIONS: `--preload=${pathToFileURL(prepareBunCoveragePreload(join(second, "tooling"))).href}`
  }
  for (const flag of ["yes", "no"])
    assert.equal(
      execFileSync(bun, [join(secondBundle, "cli.mjs"), flag], { env, encoding: "utf8", timeout: 5000 }),
      `${flag}\n`
    )
  const coverage = provider.getProvider().createCoverageMap()
  await mergeBunCoverage(coverage, directory, second)
  const path = join(second, "src/subject.ts"),
    data = coverage.fileCoverageFor(path).data
  assert.deepEqual(Object.values(data.f).sort(), [0, 2, 2])
  assert.deepEqual(Object.values(data.b)[0], [1, 1])
  assert.ok(coverage.files().every((file) => file.startsWith(second)))
  await writeFile(path, source.replace('"never"', '"changed"'))
  await assert.rejects(mergeBunCoverage(coverage, directory, second), /source digest differs/)
})
