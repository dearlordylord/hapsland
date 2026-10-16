import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { productValue, fromProductValue, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-unit-evidence-"))
const label = (value) => value.$.split(".").at(-1)
const wire = (value) => {
  if (Array.isArray(value)) return value.map(wire)
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$" && typeof item === "string" && item.startsWith("Types.")
          ? "../../../../source-analysis/src/direct-event/graph-resolution/Types." + item.slice(6)
          : wire(item)
      ])
    )
  return value
}
const unwire = (value) => {
  if (Array.isArray(value)) return value.map(unwire)
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$" && typeof item === "string" && item.includes("/Types.")
          ? "Types." + item.split("/Types.").at(-1)
          : unwire(item)
      ])
    )
  return value
}
const catalog = [...languageForPath("unit.bend").supportingTypes().values()].map(({ artifact }) => artifact)
assert.ok(catalog.length > 0)
const root = {
  id: "root",
  kind: "interface",
  name: "Root",
  source: "interface Root {}",
  sourceHash: "hash",
  path: "root.ts"
}
const node = (artifact, references = []) => ({ artifact, references })
const expanded = (value) => ({ kind: "expanded", site: { symbol: "child" }, node: value })
const omitted = {
  kind: "omitted",
  site: { symbol: "unknown" },
  target: { kind: "unresolved", symbol: "unknown" },
  reason: "unresolved"
}
const location = { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } }
// Expectations are fixture data, independent of the retired Preparation algorithm.
const ready = (paths, partial = false) => ({ paths, partial })
const expectations = [
  ready(["root.ts"]),
  ready(["root.ts"], true),
  ready(["child.ts", "extra.ts", "root.ts"]),
  ready(["root.ts"]),
  undefined
]
const units = [
  { root: node(root) },
  { root: node(root, [omitted]) },
  {
    root: node(root, [expanded(node({ ...root, id: "child", path: "child.ts" }))]),
    sourceDependencies: ["extra.ts", "extra.ts"]
  },
  { root: node(root, [expanded(node(catalog[0]))]) },
  { root: node(catalog[0]) }
]
for (const change of [
  { sourceHash: "forged" },
  { source: "forged" },
  { kind: "interface" },
  { name: "forged" },
  { path: "child.ts" },
  { origin: { ...catalog[0].origin, extra: "forged" } },
  { origin: { ...catalog[0].origin, moduleHash: "forged" } },
  { origin: null }
]) {
  units.push({ root: node(root, [expanded(node({ ...catalog[0], ...change }))]) })
  expectations.push(undefined)
}
units.push({
  root: node(root, [
    expanded(node({ ...catalog[0], origin: Object.fromEntries(Object.entries(catalog[0].origin).reverse()) }))
  ])
})
expectations.push(ready(["root.ts"]))
for (let index = 0; index < 40; index++) {
  expectations.push(ready(["child.ts", "extra.ts", "root.ts", "😀", "\ue000"], index % 2 !== 0))
  let child = node({ ...root, id: "leaf", path: "child.ts" }, index % 2 ? [omitted] : [])
  for (let depth = 0; depth < index % 12; depth++) child = node({ ...root, id: "child" + depth }, [expanded(child)])
  units.push({
    root: node(root, [expanded(child)]),
    sourceDependencies: ["😀", "\ue000", "extra.ts", "child.ts", "extra.ts"]
  })
}
const captures = new Map(
  ["root.ts", "child.ts", "extra.ts", "😀", "\ue000"].map((path) => [
    path,
    { contentHash: "hash:" + path, byteLength: 42 }
  ])
)
try {
  const output = join(temporary, "unit-evidence.mjs")
  execFileSync(
    "timeout",
    ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "UnitEvidence.bend"), "-o", output],
    { timeout: 6000 }
  )
  const stage = (await import(pathToFileURL(output))).default
  const bundled = wire(list(catalog.map(productValue)))
  let nodeSteps = 0
  const cases = units.map((unit, index) => ({
    unit,
    declarations: [{ artifact: unit.root.artifact, location }],
    captures,
    expected: expectations[index]
  }))
  cases.push(
    { unit: units[0], declarations: [], captures },
    { unit: units[0], declarations: [{ artifact: root }, { artifact: root, location }], captures },
    { unit: units[0], declarations: [{ artifact: root, location }], captures: new Map() },
    {
      unit: units[2],
      declarations: [{ artifact: { ...root, id: "other-id" }, location }],
      captures: new Map([...captures].filter(([path]) => path !== "extra.ts"))
    },
    {
      unit: units[0],
      declarations: [{ artifact: { ...root, id: "other-id" }, location }],
      captures,
      expected: ready(["root.ts"])
    }
  )
  assert.equal(expectations.length, units.length)
  for (const { unit, declarations, captures: currentCaptures, expected } of cases) {
    let step = stage.initial(wire(productValue(unit)))
    for (let count = 0; label(step) === "Continue"; count++) {
      assert.ok(count < 10000)
      nodeSteps++
      step = stage.advance(step.state, bundled)
    }
    const metadata = stage.metadata(
      step,
      TYPE_INPUT_CONTRACT,
      wire(list(declarations.map(productValue))),
      stage.prepare_captures(
        wire(list([...currentCaptures].map(([path, capture]) => productValue({ path, ...capture }))))
      ),
      wire(productValue(unit))
    )
    if (expected === undefined) assert.equal(label(metadata), "EvidenceMissing")
    else {
      assert.equal(label(step), "Inspected")
      assert.deepEqual(unlist(step.paths), expected.paths)
      assert.equal(step.partial, expected.partial)
      assert.equal(label(metadata), "EvidenceReady")
      assert.equal(metadata.partial, step.partial)
      assert.equal(metadata.root_location.$, "Some")
      assert.deepEqual(fromProductValue(unwire(metadata.root_location.value)), location)
      assert.deepEqual(
        fromProductValue(unwire(metadata.fingerprints)),
        expected.paths.map((path) => ({ path, contentHash: "hash:" + path, byteLength: 42 }))
      )
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: cases.length,
      nodeSteps,
      scope:
        "Compiled evidence traversal and metadata against fixture-authored paths, fingerprints, partial status, location and missing-evidence cases; not whole Preparation acceptance"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
