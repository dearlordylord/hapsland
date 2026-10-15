import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "PotentialProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
// One cleaned semantic-mutation input, copied from current tracked owners.
// The Nat fact keeps its ordinary relative dependency path; no snapshot persists.
const temporary = mkdtempSync(join(tmpdir(), "hapsland-local-entry-mutant-"))
try {
  const directory = join(temporary, "local-analysis")
  mkdirSync(directory)
  for (const file of ["Model.bend", "Core.bend", "Potential.bend", "PotentialLaws.bend", "PotentialProof.bend"])
    copyFileSync(join(owner, file), join(directory, file))
  const facts = "../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend"
  mkdirSync(dirname(join(directory, facts)), { recursive: true })
  copyFileSync(join(owner, facts), join(directory, facts))
  const path = join(directory, "Core.bend")
  const original = readFileSync(path, "utf8")
  const start = original.indexOf("def start_root(")
  const end = original.indexOf("def next_root(", start)
  assert.ok(start >= 0 && end > start)
  const entry = original.slice(start, end)
  const anchor = "          rest,\n"
  assert.equal(entry.split(anchor).length, 2, "entry tick mutation must select the semantic remaining field")
  writeFileSync(
    path,
    original.slice(0, start) + entry.replace(anchor, "          Nat.sub(rest, 1n),\n") + original.slice(end)
  )
  const result = spawnSync("taskset", ["-c", "10", "bend", join(directory, "PotentialProof.bend"), "--verdict"], {
    timeout: 10000,
    encoding: "utf8"
  })
  if (result.error) throw result.error
  const diagnostic = result.stdout + result.stderr
  assert.equal(result.status, 1, "double entry charge must fail the initial invariant")
  assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
  assert.ok(diagnostic.includes("Location: Laws.root_entry_valid"), diagnostic)
  console.log(
    JSON.stringify({
      kernelRoots: 1,
      mutant: "entry_charged_twice",
      law: "root_entry_valid",
      rejected: true,
      scope: "initial potential only; preservation, joint root and whole laws remain unproved"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
