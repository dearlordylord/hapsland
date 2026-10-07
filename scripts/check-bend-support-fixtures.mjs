// Runs only synthetic fixtures; the product never invokes Bend on edited source.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { readBendToolchain } from "./bend-toolchain.mjs"
import { bendFixtures, bendExtractionFixtures } from "./bend-validation-fixtures.mjs"
const root = new URL("../", import.meta.url)
const expectedVersion = `bend ${readBendToolchain(fileURLToPath(root)).bend.version}`
const version = execFileSync("bend", ["version"], { encoding: "utf8" }).trim()
if (version !== expectedVersion) throw new Error(`Expected pinned ${expectedVersion}; observed ${version}`)
const temporary = await mkdtemp(join(tmpdir(), "hapsland-bend-compiler-"))
const outcomes = []
const good = bendFixtures.find((fixture) => fixture.id.endsWith("good"))
const examples = [
  ...bendFixtures.map((fixture) => ({ ...fixture, expected: "accepted" })),
  ...bendExtractionFixtures.map((fixture) => ({ ...fixture, expected: "accepted" })),
  ...[
    { id: "pending", expression: "Pending{}" },
    { id: "succeeded", expression: 'Succeeded{"receipt"}' },
    { id: "failed", expression: 'Failed{"reason"}' }
  ].map(({ id, expression }) => ({
    id: `valid-${id}`,
    source: `${good.source}\ndef main() -> PaymentState:\n  ${expression}\n`,
    expected: "accepted"
  })),
  ...[
    { id: "pending-with-receipt", expression: 'Pending{"receipt"}' },
    { id: "succeeded-without-receipt", expression: "Succeeded{}" },
    { id: "failed-without-reason", expression: "Failed{}" }
  ].map(({ id, expression }) => ({
    id: `invalid-${id}`,
    source: `${good.source}\ndef main() -> PaymentState:\n  ${expression}\n`,
    expected: "rejected"
  }))
]
try {
  for (const fixture of examples) {
    const path = join(temporary, "fixture.bend")
    for (const [name, source] of Object.entries(fixture.files ?? {})) await writeFile(join(temporary, name), source)
    await writeFile(path, fixture.source)
    let actual = "accepted"
    try {
      execFileSync("bend", [path, "--check-only"], { stdio: "pipe", timeout: 15000 })
    } catch (error) {
      // A timeout or launch failure is not compiler rejection.
      actual = typeof error.status === "number" && error.status !== 0 ? "rejected" : "harness-failure"
    }
    outcomes.push({
      fixtureId: fixture.id,
      sourceHash: createHash("sha256").update(fixture.source).digest("hex"),
      ...(fixture.files === undefined
        ? {}
        : {
            supportingSourceHashes: Object.fromEntries(
              Object.entries(fixture.files).map(([name, source]) => [
                name,
                createHash("sha256").update(source).digest("hex")
              ])
            )
          }),
      expected: fixture.expected,
      actual
    })
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
const record = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  compilerVersion: version,
  command: "bend <synthetic-fixture> --check-only",
  outcomes,
  verdict: outcomes.every((outcome) => outcome.actual === outcome.expected) ? "demonstrated" : "incomplete",
  scope:
    "Synthetic fixture syntax, generic binding and quantity arguments, imports and constructor arity only; no proof, review-quality, or native delivery claim."
}
await mkdir(new URL("evidence/bend-support/", root), { recursive: true })
await writeFile(new URL("evidence/bend-support/compiler-fixtures.json", root), JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify(record, null, 2))
if (record.verdict !== "demonstrated") process.exitCode = 1
