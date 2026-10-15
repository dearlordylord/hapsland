import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { productValue, list } from "@hapsland/source-artifacts/direct-event/value/codec"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-evidence-query-"))
try {
  const modules = []
  for (const name of ["UnitEvidence", "UnitEvidenceQuerySpec"]) {
    const output = join(temporary, name + ".mjs")
    execFileSync(
      "timeout",
      ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, name + ".bend"), "-o", output],
      { timeout: 11000 }
    )
    modules.push((await import(pathToFileURL(output))).default)
  }
  const [actual, reference] = modules
  let cases = 0
  const compare = (name, ...args) => {
    assert.deepEqual(actual[name](...args), reference[name](...args), name)
    cases++
  }
  const origin = {
    kind: "compiler",
    library: "base",
    compilerVersion: "version",
    compilerSource: "source",
    moduleHash: "module",
    declarationHash: "declaration"
  }
  const artifact = { id: "id", kind: "type", name: "Name", source: "source", sourceHash: "hash", origin }
  const values = [
    null,
    false,
    0,
    "",
    [],
    {},
    artifact,
    { ...artifact, path: "file.ts" },
    { ...artifact, name: "Other" },
    { ...artifact, origin: { ...origin, moduleHash: "other" } },
    { ...artifact, origin: { ...origin, extra: "invalid" } }
  ].map(productValue)
  const keys = ["", "name", "path", "origin", "missing", "\u0000", "😀", "\ud800"]
  const fields = [
    [],
    ...values
      .filter((value) => "fields" in value)
      .map((value) => {
        const result = []
        for (let cursor = value.fields; cursor.$ === "Con"; cursor = cursor.tail) result.push(cursor.head)
        return result
      })
  ]
  const field = (key, value) => ({
    $: "../../../../source-artifacts/src/direct-event/value/Value.OrderedField",
    key,
    value: productValue(value)
  })
  fields.push(
    [field("name", 0), field("name", "later")],
    [field("name", "first"), field("name", false)],
    keys.map((key) => field(key, key)),
    keys.toReversed().map((key) => field(key, key))
  )
  for (const entries of fields) for (const key of keys) compare("field_list", key, list(entries))
  for (const left of values)
    for (const right of values) {
      for (const names of [
        [],
        ["name"],
        ["missing", "name"],
        ["id", "kind", "name", "source", "sourceHash"],
        ["name", "name"]
      ])
        compare("matching_fields", list(names), left, right)
      compare("member", left, right)
    }
  for (const value of values)
    for (const catalog of [[], values, values.toReversed(), [value], [values[0], value, values[0]], [value, value]])
      compare("bundled", value, list(catalog))
  const paths = ["", "a", "z", "\u0000", "\ue000", "😀", "\ud800", "\udfff", "a/b", "a\\b"]
  for (const path of paths) {
    for (const entries of [[], paths, paths.toReversed(), [path], [path, path], ["z", "a", "z"]])
      compare("path_insert", path, list(entries))
    for (const left of paths) for (const right of paths) compare("path_insert", path, list([left, right]))
  }
  const names = ["UnitEvidence", "UnitEvidenceQuerySpec", "UnitEvidenceQueryLaws", "UnitEvidenceQueryProof"]
  const local = new Set(names.map((name) => name + ".bend"))
  const sources = new Map(
    names.map((name) => [
      name,
      readFileSync(join(import.meta.dirname, name + ".bend"), "utf8").replace(
        /^import (\S+\.bend)(.*)$/gmu,
        (_line, dependency, alias) =>
          `import ${local.has(dependency.slice(2)) ? dependency : resolve(import.meta.dirname, dependency)}${alias}`
      )
    ])
  )
  for (const [name, source] of sources) writeFileSync(join(temporary, name + ".bend"), source)
  const core = sources.get("UnitEvidence")
  const checkProof = () =>
    spawnSync(
      "timeout",
      ["10s", "taskset", "-c", "10", "bend", join(temporary, "UnitEvidenceQueryProof.bend"), "--verdict"],
      { encoding: "utf8", timeout: 11000 }
    )
  const baseline = checkProof()
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr)
  assert.match(baseline.stdout, /ALL PROOFS CHECK/u)
  const mutants = [
    ["skip first matching field", "case True{}: Some{value}", "case True{}: rest(Unit{})"],
    ["ignore matching field predicate", "same_text(field(key, actual), field(key, candidate)),", "True{},"],
    ["accept present artifact path", 'query_and(absent(field("path", artifact)),', "query_and(True{},"],
    ["lose later catalog match", "_ => bundled(artifact, tail)", "_ => False{}"],
    [
      "reverse path ordering",
      "Json.units_le(Json.utf16(path), Json.utf16(head))",
      "Json.units_le(Json.utf16(head), Json.utf16(path))"
    ]
  ]
  const proofMutants = []
  for (const [name, before, after] of mutants) {
    assert.ok(core.includes(before), name)
    writeFileSync(join(temporary, "UnitEvidence.bend"), core.replace(before, after))
    const result = checkProof()
    assert.equal(result.status, 1, name + ": " + result.stdout + result.stderr)
    assert.match(result.stdout + result.stderr, /SOME PROOFS FAIL/u)
    assert.match(result.stdout + result.stderr, /expected/u)
    proofMutants.push({ name, rejected: true, scope: "full proof closure; failure may be in a shared lemma" })
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      proofMutants,
      scope:
        "finite emitted equivalence against independent eager equations plus all five universal query laws and implementation mutants; not whole Preparation acceptance"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
