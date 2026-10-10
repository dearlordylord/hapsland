import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"

const project = resolve(import.meta.dirname, "../packages/agent-flow-bend")
const core = readFileSync(join(project, "Handoff.bend"), "utf8")
const laws = readFileSync(join(project, "LAWS.bend"), "utf8")
const proofs = readFileSync(join(project, "PROOF.bend"), "utf8")
const section = (source, start, end) =>
  source.slice(
    source.indexOf(start),
    source.indexOf(end, source.indexOf(start)) < 0 ? undefined : source.indexOf(end, source.indexOf(start))
  )
const check = (path) => spawnSync("bend", [path], { encoding: "utf8", timeout: 5_000 })

const mutants = [
  ["last_source_cache_member_drops_cache", "Nat.is_eq(remaining, 0n)", "False{}"],
  ["aborted_delivery_drops_source_cache", "case True{}: True{}", "case True{}: False{}"],
  ["outstanding_source_cache_member_retains_cache", "Nat.is_eq(remaining, 0n)", "True{}"]
]

for (const [law, from, to] of mutants) {
  test(`${law} checks and rejects a compiling false implementation`, () => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-source-cache-law-"))
    try {
      const lawSource = section(laws, `law ${law}:`, "\nlaw ").trimEnd()
      const proofSource = section(proofs, `def Laws.${law}(`, "\ndef ").trimEnd()
      assert.ok(lawSource.startsWith(`law ${law}:`))
      assert.ok(proofSource.startsWith(`def Laws.${law}(`))
      writeFileSync(join(directory, "Handoff.bend"), core)
      writeFileSync(join(directory, "LAWS.bend"), `import Base\nimport ./Handoff.bend as Handoff\n\n${lawSource}\n`)
      writeFileSync(join(directory, "PROOF.bend"), `import Base\nimport ./LAWS.bend as Laws\n\n${proofSource}\n`)
      const original = check(join(directory, "PROOF.bend"))
      assert.equal(original.error, undefined)
      assert.equal(original.status, 0, original.stdout + original.stderr)
      assert.match(original.stdout, /ALL PROOFS CHECK/)

      const target = core.lastIndexOf("def drop_source_cache(")
      const prefix = core.slice(0, target)
      const body = core.slice(target)
      assert.equal(body.split(from).length, 2)
      writeFileSync(join(directory, "Handoff.bend"), prefix + body.replace(from, to))
      const compiled = check(join(directory, "Handoff.bend"))
      assert.equal(compiled.error, undefined)
      assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
      const rejected = check(join(directory, "PROOF.bend"))
      assert.equal(rejected.error, undefined)
      assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr)
      assert.match(rejected.stdout + rejected.stderr, new RegExp(`Location: Laws\\.${law}`))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}
