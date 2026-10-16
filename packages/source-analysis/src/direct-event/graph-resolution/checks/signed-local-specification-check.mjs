import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { sourceFacts } from "../frontend-codec.ts"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

const folder = import.meta.dirname,
  temporary = mkdtempSync(join(tmpdir(), "hapsland-signed-local-"))
const inputs = [
  "../SignedLocalSpecification.bend",
  "../SignedLocalSpecificationCheck.bend",
  "../SPEC.bend",
  "../WholeObservation.bend",
  "../Types.bend",
  "./signed-local-specification-check.mjs",
  "../frontend-codec.ts",
  "../service-session.ts",
  "../traversal/SPEC.bend",
  "../traversal/core.bend",
  "../traversal/Traversal.bend",
  "../../../../../../bun.lock",
  "../../../../../canonical-policy/dist/canonical/graph-adapter.js"
]
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(join(folder, path)))
    .digest("hex")
const sources = Object.fromEntries(inputs.map((path) => [path, hash(path)]))
const label = (value) => value.$.split(".").at(-1)
const signed = (work) => ({
  $: "WholeObservation." + (work < 0 ? "Negative" : "Nonnegative"),
  ...(work < 0 ? { magnitude: Number(-work) } : { value: Number(work) })
})
const limits = {
  $: "../../../../agent-flow-bend/ImportGraph.Limits",
  ...Object.fromEntries(
    Object.entries(GRAPH_LIMIT_CEILINGS).map(([key, value]) => [
      {
        sourceBytes: "source_bytes",
        treeBytes: "tree_bytes",
        readBytes: "read_bytes",
        outgoingEdges: "outgoing_edges"
      }[key] ?? key,
      Number(value)
    ])
  )
}
const origin = {
  kind: "bundled",
  library: "bend/Base",
  compilerVersion: "fixture",
  compilerSource: "fixture",
  moduleHash: "fixture",
  declarationHash: "fixture"
}
const declaration = (id, kind = "interface", references = [], bundled = false) => ({
  artifact: { ...(bundled ? { origin } : {}), id, kind, name: id, source: "fixture", sourceHash: "fixture" },
  exported: true,
  references
})
const ref = (name, fields = {}) => ({ kind: "named", name, ...fields })
const variants = [
  { kind: "unsupported", name: "Unsupported" },
  ref("A"),
  ref("B", { expectedKind: "type" }),
  ref("Conflict"),
  ref("Missing"),
  ref("Imported"),
  ref("TypeOnly", { expectedKind: "function" }),
  ref("Bundle", { targetId: "bundle" }),
  ref("Invalid", { targetId: "invalid" }),
  ref("Mismatch", { targetId: "mismatch" }),
  ref("Visible", { bindingName: "pkg::A" }),
  ref("Visible", { bindingName: "pkg::Remote" }),
  ref("A", { bindingName: "absent" }),
  ref("Conflict", { bindingName: "pkg::A" }),
  ref("Bundle", { bindingName: "pkg::A", targetId: "bundle" }),
  ref("Visible", { bindingName: "pkg::B", expectedKind: "type" })
]
const sequences = [
  [],
  ...variants.map((item) => [item]),
  ...variants.flatMap((first) => variants.map((second) => [first, second]))
]
try {
  const compiled = join(temporary, "signed.mjs")
  execFileSync("bend", [join(folder, "../SignedLocalSpecificationCheck.bend"), "-o", compiled], { timeout: 10000 })
  const spec = (await import(pathToFileURL(compiled))).default
  let compared = 0,
    negativeFailures = 0,
    negativeCompletions = 0,
    missingRoots = 0,
    runtimeComparisons = 0
  for (const references of sequences)
    for (const work of [-7, -1, 0, 3])
      for (const seen of [false, true])
        for (const depth of [0, 3]) {
          const root = declaration("Root", "interface", references),
            a = declaration("A"),
            b = declaration("B", "function"),
            conflict = declaration("Conflict"),
            bundle = declaration("bundle", "interface", [], true)
          const facts = {
            declarations: new Map([
              ["Root", root],
              ["A", a],
              ["B", b],
              ["Conflict", conflict],
              ["pkg::A", a],
              ["pkg::B", b],
              ["pkg::Remote", declaration("Remote", "interface", [ref("DisplayedChild", { bindingName: "pkg::A" })])]
            ]),
            imports: new Map([
              ["Conflict", { path: "./a", name: "A" }],
              ["Imported", { path: "./imported", name: "Imported" }],
              ["TypeOnly", { path: "./types", name: "TypeOnly", typeOnly: true }]
            ]),
            supportingDeclarations: new Map([
              ["bundle", bundle],
              ["invalid", declaration("invalid")],
              ["mismatch", declaration("different", "interface", [], true)]
            ])
          }
          const prepared = spec.source(sourceFacts(facts)),
            state = spec.initial(limits, seen),
            wrapped = { $: "SignedLocalSpecification.State", local: state, graph_work: signed(work) }
          const result = spec.build(10000, wrapped, prepared.facts, "root.ts", "Root", Number(depth)),
            local = result.state.local
          if (label(result) === "TechnicalFailure") {
            assert.ok(work < 0)
            assert.equal(label(result), "TechnicalFailure")
            assert.equal(label(result.failure), "NegativeGraphWork")
            assert.equal(Number(result.failure.magnitude), -work)
            negativeFailures++
          } else {
            assert.equal(label(result), "Built")
            if (work < 0) negativeCompletions++
            if (work >= 0) {
              const runtime = spec.runtime(state, Number(work), prepared.facts, "root.ts", "Root", Number(depth))
              assert.equal(label(runtime), "CompletePlan")
              const flat = spec.flattened(result.tree)
              assert.equal(label(flat), "Flat")
              assert.deepEqual(runtime.plan.nodes, flat.nodes)
              assert.deepEqual(runtime.plan.references, flat.slots)
              assert.deepEqual(unlist(runtime.plan.pending), unlist(local.pending_rev).reverse())
              assert.deepEqual(runtime.plan.visited, local.visited)
              assert.equal(runtime.plan.budget.graph_work, Number(work))
              assert.deepEqual(runtime.plan.budget, local.budget)
              runtimeComparisons++
            }
          }
          assert.equal(Number(result.state.graph_work[work < 0 ? "magnitude" : "value"]), Math.abs(work))
          compared++
        }
  const facts = spec.source(sourceFacts({ declarations: new Map(), imports: new Map() })).facts
  for (const work of [-9, -1, 0, 2]) {
    const result = spec.build(
      10,
      { $: "SignedLocalSpecification.State", local: spec.initial(limits, false), graph_work: signed(work) },
      facts,
      "root.ts",
      "Missing",
      0
    )
    assert.equal(label(result), "Missing")
    missingRoots++
  }
  let permitRegressions = 0
  for (const [references, seen, outcome] of [
    [[], false, "Built"],
    [[{ kind: "unsupported", name: "Unsupported" }], false, "Built"],
    [[ref("A")], false, "TechnicalFailure"],
    [[ref("Bundle", { targetId: "bundle" })], true, "TechnicalFailure"],
    [[ref("Bundle", { targetId: "bundle" })], false, "TechnicalFailure"]
  ]) {
    const prepared = spec.source(
      sourceFacts({
        declarations: new Map([
          ["Root", declaration("Root", "interface", references)],
          ["A", declaration("A")]
        ]),
        imports: new Map(),
        supportingDeclarations: new Map([["bundle", declaration("bundle", "interface", [], true)]])
      })
    )
    const result = spec.build(
      10000,
      { $: "SignedLocalSpecification.State", local: spec.initial(limits, seen), graph_work: signed(-1) },
      prepared.facts,
      "root.ts",
      "Root",
      0
    )
    assert.equal(
      label(result),
      outcome,
      "authored negative-work permit placement " + JSON.stringify({ references, seen })
    )
    if (outcome === "TechnicalFailure") {
      assert.equal(label(result.failure), "NegativeGraphWork")
      assert.equal(result.failure.magnitude, 1)
    }
    permitRegressions++
  }
  const zero = spec.build(
    10,
    {
      $: "SignedLocalSpecification.State",
      local: spec.initial(limits, false),
      graph_work: { $: "WholeObservation.Negative", magnitude: 0 }
    },
    facts,
    "root.ts",
    "Missing",
    0
  )
  assert.equal(label(zero), "Missing")
  assert.equal(label(zero.state.graph_work), "Nonnegative")
  assert.deepEqual(Object.fromEntries(inputs.map((path) => [path, hash(path)])), sources, "frozen sources")
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    sources,
    passed: true,
    cases: compared + missingRoots + permitRegressions + 1,
    compared,
    permitRegressions,
    runtimeComparisons,
    negativeFailures,
    negativeCompletions,
    missingRoots,
    negativeZeroNormalizesToZero: true,
    scope:
      "Independent signed-domain Bend specification against runtime traversal for nonnegative inputs, exact flattened nodes/references/pending/visited/budget; authored negative permit/refusal, missing roots and negative-zero normalization. Physical negative-work validation remains with Canonical Graph fixtures; not whole proof or performance qualification."
  }
  const evidenceDirectory = join(import.meta.dirname, "../../../../../../.test-runs/bend-migration")
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(
    join(evidenceDirectory, "signed-local-specification-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
