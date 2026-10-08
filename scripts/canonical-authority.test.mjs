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
    for (const path of [
      "scripts/check-canonical-authority.mjs",
      "packages/canonical-policy/src/canonical",
      "packages/agent-flow-bend"
    ]) {
      mkdirSync(join(root, path, ".."), { recursive: true })
      cpSync(path, join(root, path), { recursive: true })
    }
    const valid = run()
    assert.equal(valid.status, 0, valid.stdout + valid.stderr)
    assert.match(valid.stdout, /349 exact constructor schemas/u)
    const models = join(root, "packages/canonical-policy/src/canonical/models.ts")
    const modelsSource = readFileSync(models, "utf8")
    writeFileSync(
      models,
      modelsSource.replace('kind: Schema.Literal("prepare")', 'kind: Schema.Literal("roundStarted")')
    )
    const wrongCategory = run()
    assert.notEqual(wrongCategory.status, 0)
    assert.match(wrongCategory.stderr, /coverage/u)
    writeFileSync(models, modelsSource)
    const adapter = join(root, "packages/canonical-policy/src/canonical/canonical-boundary.ts")
    const adapterSource = readFileSync(adapter, "utf8")
    writeFileSync(adapter, adapterSource.replace("encodeVariant(readCanonicalEvent(input))", "encodeVariant(input)"))
    const uncheckedEncoder = run()
    assert.notEqual(uncheckedEncoder.status, 0)
    assert.match(uncheckedEncoder.stderr, /encoder must use the checked event reader/u)
    writeFileSync(adapter, adapterSource)
    const reader = join(root, "packages/canonical-policy/src/canonical/event-reader.ts")
    const readerSource = readFileSync(reader, "utf8")
    writeFileSync(reader, readerSource.replace("freezeCanonicalData(decodeEvent(value))", "freezeCanonicalData(value)"))
    const uncheckedReader = run()
    assert.notEqual(uncheckedReader.status, 0)
    assert.match(uncheckedReader.stderr, /reader must freeze decoded foreign events/u)
    writeFileSync(reader, readerSource)
    const scalars = join(root, "packages/canonical-policy/src/canonical/boundary-schema.ts")
    const scalarSource = readFileSync(scalars, "utf8")
    writeFileSync(scalars, scalarSource.replace("const maxNat = 2 ** 48 - 1", "const maxNat = 2 ** 49 - 1"))
    const widenedNat = run()
    assert.notEqual(widenedNat.status, 0)
    assert.match(widenedNat.stderr, /Bend Nat must remain 48-bit/u)
    writeFileSync(scalars, scalarSource)
    const schemas = join(root, "packages/canonical-policy/src/canonical/constructors.ts")
    const source = readFileSync(schemas, "utf8")
    assert.match(source, /Schema\.suspend\(\(\) =>\n/u)
    writeFileSync(schemas, source.replaceAll("partition: Nat", "wrong_partition: Nat"))
    const invalid = run()
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /exact constructor fields/u)
    writeFileSync(schemas, source)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
