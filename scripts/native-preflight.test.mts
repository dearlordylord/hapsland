import { afterEach, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  assertNativeFixtureIdentity,
  captureNativeFixtureIdentity,
  createNativePreflight,
  validateNativeFixture,
  cleanupNativePreflight
} from "../packages/monkey-business-bend/conformance/native-preflight.mjs"

const directories = new Set<string>()
const sessions = new Set<ReturnType<typeof createNativePreflight>>()
afterEach(() => {
  for (const handle of sessions) cleanupNativePreflight(handle)
  sessions.clear()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  directories.clear()
})

// Temporary executables exercise the same spawn, provenance and validation path.
// These tests validate the preflight boundary, not Bend compilation semantics.
function fixture(failCompile = false) {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-preflight-test-"))
  directories.add(directory)
  const bin = join(directory, "tools", "bin")
  const assets = join(directory, "tools", "bend2")
  const files = {
    source: join(directory, "main.bend"),
    dependency: join(directory, "dependency.bend"),
    foreign: join(directory, "effect.c"),
    header: join(directory, "effect.h"),
    base: join(assets, "base.bend"),
    effect: join(assets, "effect.c"),
    bend: join(bin, "bend"),
    clang: join(bin, "clang"),
    emitted: join(directory, "emitted-path")
  }
  // mkdir via the ordinary filesystem API; no alternate library resolution path.
  const mkdir = (path: string) => mkdirSync(path, { recursive: true })
  mkdir(bin)
  mkdir(assets)
  writeFileSync(files.source, "import Base\nimport ./dependency.bend as Dependency\ndef main() -> Nat: 1n\n")
  writeFileSync(files.dependency, 'def effect() -> Nat:\n  import "./effect.c"\n')
  writeFileSync(files.foreign, '#include "./effect.h"\n/* original foreign effect */\n')
  writeFileSync(files.header, "/* original local header */\n")
  writeFileSync(files.base, 'def print() -> Nat:\n  import "./effect.c"\n')
  writeFileSync(files.effect, "/* original Base effect */\n")
  writeFileSync(
    files.bend,
    `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nconst args=process.argv.slice(2);\nif(process.env.BEND_NO_TELEMETRY !== '1') throw new Error('Compiler update check must be disabled');\nif(args[0]==='version') console.log('bend 2.0.36');\nelse { writeFileSync(args[2], 'fresh C'); writeFileSync(${JSON.stringify(files.emitted)},args[2]); }\n`
  )
  const compileBody = failCompile
    ? "process.exit(23);"
    : `const output=args[args.indexOf('-o')+1]; writeFileSync(output, ${JSON.stringify("#!/bin/sh\nprintf '[]\\n'\n")}); chmodSync(output,0o755);`
  writeFileSync(
    files.clang,
    `#!${process.execPath}\nimport { writeFileSync, chmodSync } from 'node:fs';\nconst args=process.argv.slice(2);\nif(args[0]==='--version') console.log('Clang test tool');\nelse { ${compileBody} }\n`
  )
  chmodSync(files.bend, 0o755)
  chmodSync(files.clang, 0o755)
  const options = { fixtures: [pathToFileURL(files.source)], bend: files.bend, clang: files.clang }
  const create = () => {
    const handle = createNativePreflight(options)
    sessions.add(handle)
    return handle
  }
  return {
    files,
    options,
    create,
    validate: (handle: ReturnType<typeof createNativePreflight>) =>
      validateNativeFixture({ ...handle, fixture: options.fixtures[0], bend: files.bend, clang: files.clang })
  }
}

it("records finite compilation allowances separately from execution", () => {
  const test = fixture()
  const handle = test.create()
  const manifest = JSON.parse(readFileSync(handle.manifestPath, "utf8"))
  expect(manifest.flags.cEmissionTimeoutMs).toBe(30000)
  expect(manifest.flags.clangTimeoutMs).toBe(30000)
})

it("creates distinct fresh sessions and validates their exact selected fixture", () => {
  const test = fixture()
  const first = test.create()
  const second = test.create()
  expect(first.sessionId).not.toBe(second.sessionId)
  expect(first.manifestPath).not.toBe(second.manifestPath)
  expect(test.validate(first).binaryPath).toBe(join(dirname(first.manifestPath), "fixture-0"))
  expect(() => test.validate({ ...first, sessionId: second.sessionId })).toThrow("session identity")
  const other = pathToFileURL(test.files.dependency)
  expect(() =>
    validateNativeFixture({ ...first, fixture: other, bend: test.files.bend, clang: test.files.clang })
  ).toThrow("not selected")
})

it.each(["dependency", "foreign", "header", "base", "effect"] as const)(
  "rejects changed transitive %s source",
  (name) => {
    const test = fixture()
    const handle = test.create()
    writeFileSync(test.files[name], readFileSync(test.files[name], "utf8") + "\n# changed source\n")
    expect(() => test.validate(handle)).toThrow("source graph mismatch")
  }
)

