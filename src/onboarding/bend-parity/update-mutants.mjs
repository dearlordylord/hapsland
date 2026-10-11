import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const root = "packages/agent-flow-bend/update-policy/"
const source = readFileSync(root + "core.bend", "utf8")
const mutations = [
  [
    "ignore callback fence",
    "Bool.pick(Plan, current, current_step(phase, action, unique, nonempty, matched, valid_digest, more, proposals, pending, approvals_match, yes, return_preview), UpdateHold{})",
    "current_step(phase, action, unique, nonempty, matched, valid_digest, more, proposals, pending, approvals_match, yes, return_preview)"
  ],
  ["apply without digest", "Bool.and(agent_present, digest_present)", "agent_present"],
  ["command without current agent", "Bool.pick(Command, agent_present,", "Bool.pick(Command, True{},"],
  ["ignore duplicate hosts", "Bool.pick(Plan, unique,", "Bool.pick(Plan, True{},"],
  ["target without registrations", "Bool.pick(Phase, nonempty, UpdateTargeting{}, UpdateDone{})", "UpdateTargeting{}"],
  ["accept invalid digest", "Bool.and(matched, valid_digest)", "matched"],
  ["ignore current host", "Bool.pick(Plan, matched,", "Bool.pick(Plan, True{},"],
  [
    "stop previews early",
    "Bool.pick(Phase, more, UpdatePreviewing{},",
    "Bool.pick(Phase, False{}, UpdatePreviewing{},"
  ],
  ["skip grouped review", "Bool.pick(Phase, proposals, UpdateReview{}, UpdateDone{})", "UpdateDone{}"],
  ["ignore grouped proposal match", "Bool.pick(Plan, approvals_match,", "Bool.pick(Plan, True{},"],
  ["ignore affirmative consent", "Bool.pick(Plan, yes,", "Bool.pick(Plan, True{},"],
  [
    "omit declined proposal observations",
    "UpdateAdvance{UpdateDone{}, UpdateSkippedPatch{}}",
    "UpdateAdvance{UpdateDone{}, UpdateNoPatch{}}"
  ],
  [
    "omit discovery payload",
    "Bool.pick(Phase, nonempty, UpdateTargeting{}, UpdateDone{}), UpdateDiscoveredPatch{}",
    "Bool.pick(Phase, nonempty, UpdateTargeting{}, UpdateDone{}), UpdateNoPatch{}"
  ],
  [
    "skip current activation",
    "UpdateAdvance{UpdateActivating{}, UpdateCurrentPreviewPatch{}}",
    "UpdateAdvance{UpdateDone{}, UpdateCurrentPreviewPatch{}}"
  ],
  [
    "omit applied observations",
    "UpdateAdvance{UpdateActivating{}, UpdateObservedActivatePatch{}}",
    "UpdateAdvance{UpdateActivating{}, UpdateNoPatch{}}"
  ],
  ["stop eligible applies early", "Bool.pick(Phase, pending, UpdateApplying{}, UpdateDone{})", "UpdateDone{}"],
  ["ignore preview activation return", "Bool.pick(Plan, return_preview,", "Bool.pick(Plan, False{},"],
  [
    "back discards review",
    "case UpdateApproval{} UpdateBack{}: UpdateAdvance{UpdateReview{}, UpdateNoPatch{}}",
    "case UpdateApproval{} UpdateBack{}: UpdateAdvance{UpdateDone{}, UpdateNoPatch{}}"
  ],
  [
    "exit during apply",
    "case _ _: UpdateHold{}",
    "case UpdateApplying{} UpdateExit{}: UpdateAdvance{UpdateCancelled{}, UpdateSkippedPatch{}}\n    case _ _: UpdateHold{}"
  ]
]
const temporary = mkdtempSync(join(tmpdir(), "hapsland-update-mutants-"))
try {
  const results = []
  for (const [name, before, after] of mutations) {
    const anchor = new RegExp(
      [...before.replace(/\s/g, "")].map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"),
      "g"
    )
    assert.ok(anchor.test(source), name)
    anchor.lastIndex = 0
    const directory = join(temporary, String(results.length))
    mkdirSync(directory)
    const input = join(directory, "core.bend")
    writeFileSync(input, source.replace(anchor, after))
    for (const file of ["LAWS.bend", "PROOF.bend"]) writeFileSync(join(directory, file), readFileSync(root + file))
    const parity = spawnSync(
      process.execPath,
      ["packages/administration/src/onboarding/checks/update-parity.mjs", input],
      { timeout: 5000, encoding: "utf8" }
    )
    assert.equal(parity.error, undefined, name)
    assert.equal(parity.status, 1, `behavioral survivor: ${name}`)
    assert.match(parity.stderr, /AssertionError/)
    const proof = spawnSync("bend", [join(directory, "PROOF.bend"), "--verdict"], { timeout: 5000, encoding: "utf8" })
    assert.equal(proof.error, undefined, name)
    assert.equal(proof.status, 1, `proof survivor: ${name}`)
    assert.match(proof.stdout + proof.stderr, /SOME PROOFS FAIL/)
    assert.doesNotMatch(proof.stdout + proof.stderr, /TODOs found|syntax error|unknown:/i)
    results.push({ name, behavioralResult: "detected", proofResult: "rejected by unchanged approved proofs" })
  }
  writeFileSync(
    "evidence/bend-strangler/update-mutants.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        scope:
          "update command/transition decisions; native frame mapping, queries, consent and owner execution checked separately"
      },
      null,
      2
    ) + "\n"
  )
  console.log(JSON.stringify({ mutantsDetected: results.length }))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
