import { afterEach, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const directories = new Set<string>()
afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-run-freshness-"))
  directories.add(directory)
  for (const path of [
    "packages/monkey-business-bend",
    "packages/agent-flow-bend",
    "packages/monkey-business/src",
    "packages/canonical-policy/src",
    "src/canonical"
  ]) {
    mkdirSync(join(directory, path, ".."), { recursive: true })
    cpSync(resolve(path), join(directory, path), { recursive: true })
  }
  const check = () =>
    spawnSync(process.execPath, [join(directory, "packages/monkey-business-bend/build-run.mjs"), "--check"], {
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, PATH: "" }
    })
  const change = (name: string) => {
    const path = join(directory, "packages/monkey-business/src", name)
    writeFileSync(path, readFileSync(path, "utf8") + "\n// isolated freshness mutation\n")
  }
  return { directory, check, change }
}

it("refuses an imported host codec change without rewriting the recorded runner", () => {
  const { directory, check, change } = fixture()
  expect(check().status).toBe(0)
  const modulePath = join(directory, "packages/monkey-business-bend/run.mjs")
  const manifestPath = join(directory, "packages/monkey-business-bend/run.generated.json")
  const module = readFileSync(modulePath, "utf8")
  const manifest = readFileSync(manifestPath, "utf8")
  change("callback-native-codec.ts")
  const result = check()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain("Stale shared runner artifact")
  expect(readFileSync(modulePath, "utf8")).toBe(module)
  expect(readFileSync(manifestPath, "utf8")).toBe(manifest)
})

it("keeps runner identity independent of unconsumed test source", () => {
  const { check, change } = fixture()
  expect(check().status).toBe(0)
  change("source-job-public.test.ts")
  expect(check().status).toBe(0)
})