it("rejects a direct workload after a transitive source changes", () => {
  const test = fixture()
  const identity = captureNativeFixtureIdentity(test.options.fixtures[0], {
    bend: test.files.bend,
    clang: test.files.clang
  })
  writeFileSync(
    test.files.dependency,
    readFileSync(test.files.dependency, "utf8") + "\n# changed during direct compile\n"
  )
  expect(() =>
    assertNativeFixtureIdentity(identity, test.options.fixtures[0], { bend: test.files.bend, clang: test.files.clang })
  ).toThrow("source inputs changed during the direct native workload")
})

it("rejects a direct workload after compiler bytes change", () => {
  const test = fixture()
  const identity = captureNativeFixtureIdentity(test.options.fixtures[0], {
    bend: test.files.bend,
    clang: test.files.clang
  })
  writeFileSync(test.files.clang, readFileSync(test.files.clang, "utf8") + "\n// replacement compiler\n")
  expect(() =>
    assertNativeFixtureIdentity(identity, test.options.fixtures[0], { bend: test.files.bend, clang: test.files.clang })
  ).toThrow("compiler provenance changed during the direct native workload")
})

it("rejects tool replacement even when its version string stays the same", () => {
  const test = fixture()
  const handle = test.create()
  writeFileSync(test.files.bend, readFileSync(test.files.bend, "utf8") + "\n// replacement tool\n")
  expect(() => test.validate(handle)).toThrow("provenance mismatch")
})

it.each(["fixture-0.c", "fixture-0"])("rejects tampered generated %s", (name) => {
  const test = fixture()
  const handle = test.create()
  writeFileSync(join(dirname(handle.manifestPath), name), "tampered artifact")
  expect(() => test.validate(handle)).toThrow("artifact digest mismatch")
})

it("refuses a symlink artifact even when its replacement bytes match", () => {
  const test = fixture()
  const handle = test.create()
  const binary = join(dirname(handle.manifestPath), "fixture-0")
  const outside = join(dirname(test.files.source), "outside-binary")
  writeFileSync(outside, readFileSync(binary))
  chmodSync(outside, 0o755)
  unlinkSync(binary)
  symlinkSync(outside, binary)
  expect(() => test.validate(handle)).toThrow("escaped session directory")
})

it("rejects manifest rewriting together with a forged replacement artifact digest", () => {
  const test = fixture()
  const handle = test.create()
  const manifest = JSON.parse(readFileSync(handle.manifestPath, "utf8"))
  const binary = join(dirname(handle.manifestPath), "fixture-0")
  writeFileSync(binary, "replacement binary")
  manifest.entries[0].binary.sha256 = createHash("sha256").update(readFileSync(binary)).digest("hex")
  writeFileSync(handle.manifestPath, JSON.stringify(manifest))
  expect(() => test.validate(handle)).toThrow("manifest digest mismatch")
})

it("removes failed compilation artifacts and has no stale fallback", () => {
  const test = fixture(true)
  expect(test.create).toThrow("clang failed (23)")
  const source = readFileSync(test.files.emitted, "utf8")
  expect(existsSync(dirname(source))).toBe(false)
})

it("cleans up only an owned session and refuses use after cleanup", () => {
  const test = fixture()
  const handle = test.create()
  expect(() => cleanupNativePreflight({ ...handle })).toThrow("owned session handle")
  cleanupNativePreflight(handle)
  cleanupNativePreflight(handle)
  expect(existsSync(dirname(handle.manifestPath))).toBe(false)
  expect(() => test.validate(handle)).toThrow()
})

it("refuses a previous session after its creating process has exited", () => {
  const test = fixture()
  const library = fileURLToPath(
    new URL("../packages/monkey-business-bend/conformance/native-preflight.mjs", import.meta.url)
  )
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { createNativePreflight } from ${JSON.stringify(pathToFileURL(library).href)}; const h=createNativePreflight({fixtures:[new URL(${JSON.stringify(test.options.fixtures[0].href)})],bend:${JSON.stringify(test.files.bend)},clang:${JSON.stringify(test.files.clang)}}); console.log(JSON.stringify(h));`
    ],
    { encoding: "utf8", timeout: 5000 }
  )
  expect(child.error).toBeUndefined()
  expect(child.status).toBe(0)
  const handle = JSON.parse(child.stdout)
  directories.add(dirname(handle.manifestPath))
  expect(() => test.validate(handle)).toThrow("owner is no longer running")
})

it("rejects an older Bend compiler before native preparation", () => {
  const test = fixture()
  writeFileSync(test.files.bend, readFileSync(test.files.bend, "utf8").replace("bend 2.0.36", "bend 2.0.35"))
  expect(() => test.create()).toThrow("requires exact bend 2.0.36; observed bend 2.0.35")
  expect(existsSync(test.files.emitted)).toBe(false)
})
