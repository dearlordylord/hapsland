import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { test } from "node:test"
import assert from "node:assert/strict"
import { assemblyFixture } from "./assembly-test-fixture.mjs"
import { assemblyArtifactPaths, assembleEntry } from "./assemble-entry.mjs"
test("owner artifact paths are disjoint from compiler and public outputs", (t) => {
  const f = assemblyFixture(t),
    owner = f.graph.packages.get("@hapsland/cli")
  const linux = assemblyArtifactPaths(f.root, owner, "linux-arm64"),
    darwin = assemblyArtifactPaths(f.root, owner, "darwin-arm64")
  assert.match(linux.output, /packages\/cli\/artifacts\/linux-arm64\/hapsland-cli$/)
  assert.notEqual(linux.output, darwin.output)
  assert.throws(() => assemblyArtifactPaths(f.root, owner, "windows-x64"), /Invalid/)
})
test("direct producer invocation requires fresh phase admission before spawning Bun", async (t) => {
  const f = assemblyFixture(t),
    before = process.env.HAPSLAND_BUILD_LOCK_LEASE
  delete process.env.HAPSLAND_BUILD_LOCK_LEASE
  try {
    await assert.rejects(
      assembleEntry(f.root, f.graph.packages.get("@hapsland/cli"), "linux-arm64"),
      /requires fresh assembly admission/
    )
  } finally {
    if (before !== undefined) process.env.HAPSLAND_BUILD_LOCK_LEASE = before
  }
})

test("assembly validation bootstraps from authored owners without any compiled workspace outputs", (t) => {
  const checkout = resolve(import.meta.dirname, "..")
  const root = mkdtempSync(resolve(tmpdir(), "hapsland-cold-assembly-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(resolve(checkout, "scripts"), resolve(root, "scripts"), { recursive: true })
  for (const source of [
    "packages/source-analysis/src/direct-event/languages/native-bindings.ts",
    "packages/runtime-environment/src/runtime/bun-runtime.ts",
    "packages/runtime-environment/src/runtime/release-identity.generated.ts"
  ]) {
    const destination = resolve(root, source)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(resolve(checkout, source), destination)
  }
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ type: "module" }))
  symlinkSync(resolve(checkout, "node_modules"), resolve(root, "node_modules"), "dir")
  const denyCompiled = resolve(root, "deny-compiled.mjs")
  writeFileSync(
    denyCompiled,
    `
export async function resolve(specifier, context, next) {
  const result = await next(specifier, context);
  if (/\\/packages\\/[^/]+\\/dist\\//.test(result.url)) throw new Error('Compiled workspace import: ' + result.url);
  return result;
}
`
  )
  const imports = ["external-runtime-evidence", "check-assembly-receipt", "assemble-entry"]
    .map((name) => `await import(${JSON.stringify(pathToFileURL(resolve(root, `scripts/${name}.mjs`)).href)});`)
    .join("\n")
  execFileSync(
    process.execPath,
    ["--no-warnings", "--loader", denyCompiled, "--input-type=module", "--eval", imports],
    { cwd: root, timeout: 10000, stdio: "pipe" }
  )
})
