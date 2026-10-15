import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { analyzeTypeFile, analyzerMaterializationPreflight } from "@hapsland/source-analysis/direct-event/analyzer"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

const { languageForPath } = await import(
  new URL("./languages/registry.js", import.meta.resolve("@hapsland/source-analysis/direct-event/analyzer"))
)
const some = (value) => ({ $: "Some", value })
const none = { $: "None" }
const named = (name, targetId) => ({
  $: "Model.Named",
  name,
  target_id: targetId === undefined ? none : some(targetId)
})
const unsupported = (name) => ({ $: "Model.Unsupported", name })
const declaration = (slot, name, references = [], identity = name) => ({
  $: "Model.Declaration",
  slot,
  identity,
  name,
  references: list(references)
})
const catalog = (declarations, supporting = []) => ({
  $: "Model.Catalog",
  declarations: list(declarations),
  supporting: list(supporting.map(([key, value]) => ({ $: "Model.Supporting", key, declaration: value })))
})
const temporary = mkdtempSync(join(tmpdir(), "hapsland-local-analysis-spec-"))
try {
  const output = join(temporary, "specification.mjs")
  execFileSync(
    "timeout",
    ["10s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "Specification.bend"), "-o", output],
    { timeout: 11000 }
  )
  const spec = (await import(pathToFileURL(output))).default
  let rawCases = 0
  const inspect = (root, facts) => {
    const result = spec.analyze(root, facts)
    assert.equal(result.$, "NodeResult", "derived recursive depth must suffice for each finite fixture")
    const materialized = spec.outcome({ $: "Model.Materialize" }, result)
    const outcomes = spec.outcome({ $: "Model.OutcomesOnly" }, result)
    assert.equal(materialized.$, "Some")
    assert.deepEqual(outcomes, some({ ...materialized.value, tree: none }))
    rawCases++
    return result
  }
  const references = (result) => unlist(result.node.references)
  const a = declaration(0, "A", [named("X")]),
    oldX = declaration(1, "X"),
    newX = declaration(2, "X")
  assert.equal(references(inspect(a, catalog([a, oldX, newX])))[0].node.slot, 2)
  const supportRoot = declaration(0, "A", [named("alias", "")])
  assert.equal(
    references(
      inspect(
        supportRoot,
        catalog(
          [supportRoot],
          [
            ["", oldX],
            ["", newX]
          ]
        )
      )
    )[0].node.slot,
    2
  )
  const self = declaration(0, "A", [named("A")])
  assert.deepEqual(references(inspect(self, catalog([self]))), [{ $: "Model.Included", symbol: "A", target: "A" }])
  const aliases = declaration(
    0,
    "A",
    Array.from({ length: 20 }, (_, index) => named("A", "support-" + index))
  )
  const aliasFacts = Array.from({ length: 20 }, (_, index) => [
    "support-" + index,
    declaration(index + 1, "Other", [], "id-" + index)
  ])
  const aliasResult = inspect(aliases, catalog([aliases], aliasFacts))
  assert.deepEqual(unlist(aliasResult.state.referenced), [])
  assert.equal(aliasResult.state.failure.$, "None", "root-name exemption precedes targetId reference counting")
  const sameId = declaration(0, "A", [named("X"), named("Y")])
  const sameResult = inspect(
    sameId,
    catalog([sameId, declaration(1, "X", [], "shared"), declaration(2, "Y", [], "shared")])
  )
  assert.equal(references(sameResult)[0].$, "Model.Expanded")
  assert.deepEqual(references(sameResult)[1], { $: "Model.Included", symbol: "Y", target: "shared" })
  for (const count of [16, 17, 18]) {
    const targets = Array.from({ length: count }, (_, index) => declaration(index + 1, "T" + index))
    const root = declaration(
      0,
      "A",
      targets.map((target) => named(target.name))
    )
    const result = inspect(root, catalog([root, ...targets]))
    assert.equal(result.state.failure.$, count <= 16 ? "None" : "Some")
    if (count > 16) {
      assert.equal(result.state.failure.value.$, "Model.ReferenceLimit")
      assert.deepEqual(references(result)[16], {
        $: "Model.Omitted",
        symbol: "T16",
        target: some("T16"),
        reason: { $: "Model.LimitExceeded" }
      })
    }
  }
  for (const [edges, failure] of [
    [[unsupported("bad"), named("missing")], "Model.UnsupportedReference"],
    [[named("missing"), unsupported("bad")], "Model.MissingEvidence"]
  ]) {
    const root = declaration(0, "A", edges)
    const result = inspect(root, catalog([root]))
    assert.equal(result.state.failure.value.$, failure)
    assert.equal(references(result).length, 2, "failure does not stop later references")
  }
  const duplicateCount = declaration(0, "A", Array(40).fill(named("missing")))
  assert.equal(unlist(inspect(duplicateCount, catalog([duplicateCount])).state.referenced).length, 1)
  // A root outside the catalog still contributes its own visit/reference cost.
  const detached = declaration(0, "Detached", [named("X")])
  assert.equal(references(inspect(detached, catalog([oldX])))[0].node.slot, 1)

  const evaluateBytes = (expression, artifacts, trace, fault, supplied) => {
    switch (expression.$) {
      case "Literal":
        return Number(expression.value)
      case "Add":
        return (
          evaluateBytes(expression.left, artifacts, trace, fault, supplied) +
          evaluateBytes(expression.right, artifacts, trace, fault, supplied)
        )
      case "Multiply":
        return (
          evaluateBytes(expression.left, artifacts, trace, fault, supplied) *
          evaluateBytes(expression.right, artifacts, trace, fault, supplied)
        )
      case "ArtifactBytes":
      case "TextBytes": {
        const text = JSON.stringify(
          expression.$ === "ArtifactBytes" ? artifacts[Number(expression.slot)] : expression.value
        )
        trace.push([text, "utf8"])
        if (trace.length === fault?.at) throw fault.value
        return supplied?.(trace.length) ?? Buffer.byteLength(text, "utf8")
      }
      default:
        throw new Error("unexpected measurement expression")
    }
  }
  const nativePreflight = (path, source, trace, fault, supplied) => {
    const original = Buffer.byteLength
    Buffer.byteLength = (...args) => {
      // Observe only the original analyzer's measurement primitive, excluding
      // unrelated parser IO/encoding. The original compiled function is called.
      if (new Error().stack.includes("encodedBytes")) {
        trace.push([args[0], args[1]])
        if (trace.length === fault?.at) throw fault.value
        const suppliedValue = supplied?.(trace.length)
        if (suppliedValue !== undefined) return suppliedValue
      }
      return original(...args)
    }
    try {
      return analyzerMaterializationPreflight(path, source, true)
    } finally {
      Buffer.byteLength = original
    }
  }
  let measurementCases = 0,
    faultCases = 0
  const sources = [
    ["a.ts", "export interface Root { value: string }"],
    ["a.py", "class Root:\n value: str\n"],
    ["a.go", "package fixture\ntype Root struct { Value string }\n"],
    ["a.rs", "pub struct Root { pub value: String }\n"],
    ["a.bend", "type Root is Data:\n  Root{}\n"],
    ["a.ts", "interface A { child: B }\ninterface B { parent: A }\ninterface C { value: string }"],
    ["a.ts", "interface A { child: Missing }"],
    ["a.ts", "interface A { child: NS.B }"],
    ...[16, 17, 18].map((count) => [
      "a.ts",
      [
        "interface Root { values: [" + Array.from({ length: count }, (_, index) => "T" + index).join(",") + "] }",
        ...Array.from({ length: count }, (_, index) => "interface T" + index + " { value: string }")
      ].join("\n")
    ])
  ]
  let sourceRoots = 0
  for (const [path, source] of sources) {
    const native = analyzeTypeFile(path, source, true)
    assert.equal(native.status, "analyzed", "physical parser fixture must reach local analyzer: " + path)
    const adapter = languageForPath(path)
    const parsed = adapter.parseTypes(path, source, true)
    assert.ok(Array.isArray(parsed))
    const supporting = adapter.supportingTypes?.(path, source) ?? new Map()
    const artifacts = []
    const slots = new Map()
    const encode = (value) => {
      if (!slots.has(value)) {
        slots.set(value, artifacts.length)
        artifacts.push(value.artifact)
      }
      return declaration(
        slots.get(value),
        value.artifact.name,
        value.references.map((reference) =>
          reference.kind === "unsupported" ? unsupported(reference.name) : named(reference.name, reference.targetId)
        ),
        value.artifact.id
      )
    }
    const roots = parsed.map(encode)
    const facts = catalog(
      roots,
      [...supporting].map(([key, value]) => [key, encode(value)])
    )
    const decodeNode = (node) => ({
      artifact: artifacts[Number(node.slot)],
      references: unlist(node.references).map((reference) => {
        const site = { symbol: reference.symbol }
        if (reference.$ === "Model.Expanded") return { kind: "expanded", site, node: decodeNode(reference.node) }
        if (reference.$ === "Model.Included") return { kind: "included", site, target: reference.target }
        return {
          kind: "omitted",
          site,
          target:
            reference.target.$ === "None"
              ? { kind: "unresolved", symbol: reference.symbol }
              : { kind: "known", artifactId: reference.target.value },
          reason: {
            "Model.Unresolved": "unresolved",
            "Model.UnsupportedSyntax": "unsupported",
            "Model.LimitExceeded": "reference-limit"
          }[reference.reason.$]
        }
      })
    })
    const results = roots.map((root) => inspect(root, facts))
    const actual = results.map((result) => {
      const unit = { root: decodeNode(result.node) }
      return result.state.failure.$ === "None"
        ? { status: "ready", unit }
        : {
            status: "unsupported",
            root: unit.root.artifact,
            unit,
            reason: {
              "Model.MissingEvidence": "missing-evidence",
              "Model.UnsupportedReference": "unsupported-reference",
              "Model.ReferenceLimit": "reference-limit"
            }[result.state.failure.value.$]
          }
    })
    assert.deepEqual(actual, native.units, "independent recursive equations must equal actual native analyzer: " + path)
    const evaluateAll = (trace, fault, supplied) => {
      let subtotal = 0
      for (const result of results) subtotal += evaluateBytes(result.bytes, artifacts, trace, fault, supplied)
      return subtotal
    }
    const expressionTrace = [],
      nativeTrace = []
    const expectedBytes = evaluateAll(expressionTrace)
    const nativeBound = nativePreflight(path, source, nativeTrace)
    assert.equal(nativeBound.declarations, roots.length)
    assert.equal(nativeBound.expandedUnitBytes, expectedBytes, "original IEEE grouping and exact preflight bytes")
    assert.deepEqual(expressionTrace, nativeTrace, "ordered repeated native measurement trace")
    measurementCases++
    if (path === "a.ts") {
      for (const at of new Set([1, Math.ceil(nativeTrace.length / 2), nativeTrace.length])) {
        const sentinel = { at, path, source }
        const expectedPrefix = [],
          actualPrefix = []
        assert.throws(
          () => evaluateAll(expectedPrefix, { at, value: sentinel }),
          (error) => error === sentinel
        )
        assert.throws(
          () => nativePreflight(path, source, actualPrefix, { at, value: sentinel }),
          (error) => error === sentinel
        )
        assert.deepEqual(expectedPrefix, actualPrefix, "measurement fault must stop at the same primitive")
        faultCases++
      }
      // Deliberately substituted nonnegative engine results stress IEEE
      // grouping. These are raw engine diagnostics, not physical byte sizes.
      const supplied = (index) => [2 ** 53, 1, 3, 2 ** 48][index % 4]
      const expectedTrace = [],
        actualTrace = []
      assert.equal(
        nativePreflight(path, source, actualTrace, undefined, supplied).expandedUnitBytes,
        evaluateAll(expectedTrace, undefined, supplied)
      )
      assert.deepEqual(expectedTrace, actualTrace)
      measurementCases++
    }
    sourceRoots += roots.length
  }
  console.log(
    JSON.stringify({
      rawAndSourceCases: rawCases,
      sourceFixtures: sources.length,
      sourceRoots,
      measurementCases,
      faultCases,
      scope: "independent DFS and preflight evaluation tree; no production cursor or universal totality proof yet"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
