import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const owner = import.meta.dirname
execFileSync("timeout", ["10s", "taskset", "-c", "10", "bend", join(owner, "ChildBudgetProof.bend"), "--verdict"], {
  timeout: 11000,
  stdio: "pipe"
})
const temporary = mkdtempSync(join(tmpdir(), "hapsland-child-budget-mutant-"))
try {
  const directory = join(temporary, "local-analysis")
  mkdirSync(directory)
  for (const file of [
    "Model.bend",
    "Core.bend",
    "Potential.bend",
    "SelectedTargetLaws.bend",
    "SelectedTargetProof.bend",
    "WeightedInventory.bend",
    "WeightedInventoryProof.bend",
    "ChildBudgetLaws.bend",
    "ChildBudgetProof.bend"
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
  const path = join(directory, "WeightedInventory.bend")
  const original = readFileSync(path, "utf8")
  const anchor = "Nat.add(2n, List.length(&2, M.Reference, references))"
  assert.equal(original.split(anchor).length, 2)
  writeFileSync(path, original.replace(anchor, "Nat.add(1n, List.length(&2, M.Reference, references))"))
  const result = spawnSync("taskset", ["-c", "10", "bend", join(directory, "ChildBudgetProof.bend"), "--verdict"], {
    timeout: 10000,
    encoding: "utf8"
  })
  if (result.error) throw result.error
  const diagnostic = result.stdout + result.stderr
  assert.equal(result.status, 1)
  assert.ok(diagnostic.includes("SOME PROOFS FAIL"), diagnostic)
  assert.ok(diagnostic.includes("Location: Laws.fresh_child_budgets"), diagnostic)
  console.log(
    JSON.stringify({
      mutant: "spec_empty_reference_equation_not_charged",
      law: "fresh_child_budgets",
      rejected: true,
      scope: "fresh-child Core and exact Spec budget transport; full invariant/completion remain unproved"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
