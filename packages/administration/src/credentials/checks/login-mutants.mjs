import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const root = "packages/agent-flow-bend/login-policy/"
const source = readFileSync(root + "core.bend", "utf8")
const mutations = [
  ["ignore revision fence", "Bool.pick(Plan, current, current_step(phase, action, matched, blocked, yes, stale), LoginHold{})", "current_step(phase, action, matched, blocked, yes, stale)"],
  ["ignore proposal correlation", "Bool.pick(Plan, matched,", "Bool.pick(Plan, True{},"],
  ["ignore declined consent", "Bool.pick(Plan, yes,", "Bool.pick(Plan, True{},"],
  ["exit during saving", "case LoginSavingKey{} LoginExit{}: LoginHold{}", "case LoginSavingKey{} LoginExit{}: LoginAdvance{LoginCancelled{}, LoginNoPatch{}}"],
  ["exit during active read", "case LoginCheckingActive{} LoginExit{}: LoginHold{}", "case LoginCheckingActive{} LoginExit{}: LoginAdvance{LoginCancelled{}, LoginNoPatch{}}"],
  ["reopen completed flow", "case LoginDone{} _: LoginHold{}", "case LoginDone{} _: LoginReset{}"],
  ["reopen cancelled flow", "case LoginCancelled{} _: LoginHold{}", "case LoginCancelled{} _: LoginReset{}"],
  ["accept blocked proposal", "Bool.pick(Plan, blocked,", "Bool.pick(Plan, False{},"],
  ["accept stale storage", "Bool.pick(Plan, stale,", "Bool.pick(Plan, False{},"],
  ["back retains payloads", "case LoginEnteringKey{} LoginBack{}: LoginReset{}", "case LoginEnteringKey{} LoginBack{}: LoginAdvance{LoginSelectingDestination{}, LoginNoPatch{}}"],
  ["wrong payload patch", "LoginEnteringKey{}, LoginProposalPatch{}", "LoginEnteringKey{}, LoginNoPatch{}"],
  ["wrong terminal command", "case LoginDone{}: LoginNoCommand{}", "case LoginDone{}: LoginSave{}"]
]
const temporary = mkdtempSync(join(tmpdir(), "hapsland-login-mutants-"))
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
    const parity = spawnSync(process.execPath, ["packages/administration/src/credentials/checks/login-parity.mjs", input], { timeout: 5000, encoding: "utf8" })
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
  writeFileSync("evidence/bend-strangler/login-mutants.json", JSON.stringify({ at: new Date().toISOString(), results, scope: "finite navigation policy; host payload and consent mechanisms checked separately" }, null, 2) + "\n")
  console.log(JSON.stringify({ mutantsDetected: results.length }))
} finally { rmSync(temporary, { recursive: true, force: true }) }
