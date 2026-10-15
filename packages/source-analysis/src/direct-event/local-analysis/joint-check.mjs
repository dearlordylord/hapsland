import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "JointProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
const temporary = mkdtempSync(join(tmpdir(), "hapsland-joint-initial-mutant-"))
try {
  const directory = join(temporary, "local-analysis")
  mkdirSync(directory)
  for (const file of [
    "Model.bend",
    "Core.bend",
    "Specification.bend",
    "Continuation.bend",
    "ContinuationLaws.bend",
    "ContinuationProof.bend",
    "Potential.bend",
    "PotentialLaws.bend",
    "PotentialProof.bend",
    "WeightedInventory.bend",
    "Joint.bend",
    "JointLaws.bend",
    "JointProof.bend"
  ])
    copyFileSync(join(owner, file), join(directory, file))
  for (const relative of [
    "../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend",
    "../graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend",
    "../graph-resolution/RuntimeNatProof.bend"
  ]) {
    mkdirSync(dirname(join(directory, relative)), { recursive: true })
    copyFileSync(join(owner, relative), join(directory, relative))
  }
  const path = join(directory, "Joint.bend")
  const original = readFileSync(path, "utf8")
  assert.equal(original.split("[identity]").length, 2)
  writeFileSync(path, original.replace("[identity]", "[]"))
  const result = spawnSync("taskset", ["-c", "10", "bend", join(directory, "JointProof.bend"), "--verdict"], {
    timeout: 10000,
    encoding: "utf8"
  })
  if (result.error) throw result.error
  const diagnostic = result.stdout + result.stderr
  assert.equal(result.status, 1)
  assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
  assert.ok(diagnostic.includes("Location: Laws.initial_cursor"), diagnostic)
  console.log(
    JSON.stringify({
      mutant: "root_identity_not_expanded",
      law: "initial_cursor",
      rejected: true,
      scope:
        "initial joint cursor and actual root-entry bridge; preservation, Engine/trace and whole root remain unproved"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
