import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "EntryProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
const temporary = mkdtempSync(join(tmpdir(), "hapsland-child-entry-mutants-"))
try {
  // Preserve the ordinary proof dependency layout in this cleaned input.
  const facts = "graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend"
  const localDirectory = join(temporary, "local-analysis")
  mkdirSync(localDirectory)
  for (const file of [
    "Model.bend",
    "Core.bend",
    "Specification.bend",
    "Continuation.bend",
    "ContinuationLaws.bend",
    "ContinuationProof.bend",
    "EntryLaws.bend",
    "EntryProof.bend"
  ])
    copyFileSync(join(owner, file), join(localDirectory, file))
  mkdirSync(dirname(join(temporary, facts)), { recursive: true })
  copyFileSync(join(owner, "..", facts), join(temporary, facts))
  const path = join(localDirectory, "Core.bend")
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
    const result = spawnSync("taskset", ["-c", "10", "bend", join(localDirectory, "EntryProof.bend"), "--verdict"], {
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
  writeFileSync(path, original)
  const continuationPath = join(localDirectory, "Continuation.bend")
  const continuationSource = readFileSync(continuationPath, "utf8")
  const anchor = "S.ReferencesRequest{parent_pending, state, subtotal}"
  assert.equal(continuationSource.split(anchor).length, 2)
  writeFileSync(continuationPath, continuationSource.replace(anchor, "S.ReferencesRequest{[], state, subtotal}"))
  const result = spawnSync("taskset", ["-c", "10", "bend", join(localDirectory, "EntryProof.bend"), "--verdict"], {
    timeout: 10000,
    encoding: "utf8"
  })
  if (result.error) throw result.error
  const diagnostic = result.stdout + result.stderr
  assert.equal(result.status, 1)
  assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
  assert.ok(diagnostic.includes("Location: branch_continuation"), diagnostic)
  console.log(
    JSON.stringify({
      mutant: "parked_siblings_lost",
      rejected: true,
      location: "branch_continuation",
      scope: "shared helper of child_entry_frame, not its law section"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
