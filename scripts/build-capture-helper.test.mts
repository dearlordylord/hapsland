import { DEFAULT_CHILD_TIMEOUT_MS } from "./test-harness/policy.mjs"
import { afterEach, expect, it } from "vitest"
import { spawnSync } from "./test-harness/process.mjs"
import { createHash } from "node:crypto"
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const directories = new Set<string>()
afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.clear()
})
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-source-build-"))
  directories.add(directory)
  mkdirSync(join(directory, "scripts"))
  for (const name of ["build-capture-helper.mjs", "native-artifact.mjs", "verify-native-release.mjs"])
    cpSync(resolve("scripts", name), join(directory, "scripts", name))
  cpSync(resolve("native/prebuilt"), join(directory, "native/prebuilt"), { recursive: true })
  const run = () =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `Object.defineProperty(process, 'arch', { value: 'x64' }); await import(${JSON.stringify(pathToFileURL(join(directory, "scripts/build-capture-helper.mjs")).href)});`
      ],
      { encoding: "utf8", env: { ...process.env, PATH: "" }, timeout: DEFAULT_CHILD_TIMEOUT_MS }
    )
  return { directory, run }
}

it("retains declared native artifacts during an unsupported-host source build without invoking build tools", () => {
  const { directory, run } = fixture()
  const snapshot = () =>
    readdirSync(join(directory, "native/prebuilt"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [
        join(entry.parentPath, entry.name),
        createHash("sha256")
          .update(readFileSync(join(entry.parentPath, entry.name)))
          .digest("hex")
      ])
  const before = snapshot()
  const result = run()
  expect(result.status).toBe(0)
  expect(result.stdout).toContain("source-only build")
  expect(result.stdout).toContain("no target-host validation")
  expect(snapshot()).toEqual(before)
})

it("rejects an unsupported-host source build when a declared native artifact is absent", () => {
  const { directory, run } = fixture()
  rmSync(join(directory, "native/prebuilt/darwin-arm64/capture-open"))
  const result = run()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain("release native artifact is missing")
})

it("rejects a foreign-architecture artifact without repairing or replacing it", () => {
  const { directory, run } = fixture()
  const artifact = join(directory, "native/prebuilt/linux-arm64/credential-secret-service")
  const hostile = Buffer.alloc(32)
  hostile.write("\x7fELF", 0, "binary")
  hostile.writeUInt16LE(62, 18) // x86-64 is outside both declared profiles.
  writeFileSync(artifact, hostile)
  const result = run()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain("wrong format or architecture")
  expect(readFileSync(artifact)).toEqual(hostile)
})
