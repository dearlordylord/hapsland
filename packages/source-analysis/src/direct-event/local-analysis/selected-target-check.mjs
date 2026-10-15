import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "SelectedTargetProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
// Mutation inputs come directly from ordinary source owners and are deleted.
const temporary = mkdtempSync(join(tmpdir(), "hapsland-selected-target-mutant-"))
try {
  const directory = join(temporary, "local-analysis")
  mkdirSync(directory)
  for (const file of [
    "Model.bend",
    "Core.bend",
    "Potential.bend",
    "SelectedTargetLaws.bend",
    "SelectedTargetProof.bend"
  ])
    copyFileSync(join(owner, file), join(directory, file))
  for (const file of [
    "INTERPRETER_COMPLETION_NAT_FACTS.bend",
    "INTERPRETER_STRING_FACTS.bend",
    "INTERPRETER_NAT_FACTS.bend",
    "INTERPRETER_BOOL_FACTS.bend"
  ]) {
    const relative = join("../graph-resolution/traversal", file)
    mkdirSync(dirname(join(directory, relative)), { recursive: true })
    copyFileSync(join(owner, relative), join(directory, relative))
  }
  const path = join(directory, "Core.bend")
  const original = readFileSync(path, "utf8")
  const anchor = "case M.Catalog{declarations, _} None{}: lookup_declarations(name, declarations, None{})"
  assert.equal(original.split(anchor).length, 2)
  writeFileSync(
    path,
    original.replace(
      anchor,
      'case M.Catalog{_, _} None{}: Some{M.Declaration{0n, "outside-catalog", "outside-catalog", []}}'
    )
  )
  const result = spawnSync("taskset", ["-c", "10", "bend", join(directory, "SelectedTargetProof.bend"), "--verdict"], {
    timeout: 10000,
    encoding: "utf8"
  })
  if (result.error) throw result.error
  const diagnostic = result.stdout + result.stderr
  assert.equal(result.status, 1, "lookup cannot charge a declaration outside the catalog")
  assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
  assert.ok(diagnostic.includes("Location: Laws.selected_target_drop"), diagnostic)
  console.log(
    JSON.stringify({
      kernelRoots: 1,
      mutant: "lookup_fabricates_declaration",
      law: "selected_target_drop",
      rejected: true,
      scope: "selected-target budget only; traversal preservation and correspondence remain unproved"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
