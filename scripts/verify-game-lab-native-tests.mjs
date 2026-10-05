import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  createNativePreflight,
  validateNativeFixture,
  cleanupNativePreflight,
  captureNativeFixtureIdentity,
  assertNativeFixtureIdentity
} from "../packages/monkey-business-bend/conformance/native-preflight.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const owner = join(root, "prototypes/canonical-defense/DefenseLabTests.bend")
const transport = join(root, "prototypes/canonical-defense/DefenseNumericOutput.bend")
const labels = [
  "Jev Service costs60",
  "Delivery Relay costs55",
  "Access Repair costs45",
  "custom construction price17",
  "illegal placement costs zero",
  "unaffordable purchase costs zero",
  "absent tower upgrade costs zero",
  "service upgrade40+60 and maximum3",
  "repair maximum1",
  "hard one-event and zero-event budgets",
  "early request captures1600 and forced clear",
  "late request retains3200",
  "relay future output400 and lease5000",
  "issued individual output lease5000",
  "late output retains800",
  "repair restores access with generation1",
  "failed source work is gone",
  "repair does not resurrect work",
  "late repair preserves generation1",
  "repair issues no abandoned request"
]
const requested = process.argv.slice(2).map((value) => {
  if (!/^(?:[0-9]|1[0-9])$/.test(value)) throw new Error("Select distinct property ids0..19")
  return Number(value)
})
if (new Set(requested).size !== requested.length) throw new Error("Duplicate property selection")
const selected = requested.length ? requested : labels.map((_, index) => index)
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const ownerText = readFileSync(owner, "utf8")
const sourceHash = hash(ownerText)
const ownerParts = ownerText.split(/(?=^def )/m)
const definitions = new Map(ownerParts.slice(1).map((text) => [text.match(/^def (\w+)/)[1], text]))
const originalImports = ownerParts[0]
  .split("\n")
  .filter((line) => line.startsWith("import "))
  .map((line) => line.replace(/^(import )([.][^ ]+)/, (_, prefix, path) => prefix + resolve(dirname(owner), path)))
