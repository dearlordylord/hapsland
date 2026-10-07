import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const repository = resolve(import.meta.dirname, "..")
function fixture(script, check) {
  const root = mkdtempSync(join(tmpdir(), "hapsland-boundary-"))
  try {
    const source = readFileSync(join(repository, "scripts", script), "utf8")
    const paths = new Set([...source.matchAll(/["`]((?:src\/|packages\/)[^"`]+\.ts)["`]/gu)].map((match) => match[1]))
    for (const path of paths) {
      const expanded = path.includes("${runtime}")
        ? ["claude", "codex", "opencode"].map((runtime) => path.replace("${runtime}", runtime))
        : [path]
      for (const file of expanded) {
        mkdirSync(dirname(join(root, file)), { recursive: true })
        copyFileSync(join(repository, file), join(root, file))
      }
    }
    mkdirSync(join(root, "scripts"))
    copyFileSync(join(repository, "scripts", script), join(root, "scripts", script))
    const run = () => spawnSync(process.execPath, [join(root, "scripts", script)], { encoding: "utf8", timeout: 5000 })
    const baseline = run()
    assert.equal(baseline.status, 0, baseline.stderr)
    check(root, run)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("configuration boundary rejects unredacted shared credential input", () => {
  fixture("check-configuration-boundary.mjs", (root, run) => {
    const file = join(root, "packages/runtime-inputs/src/credentials/input.ts")
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace("readonly value?: Redacted.Redacted", "readonly value?: string")
    )
    const result = run()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /remain redacted until IPC/)
  })
})

test("configuration boundary rejects unwrapping a key in the shared input reader", () => {
  fixture("check-configuration-boundary.mjs", (root, run) => {
    const file = join(root, "packages/runtime-inputs/src/credentials/input.ts")
    writeFileSync(file, readFileSync(file, "utf8") + "\n// Redacted.value(input.value)\n")
    assert.notEqual(run().status, 0)
  })
})

test("retention boundary accepts formatting but rejects a changed peak operand", () => {
  fixture("check-retention-boundary.mjs", (root, run) => {
    const file = join(root, "packages/resident-runtime/src/resident/capacity.ts")
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "projectCanonical(next.canonical).global.bytes",
        "projectCanonical(next.canonical).global.requests"
      )
    )
    const result = run()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /peak retention/)
  })
})

test("credential capture guard rejects removal of redacted cleanup", () => {
  fixture("check-configuration-boundary.mjs", (root, run) => {
    const file = join(root, "packages/administration/src/credentials/masked-input.ts")
    writeFileSync(file, readFileSync(file, "utf8").replace("Redacted.wipeUnsafe(", "Redacted.value("))
    const result = run()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /scoped lifetime and redacted cleanup/)
  })
})

test("credential capture guard rejects replacing the built-in hidden prompt", () => {
  fixture("check-configuration-boundary.mjs", (root, run) => {
    const file = join(root, "packages/administration/src/interaction/interaction.ts")
    writeFileSync(file, readFileSync(file, "utf8").replace("Prompt.Hidden(", "Prompt.Custom("))
    const result = run()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /built-in Prompt.Hidden/)
  })
})
