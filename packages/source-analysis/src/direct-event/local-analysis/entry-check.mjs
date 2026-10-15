import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "EntryProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
const temporary = mkdtempSync(join(tmpdir(), "hapsland-child-entry-mutants-"))
try {
  for (const file of ["Model.bend", "Core.bend", "EntryLaws.bend", "EntryProof.bend"])
    copyFileSync(join(owner, file), join(temporary, file))
  const path = join(temporary, "Core.bend")
  const original = readFileSync(path, "utf8")
  const start = original.indexOf("def enter_child(")
  const end = original.indexOf("def named_seen(", start)
  assert.ok(start >= 0 && end > start)
  const entry = original.slice(start, end)
  for (const [mutant, anchor, replacement] of [
    ["child_identity_not_recorded", "identity <> expanded", "expanded"],
    ["parent_frames_lost", "Some{symbol}} <> parents", "Some{symbol}} <> []"],
    ["declaration_tick_not_spent", "failure, rest,", "failure, 1n+rest,"]
  ]) {
    assert.equal(entry.split(anchor).length, 2, `${mutant}: unique semantic anchor`)
    writeFileSync(path, original.slice(0, start) + entry.replace(anchor, replacement) + original.slice(end))
    const result = spawnSync("taskset", ["-c", "10", "bend", join(temporary, "EntryProof.bend"), "--verdict"], {
      timeout: 10000,
      encoding: "utf8"
    })
    if (result.error) throw result.error
    const diagnostic = result.stdout + result.stderr
    assert.equal(result.status, 1)
    assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
    assert.ok(diagnostic.includes("Location: Laws.child_entry_step"), diagnostic)
    console.log(JSON.stringify({ mutant, law: "child_entry_step", rejected: true }))
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
