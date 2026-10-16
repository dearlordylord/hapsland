import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { preflightMutations } from "./mutations.mjs"

// Temporary migration acceptance gate: delete with LAWS.bend at whole
// Preparation acceptance. Copies are disposable diagnostics of current sources.
const selection = process.argv.slice(2)
assert.ok(selection.length <= 1, "usage: proof-check.mjs [mutant-name]")
const selectedMutations = selection.length
  ? preflightMutations.filter(([name]) => name === selection[0])
  : preflightMutations
assert.ok(selectedMutations.length, "unknown mutation: " + selection[0])
const owner = import.meta.dirname
const root = resolve(owner, "../../../../..")
const proof = readFileSync(join(owner, "PROOF.bend"), "utf8")
const definitions = [...proof.matchAll(/^def ([\w.]+)\(/gmu)]
const bodies = new Map(
  definitions.map((match, index) => [match[1], proof.slice(match.index, definitions[index + 1]?.index ?? proof.length)])
)
const prefix = proof.slice(0, definitions[0].index)
const laws = readFileSync(join(owner, "LAWS.bend"), "utf8")
const lawDefinitions = [...laws.matchAll(/^law (\w+):/gmu)]
const lawNames = lawDefinitions.map((match) => match[1])
assert.equal(lawNames.length, 5)
const lawBody = (name) => {
  const index = lawNames.indexOf(name)
  assert.ok(index >= 0, name)
  return (
    laws.slice(0, lawDefinitions[0].index) +
    laws.slice(lawDefinitions[index].index, lawDefinitions[index + 1]?.index ?? laws.indexOf("def main()")) +
    "\ndef main() -> Unit:\n  Unit{}\n"
  )
}
const proofBody = (law) => {
  const keep = new Set()
  const visit = (name) => {
    if (keep.has(name) || !bodies.has(name)) return
    keep.add(name)
    for (const match of bodies.get(name).matchAll(/(?<![\w.])([\w.]+)\s*\(/gu)) visit(match[1])
  }
  visit("Laws." + law)
  assert.ok(keep.has("Laws." + law), law)
  return (
    prefix +
    [...bodies]
      .filter(([name]) => keep.has(name))
      .map(([, body]) => body)
      .join("\n") +
    "\ndef main() -> Unit:\n  Unit{}\n"
  )
}
const sources = new Map()
const collect = (file) => {
  if (sources.has(file)) return
  const source = readFileSync(file, "utf8")
  const path = relative(root, file)
  assert.ok(!path.startsWith(".."), path)
  sources.set(file, source)
  for (const match of source.matchAll(/^import\s+(\S+\.bend)(?:\s+as\s+\S+)?\s*$/gmu))
    collect(resolve(dirname(file), match[1]))
}
collect(join(owner, "PROOF.bend"))
const temporary = mkdtempSync(join(tmpdir(), "hapsland-combined-preflight-kernel-"))
const prepare = (name, law) => {
  const directory = join(temporary, name)
  for (const [file, source] of sources) {
    const target = join(directory, relative(root, file))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(
      target,
      file === join(owner, "LAWS.bend") ? lawBody(law) : file === join(owner, "PROOF.bend") ? proofBody(law) : source
    )
  }
  return join(directory, relative(root, owner))
}
const check = (directory) => {
  const started = performance.now()
  const result = spawnSync(
    "python3",
    [
      "-c",
      "import subprocess,resource,json,sys; r=subprocess.run(sys.argv[1:]); u=resource.getrusage(resource.RUSAGE_CHILDREN); print(json.dumps({'userSeconds':u.ru_utime,'systemSeconds':u.ru_stime}),file=sys.stderr); sys.exit(r.returncode)",
      "timeout",
      "--kill-after=1s",
      "10s",
      "taskset",
      "-c",
      "10",
      "bend",
      join(directory, "PROOF.bend"),
      "--verdict"
    ],
    { timeout: 11000, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  )
  console.log(
    JSON.stringify({
      process: relative(temporary, directory),
      wallMilliseconds: performance.now() - started,
      status: result.status,
      signal: result.signal,
      error: result.error?.code ?? null,
      diagnostic: result.status === 0 ? undefined : (result.stdout ?? "") + (result.stderr ?? "")
    })
  )
  if (result.error) throw result.error
  assert.equal(result.signal, null)
  return { status: result.status, diagnostic: result.stdout + result.stderr }
}
try {
  for (const law of lawNames.filter((name) => selectedMutations.some((row) => row[3] === name))) {
    const result = check(prepare("control-" + law, law))
    assert.equal(result.status, 0, law + " control: " + result.diagnostic)
    assert.ok(result.diagnostic.includes("ALL PROOFS CHECK"), result.diagnostic)
    console.log(JSON.stringify({ law, control: "kernel-pass" }))
  }
  for (const [name, from, to, law, , , location] of selectedMutations) {
    const directory = prepare(name, law)
    const file = join(directory, "Core.bend"),
      source = readFileSync(file, "utf8")
    assert.equal(source.split(from).length, 2, name + ": unique semantic anchor")
    writeFileSync(file, source.replace(from, to))
    const result = check(directory)
    assert.equal(result.status, 1, name + ": " + result.diagnostic)
    assert.ok(result.diagnostic.includes("SOME PROOFS FAIL"), result.diagnostic)
    assert.ok(result.diagnostic.includes("Location: " + location + "\n"), name + ": " + result.diagnostic)
    assert.ok(!/TODO|consumed more than once|expected : a defined name/u.test(result.diagnostic), result.diagnostic)
    console.log(JSON.stringify({ mutant: name, law, rejected: true, location }))
  }
  console.log(
    JSON.stringify({
      kernelControls: new Set(selectedMutations.map((row) => row[3])).size,
      semanticMutants: selectedMutations.length,
      scope: "isolated approved whole/protocol laws; physical bindings and whole Preparation acceptance remain separate"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
