import { after, test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"

const directory = mkdtempSync(join(tmpdir(), "hapsland-npm-runner-"))
const bunRunner = join(directory, "bun")
writeFileSync(bunRunner, "")
after(() => rmSync(directory, { recursive: true, force: true }))
const npmEntrypoint = realpathSync(join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"))
const helper = new URL("./npm-tooling.mjs", import.meta.url).href
const probe = (runner, override) => {
  const env = { ...process.env, PATH: dirname(process.execPath) }
  delete env.npm_execpath
  if (runner !== undefined) env.npm_execpath = runner
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { npmToolingRequire } from ${JSON.stringify(helper)};
       const require = npmToolingRequire(${override === undefined ? "" : JSON.stringify(override)});
       require("tar");
       console.log(require("../package.json").name);`
    ],
    { env, encoding: "utf8", timeout: 5_000 }
  )
}

for (const [name, runner] of [
  ["Bun script runner", bunRunner],
  ["npm script runner", npmEntrypoint],
  ["no script runner", undefined]
]) {
  test(`resolves real npm-owned dependencies with ${name}`, () => {
    const result = probe(runner)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), "npm")
  })
}

test("an explicit non-npm override remains an error even with a usable npm on PATH", () => {
  const result = probe(npmEntrypoint, bunRunner)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Cannot find module|Selected entrypoint does not belong to npm/)
})

test("a verified explicit npm override takes precedence over the Bun environment", () => {
  const result = probe(bunRunner, npmEntrypoint)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), "npm")
})
