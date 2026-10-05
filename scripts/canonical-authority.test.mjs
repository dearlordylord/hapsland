import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

test("canonical authority accepts formatter layout and still rejects a changed constructor field", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-canonical-audit-"))
  const run = () =>
    spawnSync(process.execPath, [join(root, "scripts/check-canonical-authority.mjs")], {
      encoding: "utf8",
      timeout: 10_000
    })
  try {
    for (const path of ["scripts/check-canonical-authority.mjs", "src/canonical", "packages/agent-flow-bend"]) {
      mkdirSync(join(root, path, ".."), { recursive: true })
      cpSync(path, join(root, path), { recursive: true })
    }
    const valid = run()
    assert.equal(valid.status, 0, valid.stdout + valid.stderr)
    assert.match(valid.stdout, /346 exact constructor schemas/u)
    const schemas = join(root, "src/canonical/constructors.ts")
    const source = readFileSync(schemas, "utf8")
    assert.match(source, /Schema\.suspend\(\(\) =>\n/u)
    writeFileSync(schemas, source.replaceAll("partition: Nat", "wrong_partition: Nat"))
    const invalid = run()
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /exact constructor fields/u)
    writeFileSync(schemas, source)
    const reader = join(root, "src/canonical/event-reader.ts")
    const readerSource = readFileSync(reader, "utf8")
    writeFileSync(reader, readerSource.replace("freezeCanonicalData(decodeEvent(value))", "freezeCanonicalData(value)"))
    const undecoded = run()
    assert.notEqual(undecoded.status, 0)
    assert.match(undecoded.stderr, /decodeEvent/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
