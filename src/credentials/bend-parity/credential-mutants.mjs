import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { deriveLookupPlan, deriveSavePlan } from "./credential-reference.ts"
const sourcePath = "packages/agent-flow-bend/credential-policy/core.bend"
const source = readFileSync(sourcePath, "utf8")
const mutations = [
  ["omit environment", "Environment{} <> List.append", "List.append"],
  ["ignore captured context", "Bool.and(Bool.not(captured), root)", "root"],
  ["ignore missing root", "Bool.and(Bool.not(captured), root)", "Bool.not(captured)"],
  ["native fallback for explicit reference", "Bool.pick(List<Source>, explicit, [], [Native{}])", "[Native{}]"],
  ["omit user source", "[User{}]", "[]"],
  ["omit project-local source", "[ProjectLocal{}]", "[]"],
  ["omit project source", "[Project{}]", "[]"],
  ["swap file precedence", "[ProjectLocal{}]", "[Project{}]"],
  ["save local without path", "case ProjectLocal{}: local", "case ProjectLocal{}: True{}"],
  ["refuse user saving", "case User{}: True{}", "case User{}: False{}"],
  ["refuse native saving", "case Native{}: True{}", "case Native{}: False{}"],
  ["permit read-only sources for saving", "case _: False{}", "case _: True{}"]
]
const directory = mkdtempSync(join(tmpdir(), "hapsland-credential-mutants-"))
const names = {
  Environment: "environment",
  ProjectLocal: "project-local",
  Project: "project",
  User: "user",
  Native: "native"
}
function mismatch(core) {
  for (let bits = 0; bits < 32; bits++) {
    const explicit = Boolean(bits & 1),
      captured = Boolean(bits & 2),
      root = Boolean(bits & 4)
    const local = Boolean(bits & 8),
      project = Boolean(bits & 16)
    const context = {
      envVar: "KEY",
      referenceExplicit: explicit,
      captured,
      root: root ? "/root" : undefined,
      userFile: "/user",
      nativeTarget: "hapsland",
      projectLocalFile: local ? "/local" : undefined,
      projectFile: project ? "/project" : undefined
    }
    const actual = []
    for (let list = core.lookup(explicit, captured, root, local, project); list.$ === "Con"; list = list.tail)
      actual.push(names[list.head.$])
    const expected = deriveLookupPlan(context).map((step) => step.kind)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return { family: "lookup", flags: bits, expected, actual }
    for (const [constructor, destination] of Object.entries(names)) {
      // Environment and project are declared read-only by the proposed save law.
      const expected =
        destination === "environment" || destination === "project"
          ? false
          : deriveSavePlan(context, destination) !== undefined
      const actual = core.save_available({ $: constructor }, local)
      if (actual !== expected) return { family: "save", flags: bits, destination, expected, actual }
    }
  }
}
try {
  async function compile(text, name) {
    const input = join(directory, name + ".bend"),
      output = join(directory, name + ".mjs")
    writeFileSync(input, text)
    execFileSync("bend", [input, "-o", output], { timeout: 5000, stdio: "pipe" })
    return (await import(pathToFileURL(output))).default
  }
  assert.equal(mismatch(await compile(source, "baseline")), undefined)
  const results = []
  for (const [name, before, after] of mutations) {
    assert.equal(source.split(before).length, 2, `mutation anchor must be unique: ${name}`)
    const counterexample = mismatch(await compile(source.replace(before, after), "mutant-" + results.length))
    assert.ok(counterexample, `surviving mutant: ${name}`)
    const proofDirectory = join(directory, "proof-" + results.length)
    mkdirSync(proofDirectory)
    writeFileSync(join(proofDirectory, "core.bend"), source.replace(before, after))
    for (const file of ["LAWS.bend", "PROOF.bend"])
      writeFileSync(join(proofDirectory, file), readFileSync("packages/agent-flow-bend/credential-policy/" + file))
    const proof = spawnSync("bend", [join(proofDirectory, "PROOF.bend"), "--verdict"], {
      timeout: 5000,
      encoding: "utf8"
    })
    assert.equal(proof.error, undefined, `mutant proof observation failed: ${name}`)
    assert.equal(proof.status, 1, `mutant proof survived: ${name}`)
    assert.match(proof.stdout + proof.stderr, /SOME PROOFS FAIL/)
    assert.doesNotMatch(proof.stdout + proof.stderr, /TODOs found|unknown:|syntax error/i)
    results.push({
      name,
      proofResult: "rejected by unchanged approved law proofs",
      result: "detected by exhaustive behavioral comparison",
      counterexample
    })
  }
  const record = {
    at: new Date().toISOString(),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    baseline: "pass",
    results,
    scope:
      "executable mutant sensitivity against TypeScript and proposed read-only save rule; approved laws and unchanged proofs reject every mutant; approval remains separately recorded"
  }
  writeFileSync(new URL("./candidate-mutants.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify({ baseline: "pass", mutantsDetected: results.length }))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
