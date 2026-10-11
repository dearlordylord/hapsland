import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const root = "packages/agent-flow-bend/setup-policy"
execFileSync("bend", [join(root, "PROOF.bend"), "--verdict"], { timeout: 5000 })
const source = readFileSync(join(root, "core.bend"), "utf8")
const mutants = [
  [
    "missing-preview",
    "case SetupPreviewing{}: SetupPreview{}",
    "case SetupPreviewing{}: SetupNoCommand{}",
    "command_exact"
  ],
  ["terminal-command", "case _: SetupNoCommand{}", "case _: SetupApply{}", "command_exact"],
  [
    "pending-cannot-proceed",
    "case SetupPending{}: True{}",
    "case SetupPending{}: False{}",
    "installation_proceed_exact"
  ],
  [
    "pending-claimed-written",
    "def installation_was_written(status: StageStatus) -> Bool:\n  match status:",
    "def installation_was_written(status: StageStatus) -> Bool:\n  match status:\n    case SetupPending{}: True{}",
    "installation_written_exact"
  ],
  ["skipped-rules-rejected", "case SetupSkipped{}: True{}", "case SetupSkipped{}: False{}", "readiness_exact"],
  [
    "missing-repository-admitted",
    "complete(installation) && complete(credential) && complete(repository) && rules_ready(rules)",
    "complete(installation) && complete(credential) && rules_ready(rules)",
    "readiness_exact"
  ],
  ["stale-revision-admitted", "Bool.pick(Plan, current,", "Bool.pick(Plan, True{},", "step_exact"],
  [
    "back-does-not-clear-hook-approval",
    "SetupAdvance{SetupBack{}, SetupClearApprovalsPatch{}, SetupKeepExit{}}",
    "SetupAdvance{SetupBack{}, SetupNoPatch{}, SetupKeepExit{}}",
    "step_exact"
  ],
  [
    "rules-back-wrong-phase",
    "case SetupRulesApproval{} SetupNavigateBack{}:\n      SetupAdvance{SetupPreviewing{}, SetupClearApprovalsPatch{}, SetupKeepExit{}}",
    "case SetupRulesApproval{} SetupNavigateBack{}:\n      SetupAdvance{SetupBack{}, SetupClearApprovalsPatch{}, SetupKeepExit{}}",
    "step_exact"
  ],
  [
    "approval-exit-clears-digests",
    "case SetupHookApproval{} SetupExit{}:\n      SetupAdvance{SetupCancelled{}, SetupNoPatch{}, SetupKeepExit{}}",
    "case SetupHookApproval{} SetupExit{}:\n      SetupAdvance{SetupCancelled{}, SetupClearApprovalsPatch{}, SetupKeepExit{}}",
    "step_exact"
  ],
  [
    "activation-failure-state-lost",
    "SetupAdvance{SetupFailed{}, SetupFailedActivationPatch{}, SetupExitSix{}}",
    "SetupAdvance{SetupFailed{}, SetupNoPatch{}, SetupExitSix{}}",
    "step_exact"
  ],
  [
    "compatibility-failure-wrong-exit",
    "SetupAdvance{SetupDone{}, SetupPreviewPatch{}, SetupExitThree{}}",
    "SetupAdvance{SetupDone{}, SetupPreviewPatch{}, SetupExitFour{}}",
    "step_exact"
  ],
  [
    "preview-proposal-not-cleared",
    "SetupAdvance{approval_phase(install_digest, rules_digest), SetupPreviewPatch{}, SetupKeepExit{}}",
    "SetupAdvance{approval_phase(install_digest, rules_digest), SetupNoPatch{}, SetupKeepExit{}}",
    "step_exact"
  ],
  [
    "written-installation-skips-activation",
    "SetupAdvance{SetupActivating{}, SetupAppendPatch{}, SetupKeepExit{}}",
    "SetupAdvance{SetupCancelled{}, SetupAppendPatch{}, SetupKeepExit{}}",
    "step_exact"
  ],
  [
    "fresh-proposal-keeps-old-approvals",
    "SetupAdvance{approval_phase(install_digest, rules_digest), SetupFreshProposalPatch{}, SetupKeepExit{}}",
    "SetupAdvance{approval_phase(install_digest, rules_digest), SetupAppendPatch{}, SetupKeepExit{}}",
    "step_exact"
  ],
  ["undefined-digest-allows-fresh-proposal", "Bool.and(pending, install_present)", "pending", "step_exact"],
  [
    "digest-fence-ignored",
    "case SetupHookApproval{} SetupApproveHooks{}:\n      Bool.pick(Plan, digest_match,",
    "case SetupHookApproval{} SetupApproveHooks{}:\n      Bool.pick(Plan, True{},",
    "step_exact"
  ],
  [
    "invalid-progress-admitted",
    "Bool.pick(Plan, sequence_next, SetupProgress{}, SetupHold{})",
    "SetupProgress{}",
    "step_exact"
  ],
  [
    "progress-increments-revision",
    "Bool.pick(Plan, sequence_next, SetupProgress{}, SetupHold{})",
    "Bool.pick(Plan, sequence_next, SetupAdvance{SetupApplying{}, SetupAppendPatch{}, SetupKeepExit{}}, SetupHold{})",
    "step_exact"
  ],
  [
    "activation-observation-not-recorded",
    "after_activation_plan(SetupActivatedPatch{}, cancelled, ready, partial)",
    "after_activation_plan(SetupNoPatch{}, cancelled, ready, partial)",
    "step_exact"
  ],
  [
    "verification-cancellation-ignored",
    "Bool.pick(Phase, cancelled, SetupCancelled{}, SetupDiagnosing{})",
    "SetupDiagnosing{}",
    "step_exact"
  ],
  [
    "diagnosis-failure-reports-zero",
    "Bool.pick(ExitChoice, succeeded, SetupExitZero{}, SetupExitSix{})",
    "SetupExitZero{}",
    "step_exact"
  ],
  [
    "terminal-reopened",
    "case _ _: SetupHold{}",
    "case SetupDone{} SetupExit{}: SetupAdvance{SetupPreviewing{}, SetupNoPatch{}, SetupKeepExit{}}\n    case _ _: SetupHold{}",
    "step_exact"
  ]
]
const results = []
for (const [name, from, to, law] of mutants) {
  const compact = source.replace(/\s/g, "")
  const needle = from.replace(/\s/g, "")
  assert.equal(compact.split(needle).length, 2, name + " unique mutation")
  const offsets = [...source.matchAll(/\S/g)].map((m) => m.index),
    start = compact.indexOf(needle)
  const mutated = source.slice(0, offsets[start]) + to + source.slice(offsets[start + needle.length - 1] + 1)
  const temp = mkdtempSync(join(tmpdir(), "hapsland-setup-mutant-"))
  try {
    writeFileSync(join(temp, "core.bend"), mutated)
    for (const file of ["LAWS.bend", "PROOF.bend"]) copyFileSync(join(root, file), join(temp, file))
    const validity = spawnSync("bend", [join(temp, "core.bend")], { timeout: 5000, encoding: "utf8" })
    assert.equal(validity.status, 0, name + " malformed mutation: " + validity.stdout + validity.stderr)
    const proof = spawnSync("bend", [join(temp, "PROOF.bend"), "--verdict"], { timeout: 5000, encoding: "utf8" })
    assert.equal(proof.error, undefined)
    assert.notEqual(proof.status, 0, name + " survived")
    assert.ok(
      (proof.stdout + proof.stderr).includes(law),
      name + " rejected outside law: " + proof.stdout + proof.stderr
    )
    results.push({ name, law, wellFormed: true, unchangedKernelProofRejected: true })
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
const record = {
  sourceSha256: Object.fromEntries(
    ["core.bend", "LAWS.bend", "PROOF.bend"].map((file) => [
      file,
      createHash("sha256")
        .update(readFileSync(join(root, file)))
        .digest("hex")
    ])
  ),
  at: new Date().toISOString(),
  mutantsDetected: results.length,
  results,
  scope:
    "all five setup laws; each well-formed wrong core fails its unchanged law proof; host correctness checked separately"
}
writeFileSync(new URL("./setup-mutants.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
console.log(JSON.stringify(record))