function selectedDefinitions(id) {
  const selected = new Set([`test_${id}`])
  const pending = [...selected]
  while (pending.length) {
    const text = definitions.get(pending.pop())
    for (const name of definitions.keys()) {
      if (!selected.has(name) && new RegExp(`\\b${name}\\b`).test(text)) {
        selected.add(name)
        pending.push(name)
      }
    }
  }
  return [...definitions.keys()].filter((name) => selected.has(name))
}
const runnerHash = hash(readFileSync(fileURLToPath(import.meta.url)))
const deadline = Date.now() + 30 * 60 * 1000
const allowance = (cap) => {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error("Lab native assertion runner overall30-minute deadline exhausted")
  return Math.min(cap, remaining)
}
const artifactRoot = join(root, ".tools/canonical-defense")
mkdirSync(artifactRoot, { recursive: true })
const directory = mkdtempSync(join(artifactRoot, "lab-assertions-"))
const evidenceRoot = join(root, ".test-runs")
mkdirSync(evidenceRoot, { recursive: true })
const evidence = mkdtempSync(join(evidenceRoot, "lab-native-assertions-"))
const records = []
const summary = (outcome) => ({
  format: 1,
  outcome,
  selected,
  unselected: labels.map((_, i) => i).filter((i) => !selected.includes(i)),
  owner,
  sourceHash,
  runnerHash,
  deadline,
  records,
  scope: "selected actual-Lab independently expected native/emitted predicates; no platform or full-project claim"
})
function run(command, args, cap, label, sourceCheck = false) {
  const start = Date.now()
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: allowance(cap),
    maxBuffer: 4 * 1024 * 1024
  })
  const stage = {
    label,
    command,
    args,
    elapsedMs: Date.now() - start,
    status: result.status,
    error: result.error?.code,
    stdout: result.stdout,
    stderr: result.stderr
  }
  writeFileSync(join(evidence, `${records.length}-${label}.json`), JSON.stringify(stage, null, 2) + "\n")
  const foreignNames = result.stderr.trim().split("\n").slice(2)
  const expectedForeignNames = ["checked", "inputs", "arguments", "main"]
  const foreign =
    sourceCheck &&
    result.status === 1 &&
    /^SOME PROOFS FAIL\nError: 5 defs rely on unsafe or foreign code:\n/.test(result.stderr) &&
    foreignNames.length === 5 &&
    foreignNames.filter((line) => /^- .*DefenseNumericOutput\.write$/.test(line)).length === 1 &&
    expectedForeignNames.every((name) => foreignNames.filter((line) => line === `- ${name}`).length === 1)
  if (result.error || (result.status !== 0 && !foreign))
    throw new Error(`${label} failed (${result.error?.code ?? result.status}): ${result.stdout}${result.stderr}`)
  return result.stdout
}
function fixtureText(id) {
  return `${originalImports.join("\n")}
import ${transport} as NumericOutput

${selectedDefinitions(id)
  .map((name) => definitions.get(name))
  .join("")}
def flag(ok: Bool) -> Nat:
  match ok:
    case True{}: 1n
    case False{}: 0n
def three(text: String) -> Nat:
  match text:
    case SCon{a,SCon{b,SCon{c,SNil{}}}}:
      (U32.to_nat((Char.to_u32(a) - 48 : U32)) * 100n + U32.to_nat((Char.to_u32(b) - 48 : U32)) * 10n + U32.to_nat((Char.to_u32(c) - 48 : U32)) : Nat)
    case _: 0n
def checked(valid: Bool,+seed: Nat,+budget: Nat,fuel: Nat) -> IO(Unit):
  match valid:
    case True{}: NumericOutput.write([${id}n,flag(test_${id}(seed,U32.from_nat(budget)${id >= 12 && id <= 14 ? ",fuel" : ""}))])
    case False{}: IO.die(Unit,1,"expected152 160 250")
def inputs(+seed: Nat,+budget: Nat,+fuel: Nat) -> IO(Unit):
  checked(Nat.is_eq(seed,152n) && Nat.is_eq(budget,160n) && Nat.is_eq(fuel,250n),seed,budget,fuel)
def arguments(args: List<String>) -> IO(Unit):
  match args:
    case _ <> seed <> budget <> fuel <> Nil{}: inputs(three(seed),three(budget),three(fuel))
    case _: IO.die(Unit,1,"expected152 160 250")
def main() -> IO(Unit):
  IO.bind(List<String>,Unit,IO.args(),args => arguments(args))
`
}
try {
  for (const id of selected) {
    const suffix = String(id)
    assert.equal(hash(readFileSync(owner)), sourceHash, "freeze actual predicate owner during qualification")
    allowance(1)
    const path = join(directory, `property-${suffix}.bend`)
    writeFileSync(path, fixtureText(id))
    const fixture = pathToFileURL(path)
    const identity = captureNativeFixtureIdentity(fixture)
    writeFileSync(
      join(evidence, `property-${suffix}-identity.json`),
      JSON.stringify(
        {
          identity,
          ownerSourceHash: sourceHash,
          selectedDefinitions: selectedDefinitions(id),
          generatedRoot: fixtureText(id)
        },
        null,
        2
      ) + "\n"
    )
    run("bend", [relative(root, path), "--check-only"], 5000, `property-${suffix}-source-check`, true)
    if (deadline - Date.now() < 65000) throw new Error("Insufficient overall deadline for bounded native preparation")
    const start = Date.now()
    const preflight = createNativePreflight({ fixtures: [fixture] })
    try {
      const manifest = JSON.parse(readFileSync(preflight.manifestPath, "utf8"))
      writeFileSync(join(evidence, `property-${suffix}-preflight.json`), JSON.stringify(manifest, null, 2) + "\n")
      const { binaryPath } = validateNativeFixture({ ...preflight, fixture })
      const native = JSON.parse(run(binaryPath, ["152", "160", "250"], 5000, `property-${suffix}-native`))
      assert.deepEqual(native, [id, 1], labels[id])
      const js = join(directory, `property-${suffix}.cjs`)
      run(manifest.tools.bend.path, [relative(root, path), "-o", js], 30000, `property-${suffix}-js-emission`)
      assertNativeFixtureIdentity(identity, fixture)
      const jsHash = hash(readFileSync(js))
      const emitted = JSON.parse(run(process.execPath, [js, "152", "160", "250"], 5000, `property-${suffix}-emitted`))
      assert.deepEqual(emitted, [id, 1], labels[id])
      assert.deepEqual(emitted, native, "complete original predicate output agreement")
      assert.equal(hash(readFileSync(js)), jsHash, "emitted artifact frozen during execution")
      validateNativeFixture({ ...preflight, fixture })
      assertNativeFixtureIdentity(identity, fixture)
      assert.equal(hash(readFileSync(owner)), sourceHash, "predicate owner frozen through execution")
      assert.equal(
        hash(readFileSync(fileURLToPath(import.meta.url))),
        runnerHash,
        "runner frozen through qualification"
      )
      records.push({ id, label: labels[id], native, emitted, identity, jsHash, elapsedMs: Date.now() - start })
      writeFileSync(join(evidence, "result.json"), JSON.stringify(summary("running"), null, 2) + "\n")
      console.log(`PASS ${suffix}: ${labels[id]}`)
    } finally {
      cleanupNativePreflight(preflight)
    }
  }
  writeFileSync(join(evidence, "result.json"), JSON.stringify(summary("passed"), null, 2) + "\n")
  console.log(
    JSON.stringify({
      outcome: "passed",
      propertiesPerLane: new Set(records.map((record) => record.id)).size,
      assertionsPerLane: records.length,
      evidence
    })
  )
} catch (error) {
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ ...summary("failed"), error: String(error) }, null, 2) + "\n"
  )
  console.error(`Retained Lab native assertion evidence: ${evidence}`)
  throw error
} finally {
  rmSync(directory, { recursive: true, force: true })
}
