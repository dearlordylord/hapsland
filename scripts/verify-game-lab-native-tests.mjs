import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createGameStreams } from "../prototypes/canonical-defense/game-stream-runner.mjs"

// Compile the shared graph once; each unchanged predicate still runs separately.
// Replaces repeated C30 roots after measured compiler-only timeouts, not failed assertions.
// The authenticated supervisor owns380s total; source5s and each execution5s remain.
const root = resolve(fileURLToPath(new URL("../", import.meta.url)))
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const labels = [
  "Work Accelerator costs50",
  "Result Courier costs40",
  "removed building kind refused",
  "custom construction price17",
  "illegal placement costs zero",
  "unaffordable purchase costs zero",
  "absent tower upgrade costs zero",
  "accelerator upgrade40+60 and maximum3",
  "courier maximum3 costs40+32+48",
  "hard one-event and zero-event budgets",
  "construction preserves captured3200 and forced clear",
  "late request retains3200",
  "courier construction preserves output800 and lease5000",
  "issued individual output lease5000",
  "late output retains800",
  "accelerator does not invent access",
  "failed source work is gone",
  "construction does not resurrect work",
  "construction does not restore blocked access",
  "construction issues no abandoned request",
  "active accelerator50 and courier40 investments",
  "targeted shot costs zero and arms cooldown",
  "selected operation completes while sibling remains at Jev",
  "absent active work and clear courier refuse free",
  "second tower can stack a visible hit or choose a sibling",
  "expired output authority refuses courier without cooldown"
]
export function selection(args) {
  const ids = args.map((value) => {
    if (!/^(?:[0-9]|1[0-9]|2[0-5])$/.test(value)) throw new Error("Select distinct property ids0..25")
    return Number(value)
  })
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate property selection")
  return ids.length ? ids : labels.map((_, id) => id)
}
export function fixtureText(ownerText, owner, transport, selected) {
  const parts = ownerText.split(/(?=^def )/m)
  const definitions = new Map(parts.slice(1).map((text) => [text.match(/^def (\w+)/)[1], text]))
  const names = new Set(selected.map((id) => `test_${id}`)),
    pending = [...names]
  while (pending.length) {
    const name = pending.pop(),
      text = definitions.get(name)
    assert.ok(text, `missing predicate ${name}`)
    for (const candidate of definitions.keys())
      if (!names.has(candidate) && new RegExp(`\\b${candidate}\\b`).test(text)) {
        names.add(candidate)
        pending.push(candidate)
      }
  }
  const imports = parts[0]
    .split("\n")
    .filter((line) => line.startsWith("import "))
    .map((line) => line.replace(/^(import )([.][^ ]+)/, (_, prefix, path) => prefix + resolve(dirname(owner), path)))
  return `${imports.join("\n")}
import ${transport} as NumericOutput
${[...definitions]
  .filter(([name]) => names.has(name))
  .map(([, text]) => text)
  .join("")}
def flag(ok: Bool) -> Nat:
  match ok:
    case True{}: 1n
    case False{}: 0n
def predicate(id: Nat,seed: Nat,budget: U32,fuel: Nat) -> Bool:
  match id:
${selected.map((id) => `    case ${id}n: test_${id}(seed,budget${id >= 12 && id <= 14 ? ",fuel" : ""})`).join("\n")}
    case _: False{}
def three(text: String) -> Nat:
  match text:
    case SCon{a,SCon{b,SCon{c,SNil{}}}}:
      (U32.to_nat((Char.to_u32(a) - 48 : U32)) * 100n + U32.to_nat((Char.to_u32(b) - 48 : U32)) * 10n + U32.to_nat((Char.to_u32(c) - 48 : U32)) : Nat)
    case _: 999n
def checked(valid: Bool,+id: Nat,seed: Nat,budget: Nat,fuel: Nat) -> IO(Unit):
  match valid:
    case True{}: NumericOutput.write([id,flag(predicate(id,seed,U32.from_nat(budget),fuel))])
    case False{}: IO.die(Unit,1,"expected id 152 160 250")
def inputs(+id: Nat,+seed: Nat,+budget: Nat,+fuel: Nat) -> IO(Unit):
  checked(Nat.is_eq(seed,152n) && Nat.is_eq(budget,160n) && Nat.is_eq(fuel,250n),id,seed,budget,fuel)
def arguments(args: List<String>) -> IO(Unit):
  match args:
    case _ <> id <> seed <> budget <> fuel <> Nil{}: inputs(three(id),three(seed),three(budget),three(fuel))
    case _: IO.die(Unit,1,"expected id 152 160 250")
def main() -> IO(Unit):
  IO.bind(List<String>,Unit,IO.args(),args => arguments(args))
`
}
export function checkSourceResult(result) {
  const diagnostics = result.stderr.replace(/\nbend [0-9]+\.[0-9]+\.[0-9]+ is available: run bend update\n?$/, "")
  const names = diagnostics.trim().split("\n").slice(2)
  const foreign =
    result.status === 1 &&
    /^SOME PROOFS FAIL\nError: 5 defs rely on unsafe or foreign code:\n/.test(diagnostics) &&
    names.length === 5 &&
    names.filter((line) => /^- .*DefenseNumericOutput\.write$/.test(line)).length === 1 &&
    ["checked", "inputs", "arguments", "main"].every(
      (name) => names.filter((line) => line === `- ${name}`).length === 1
    )
  if (result.error || (result.status !== 0 && !foreign))
    throw new Error(`batch-source-check failed: ${result.error?.code ?? diagnostics}`)
}
export function verifyRows(native, emitted, selected) {
  assert.equal(native.length, selected.length, "complete native predicate coverage")
  assert.equal(emitted.length, selected.length, "complete emitted predicate coverage")
  return selected.map((id, index) => {
    assert.deepEqual(native[index], [id, 1], labels[id])
    assert.deepEqual(emitted[index], [id, 1], labels[id])
    assert.deepEqual(native[index], emitted[index], "complete original predicate output agreement")
    return { id, label: labels[id], native: native[index], emitted: emitted[index] }
  })
}
export function verifyExecutionIdentity(identity, selected) {
  assert.ok(identity && identity.sources.length && identity.tools.length, "full source/tool provenance")
  for (const name of ["cHash", "binaryHash", "jsHash"]) assert.match(identity.origin[name], /^[a-f0-9]{64}$/)
  assert.deepEqual(
    identity.origin.executionArgumentGroups,
    selected.map((id) => [String(id).padStart(3, "0"), "152", "160", "250"])
  )
  return identity
}
export function assertFrozen(files) {
  for (const [file, expected] of files)
    assert.equal(hash(readFileSync(file)), expected, `qualification input changed: ${file}`)
}
async function worker(selected) {
  const owner = join(root, "prototypes/canonical-defense/DefenseLabTests.bend")
  const transport = join(root, "prototypes/canonical-defense/DefenseNumericOutput.bend")
  const runner = fileURLToPath(import.meta.url),
    ownerText = readFileSync(owner, "utf8")
  const frozen = [owner, runner].map((file) => [file, hash(readFileSync(file))])
  mkdirSync(join(root, ".tools/canonical-defense"), { recursive: true })
  mkdirSync(join(root, ".test-runs"), { recursive: true })
  const directory = mkdtempSync(join(root, ".tools/canonical-defense/lab-assertions-"))
  const evidence = mkdtempSync(join(root, ".test-runs/lab-native-assertions-"))
  const path = join(directory, "predicates.bend"),
    text = fixtureText(ownerText, owner, transport, selected)
  const deadline = Number(process.env.HAPSLAND_GAME_OUTER_DEADLINE_MS)
  const summary = {
    format: 1,
    selected,
    unselected: labels.map((_, id) => id).filter((id) => !selected.includes(id)),
    owner,
    sourceHash: frozen[0][1],
    runnerHash: frozen[1][1],
    deadline,
    scope:
      "shared compilation; independently expected predicates; separate native/emitted execution5s each; no platform claim"
  }
  let streams
  try {
    writeFileSync(path, text)
    writeFileSync(join(evidence, "fixture.bend"), text)
    const checked = spawnSync("bend", [relative(root, path), "--check-only"], {
      cwd: root,
      encoding: "utf8",
      timeout: Math.min(5000, deadline - Date.now()),
      maxBuffer: 4 * 1024 * 1024
    })
    writeFileSync(
      join(evidence, "source-check.json"),
      JSON.stringify({
        status: checked.status,
        error: checked.error?.code,
        stdout: checked.stdout,
        stderr: checked.stderr
      })
    )
    checkSourceResult(checked)
    assertFrozen(frozen)
    streams = await createGameStreams(
      pathToFileURL(path),
      frozen.map(([file, sha256]) => ({ path: file, sha256 })),
      {
        registerBank: true,
        emissionTimeoutMs: 0,
        clangTimeoutMs: 120000,
        jsEmissionTimeoutMs: 0,
        executionTimeoutMs: 5000,
        overallDeadlineMs: deadline,
        executionArgumentGroups: selected.map((id) => [String(id).padStart(3, "0"), "152", "160", "250"])
      }
    )
    assertFrozen(frozen)
    const rows = (paths) => paths.map((path) => JSON.parse(readFileSync(path, "utf8")))
    const records = verifyRows(rows(streams.native), rows(streams.emitted), selected)
    const executionIdentity = verifyExecutionIdentity(streams.executionIdentity, selected)
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify({ ...summary, outcome: "passed", executionIdentity, records }, null, 2) + "\n"
    )
    console.log(JSON.stringify({ outcome: "passed", propertiesPerLane: records.length, evidence }))
  } catch (error) {
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify({ ...summary, outcome: "failed", error: String(error) }, null, 2) + "\n"
    )
    console.error(`Retained Lab native assertion evidence: ${evidence}`)
    throw error
  } finally {
    streams?.cleanup()
    rmSync(directory, { recursive: true, force: true })
  }
}
async function main() {
  const args = process.argv.slice(2),
    child = args[0] === "--worker",
    selected = selection(child ? args.slice(1) : args)
  if (child) {
    await worker(selected)
    return
  }
  const { createRun } = await import("./test-harness/run-checks.mjs")
  const run = await createRun({
    root,
    mode: "test",
    timeoutMs: 380000,
    inherited: process.env.HAPSLAND_CHECK_CONTEXT,
    scope: "game-lab-predicates"
  })
  const supervisorContext = JSON.stringify(run.context),
    deadline = Math.min(run.context.deadline, Date.now() + 380000)
  run.context.deadline = deadline
  try {
    await run.runStage({
      name: "game-lab-predicates",
      command: process.execPath,
      args: [fileURLToPath(import.meta.url), "--worker", ...selected.map(String)],
      env: { HAPSLAND_GAME_SUPERVISOR_CONTEXT: supervisorContext, HAPSLAND_GAME_OUTER_DEADLINE_MS: String(deadline) }
    })
  } finally {
    process.exitCode = await run.finish()
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
