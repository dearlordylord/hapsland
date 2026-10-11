import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const root = "packages/agent-flow-bend/verification-policy/"
const source = readFileSync(root + "core.bend", "utf8")
const mutations = [
  ["permit fourth check", "def max_checks() -> Nat: 3n", "def max_checks() -> Nat: 4n"],
  ["truncate fresh attempt counts", "Nat.min(attempts, max_checks())", "max_checks()"],
  ["ignore callback fence", "Bool.pick(Plan, current, current_step(phase, action, attempts, source, ready, result, yes, stored), VerifyHold{})", "current_step(phase, action, attempts, source, ready, result, yes, stored)"],
  ["ignore consent", "Bool.pick(Plan, yes,", "Bool.pick(Plan, True{},"],
  ["omit attempt increment", "VerifyChecking{}, VerifyAttemptPatch{}", "VerifyChecking{}, VerifyNoPatch{}"],
  ["check unavailable input", "Bool.and(ready, Nat.is_lt(attempts, max_checks()))", "Nat.is_lt(attempts, max_checks())"],
  ["observe absent source", "case VerifyMissingSource{}: False{}", "case VerifyMissingSource{}: True{}"],
  ["replace non-saved source", "def source_saved(source: Source) -> Bool: match source: case VerifySavedSource{}: True{} case _: False{}", "def source_saved(source: Source) -> Bool: True{}"],
  ["recover environment source", "def source_replaceable(source: Source) -> Bool: match source: case VerifySavedSource{}: True{} case VerifyFileSource{}: True{} case _: False{}", "def source_replaceable(source: Source) -> Bool: True{}"],
  ["recover rate limit or success", "def result_recoverable(result: CheckResult) -> Bool: match result: case VerifyRejected{}: True{} case VerifyForbidden{}: True{} case _: False{}", "def result_recoverable(result: CheckResult) -> Bool: True{}"],
  ["back before first check", "Nat.is_gt(attempts, 0n)", "True{}"],
  ["lose completed observation", "VerifyDone{}), VerifyObservationPatch{}", "VerifyDone{}), VerifyNoPatch{}"],
  ["restart after failed save", "Bool.pick(Phase, stored, VerifyLoading{}, VerifyDone{})", "VerifyLoading{}"],
  ["wrong loading command", "case VerifyLoading{}: VerifyLoadCommand{}", "case VerifyLoading{}: VerifyCheckCommand{}"]
]
const temporary = mkdtempSync(join(tmpdir(), "hapsland-verification-mutants-"))
try {
  const results = []
  for (const [name, before, after] of mutations) {
    const anchor = new RegExp([...before.replace(/\s/g, "")].map(character => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "g")
    assert.ok(anchor.test(source), name)
    anchor.lastIndex = 0
    const directory = join(temporary, String(results.length)); mkdirSync(directory)
    const input = join(directory, "core.bend")
    writeFileSync(input, source.replace(anchor, after))
    for (const file of ["LAWS.bend", "PROOF.bend"]) writeFileSync(join(directory, file), readFileSync(root + file))
    const parity = spawnSync(process.execPath, ["packages/administration/src/onboarding/checks/verification-parity.mjs", input], { timeout: 5000, encoding: "utf8" })
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
  writeFileSync("evidence/bend-strangler/verification-mutants.json", JSON.stringify({ at: new Date().toISOString(), results, scope: "verification decisions and numeric attempt classification; host payload, command execution and consent mechanisms checked separately" }, null, 2) + "\n")
  console.log(JSON.stringify({ mutantsDetected: results.length }))
} finally { rmSync(temporary, { recursive: true, force: true }) }
