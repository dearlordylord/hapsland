import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
const root = "packages/agent-flow-bend/setup-selection-policy"
const source = readFileSync(root + "/core.bend", "utf8")
const mutants = [
  ["back_finishes", "case HostBack{}: SelectingAgents{}", "case HostBack{}: SelectionDone{}"],
  ["cancellation_finishes", "case HostCancelled{}: SelectionCancelled{}", "case HostCancelled{}: SelectionDone{}"],
  ["completion_always_done", "has_next,", "False{},"],
  ["completion_always_runs", "has_next,", "True{},"],
  ["empty_selection_starts", "nonempty,", "True{},"],
  ["nonempty_selection_holds", "nonempty,", "False{},"],
  [
    "selection_end_cancels",
    "case SelectingAgents{} SelectionEnded{}: SelectionEnd{}",
    "case SelectingAgents{} SelectionEnded{}: SelectionObserved{SelectionCancelled{}}"
  ],
  ["observation_holds", "SelectionObserved{observed_phase(outcome, has_next)}", "SelectionHold{}"],
  ["terminal_can_restart", "case _ _: SelectionHold{}", "case _ _: SelectionStart{}"]
]
const results = []
for (const [name, before, after] of mutants) {
  assert.ok(source.includes(before), name)
  const d = mkdtempSync(join(tmpdir(), "hapsland-selection-mutant-"))
  try {
    writeFileSync(join(d, "core.bend"), source.replace(before, after))
    for (const f of ["LAWS.bend", "PROOF.bend"]) copyFileSync(join(root, f), join(d, f))
    execFileSync("bend", [join(d, "core.bend")], { timeout: 5000, stdio: "pipe" })
    const proof = spawnSync("bend", [join(d, "PROOF.bend"), "--verdict"], { timeout: 5000, encoding: "utf8" })
    assert.equal(proof.status, 1, name)
    assert.equal(proof.error, undefined, name)
    results.push({ name, wellFormed: true, unchangedKernelProofRejected: true, exitCode: proof.status })
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
}
const r = {
  at: new Date().toISOString(),
  passed: true,
  sha256: Object.fromEntries(
    ["core.bend", "LAWS.bend", "PROOF.bend"].map((f) => [
      f,
      createHash("sha256")
        .update(readFileSync(join(root, f)))
        .digest("hex")
    ])
  ),
  mutants: results,
  scope:
    "nine well-formed non-equivalent source faults rejected by unchanged step_exact kernel proof; no production or effect claim"
}
writeFileSync("evidence/bend-strangler/setup-selection-mutants.json", JSON.stringify(r, null, 2) + "\n")
console.log(JSON.stringify(r))
