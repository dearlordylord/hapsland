import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("../", import.meta.url))
function mockWorkspace(sourceFailure) {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-lab-runner-negative-"))
  const put = (path, text) => {
    const target = join(directory, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
    return target
  }
  put("scripts/verify-game-lab-native-tests.mjs", readFileSync(join(root, "scripts/verify-game-lab-native-tests.mjs")))
  put(
    "prototypes/canonical-defense/DefenseLabTests.bend",
    readFileSync(join(root, "prototypes/canonical-defense/DefenseLabTests.bend"))
  )
  put("prototypes/canonical-defense/DefenseNumericOutput.bend", "")
  const binary = put("bin/predicate", "#!/bin/sh\nprintf '[1,0]\\n'\n")
  chmodSync(binary, 0o755)
  const bend = put(
    "bin/bend",
    `#!/usr/bin/env node\n${sourceFailure ? `process.stderr.write(${JSON.stringify(sourceFailure)});process.exit(1)` : 'process.stdout.write("ALL PROOFS CHECK\\n")'}\n`
  )
  chmodSync(bend, 0o755)
  const manifest = put("manifest.json", JSON.stringify({ tools: { bend: { path: bend } } }))
  put(
    "packages/monkey-business-bend/conformance/native-preflight.mjs",
    `
export const createNativePreflight = () => ({manifestPath:${JSON.stringify(manifest)}})
export const validateNativeFixture = () => ({binaryPath:${JSON.stringify(binary)}})
export const cleanupNativePreflight = () => {}
export const captureNativeFixtureIdentity = () => ({mock:true})
export const assertNativeFixtureIdentity = () => {}
`
  )
  return {
    directory,
    run: (...ids) =>
      spawnSync(process.execPath, [join(directory, "scripts/verify-game-lab-native-tests.mjs"), ...ids], {
        encoding: "utf8",
        timeout: 10000,
        env: { ...process.env, PATH: `${join(directory, "bin")}:${process.env.PATH}` }
      })
  }
}

test("an independently false native predicate fails and retains failed evidence", () => {
  const fixture = mockWorkspace()
  try {
    const result = fixture.run("1")
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Delivery Relay costs55/)
    const evidence = readdirSync(join(fixture.directory, ".test-runs"))[0]
    const retained = JSON.parse(readFileSync(join(fixture.directory, ".test-runs", evidence, "result.json")))
    assert.equal(retained.outcome, "failed")
    assert.deepEqual(retained.records, [])
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})

test("compiler failures cannot be accepted as foreign transport exclusions", () => {
  for (const failure of [
    "machine stack overflow\n",
    "SOME PROOFS FAIL\nError: 5 defs rely on unsafe or foreign code:\n- DefenseNumericOutput.write\n- checked\n- inputs\n- arguments\n- unexpected\n"
  ]) {
    const fixture = mockWorkspace(failure)
    try {
      const result = fixture.run("1")
      assert.equal(result.status, 1)
      assert.match(result.stderr, /property-1-source-check failed/)
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
    }
  }
})

test("invalid and duplicate property selections fail before preparation", () => {
  const fixture = mockWorkspace()
  try {
    assert.match(fixture.run("20").stderr, /Select distinct property ids0\.\.19/)
    assert.match(fixture.run("1", "1").stderr, /Duplicate property selection/)
    assert.equal(readdirSync(fixture.directory).includes(".test-runs"), false)
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true })
  }
})
