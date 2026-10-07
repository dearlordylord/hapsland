import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")

async function fixture(t, failure = false) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-dev-install-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const directory of [
    "scripts",
    "packages/runtime-environment/src/runtime",
    "node_modules/@hapsland/administration",
    "candidate"
  ])
    await mkdir(join(root, directory), { recursive: true })
  await copyFile(join(repository, "scripts/dev-install.mjs"), join(root, "scripts/dev-install.mjs"))
  await copyFile(
    join(repository, "packages/runtime-environment/src/runtime/cli-names.ts"),
    join(root, "packages/runtime-environment/src/runtime/cli-names.ts")
  )
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }))
  await symlink(join(repository, "node_modules/effect"), join(root, "node_modules/effect"), "dir")
  const owner = join(root, "node_modules/@hapsland/administration")
  await writeFile(
    join(owner, "package.json"),
    JSON.stringify({ type: "module", exports: { "./onboarding/distribution": "./dist/distribution.js" } })
  )
  await writeFile(join(root, "candidate/snapshot.json"), "{}")
  const executable = join(root, "candidate/hapsland")
  await writeFile(
    executable,
    `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs"\nappendFileSync(${JSON.stringify(join(root, "events.jsonl"))}, JSON.stringify({ event: "setup", args: process.argv.slice(2) }) + "\\n")\n`,
    { mode: 0o755 }
  )
  const distribution = `import * as Effect from "effect/Effect"
import { appendFileSync } from "node:fs"
const event = (value) => appendFileSync(${JSON.stringify(join(root, "events.jsonl"))}, JSON.stringify(value) + "\\n")
event({ event: "compiled-consumer-loaded" })
export const stageRelease = (source) => Effect.sync(() => {
  event({ event: "stage-release", source })
  return ${JSON.stringify({ prefix: join(root, "candidate"), executable, packageVersion: "fixture", identity: { archive: join(root, "fixture.tgz") } })}
})`
  // Preparation owns build/validation/pack. This controlled seam creates its
  // compiled consumer only when it returns success; the launcher is unmodified.
  await writeFile(
    join(root, "scripts/artifact-store.mjs"),
    `import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
export async function preparePackageArchive({ root, environment }) {
  appendFileSync(${JSON.stringify(join(root, "events.jsonl"))}, JSON.stringify({ event: "prepare", profile: environment.HAPSLAND_BUILD_PROFILE }) + "\\n")
  ${
    failure
      ? 'throw new Error("fixture preparation failed")'
      : `mkdirSync(${JSON.stringify(join(owner, "dist"))})
  writeFileSync(${JSON.stringify(join(owner, "dist/distribution.js"))}, ${JSON.stringify(distribution)})
  return { archivePath: ${JSON.stringify(join(root, "fixture.tgz"))} }`
  }
}`
  )
  execFileSync("git", ["init", "-q", root], { timeout: 5000 })
  execFileSync(
    "git",
    [
      "-C",
      root,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "-qm",
      "fixture"
    ],
    { timeout: 5000 }
  )
  return root
}

const launch = (root, args) =>
  spawnSync(process.execPath, ["scripts/dev-install.mjs", ...args], { cwd: root, encoding: "utf8", timeout: 10000 })
const events = async (root) => (await readFile(join(root, "events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)

test("cold dev-install prepares before loading its compiled consumer and forwards setup options", async (t) => {
  const root = await fixture(t)
  const result = launch(root, ["--host=codex", "--new-key", "--codex-home=/fixture/home"])
  assert.equal(result.status, 0, result.stderr)
  const observed = await events(root)
  assert.deepEqual(
    observed.map(({ event }) => event),
    ["prepare", "compiled-consumer-loaded", "stage-release", "setup"]
  )
  assert.equal(observed[0].profile, `${process.platform}-${process.arch}`)
  assert.deepEqual(observed[2].source, { kind: "archive", path: join(root, "fixture.tgz") })
  assert.deepEqual(observed[3].args, ["setup", "codex", "--new-key", "--codex-home=/fixture/home"])
  const snapshot = JSON.parse(await readFile(join(root, "candidate/snapshot.json"), "utf8"))
  assert.match(snapshot.commit, /^[a-f0-9]{40}$/)
  assert.equal(snapshot.dirty, true)
})

test("preparation failure never loads compiled consumers, stages a release, or activates setup", async (t) => {
  const root = await fixture(t, true)
  const result = launch(root, ["--host=pi", "--update"])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /fixture preparation failed/)
  assert.deepEqual(
    (await events(root)).map(({ event }) => event),
    ["prepare"]
  )
  assert.equal(await readFile(join(root, "candidate/snapshot.json"), "utf8"), "{}")
})
