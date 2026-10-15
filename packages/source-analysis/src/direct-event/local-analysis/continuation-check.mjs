import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "ContinuationProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
// Mutation inputs come directly from ordinary source owners and are deleted.
const temporary = mkdtempSync(join(tmpdir(), "hapsland-continuation-mutant-"))
try {
  const directory = join(temporary, "local-analysis")
  mkdirSync(directory)
  for (const file of [
    "Model.bend",
    "Core.bend",
    "Specification.bend",
    "Continuation.bend",
    "ContinuationLaws.bend",
    "ContinuationProof.bend"
  ])
    copyFileSync(join(owner, file), join(directory, file))
  const relative = "../graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend"
  mkdirSync(dirname(join(directory, relative)), { recursive: true })
  copyFileSync(join(owner, relative), join(directory, relative))
  const path = join(directory, "Continuation.bend")
  const original = readFileSync(path, "utf8")
  const anchor = "C.Frame{slot, references, [], None{}}"
  assert.equal(original.split(anchor).length, 2)
  writeFileSync(path, original.replace(anchor, "C.Frame{slot, [], [], None{}}"))
  const result = spawnSync("taskset", ["-c", "10", "bend", join(directory, "ContinuationProof.bend"), "--verdict"], {
    timeout: 10000,
    encoding: "utf8"
  })
  if (result.error) throw result.error
  const diagnostic = result.stdout + result.stderr
  assert.equal(result.status, 1, "initial frame cannot lose its pending references")
  assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
  assert.ok(diagnostic.includes("Location: Laws.root_frame_initial"), diagnostic)
  console.log(
    JSON.stringify({
      kernelRoots: 1,
      mutant: "initial_frame_loses_references",
      law: "root_frame_initial",
      rejected: true,
      scope: "initial frame correspondence only; child transport, preservation and whole root remain unproved"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
