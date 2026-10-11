import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { nativePrepareReadyUnits } from "./native-preparation-children.mjs"
import {
  productValue,
  list,
  unlist
} from "../../../../source-analysis/src/direct-event/graph-resolution/service-session.mjs"

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
const rule = compileRule(
  {
    version: 1,
    id: "unit-evidence",
    question: "Is the unit relevant?",
    criteria: { false: "No", true: "Yes" },
    message: "Relevant unit",
    inputs: [{ languages: ["typescript", "rust", "bend", "python", "go"], kind: "type", requires: [] }]
  },
  "unit-evidence-rule"
)
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
])
  units.push({ root: node(root, [expanded(node({ ...catalog[0], ...change }))]) })
units.push({
  root: node(root, [
    expanded(node({ ...catalog[0], origin: Object.fromEntries(Object.entries(catalog[0].origin).reverse()) }))
  ])
})
for (let index = 0; index < 40; index++) {
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
  for (const unit of units) {
    const expected = nativePrepareReadyUnits([unit], [{ artifact: unit.root.artifact, location }], "root.ts", {
      contract: TYPE_INPUT_CONTRACT,
      graphLimits: GRAPH_LIMIT_CEILINGS,
      supportingCaptures: captures,
      observation: { root: "/workspace" },
      context: { settings: { rules: [rule] } }
    })
    let step = stage.initial(wire(productValue(unit)))
    for (let count = 0; label(step) === "Continue"; count++) {
      assert.ok(count < 10000)
      nodeSteps++
      step = stage.advance(step.state, bundled)
    }
    if (expected.length === 0) assert.equal(label(step), "MissingEvidence")
    else {
      assert.equal(label(step), "Inspected")
      assert.deepEqual(
        unlist(step.paths),
        expected[0].prepared.input.sourceFingerprints.map(({ path }) => path)
      )
      assert.equal(step.partial, expected[0].prepared.input.completeness === "incomplete-irrelevant")
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: units.length,
      nodeSteps,
      scope:
        "Compiled whole-unit evidence traversal versus existing native finalization; not full finalization or production acceptance"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
