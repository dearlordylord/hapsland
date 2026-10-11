import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"
import { GRAPH_LIMIT_CEILINGS } from "../../../packages/canonical-policy/dist/canonical/graph-limits.js"
import { sourceFacts } from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs"
import { unlist } from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs"

const folder = import.meta.dirname,
  temporary = mkdtempSync(join(folder, "../../../node_modules/.cache/signed-local-"))
const inputs = [
  "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecification.bend",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecificationCheck.bend",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/SPEC.bend",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/WholeObservation.bend",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/Types.bend",
  "./signed-local-specification-check.mjs",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/SPEC.bend",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/core.bend",
  "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/Traversal.bend",
  "../../../bun.lock",
  "../../../packages/source-analysis/dist/direct-event/graph-resolver.js",
  "../../../packages/canonical-policy/dist/canonical/graph-adapter.js"
]
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(join(folder, path)))
    .digest("hex")
const sources = Object.fromEntries(inputs.map((path) => [path, hash(path)]))
const label = (value) => value.$.split(".").at(-1)
const signed = (work) => ({
  $: "WholeObservation." + (work < 0 ? "Negative" : "Nonnegative"),
  ...(work < 0 ? { magnitude: BigInt(-work) } : { value: BigInt(work) })
})
const omissions = {
  UnsupportedTarget: "unsupported",
  Unresolved: "unresolved",
  ReferenceLimit: "reference-limit",
  Unavailable: "unavailable"
}
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
      BigInt(value)
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
  ref("Mismatch", { targetId: "mismatch" })
]
const sequences = [
  [],
  ...variants.map((item) => [item]),
  ...variants.flatMap((first) => variants.map((second) => [first, second]))
]
try {
  const compiled = join(temporary, "signed.mjs")
  execFileSync(
    "bend",
    [
      join(
        folder,
        "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecificationCheck.bend"
      ),
      "-o",
      compiled
    ],
    { timeout: 5000 }
  )
  const spec = (await import(pathToFileURL(compiled))).default
  const nativePath = join(folder, "../../../packages/source-analysis/dist/direct-event/graph-resolver.js")
  const source = readFileSync(nativePath, "utf8").replaceAll(
    /from "(\.\/[^"]+)"/g,
    (_all, path) => `from "${pathToFileURL(join(dirname(nativePath), path))}"`
  )
  const nativeCopy = join(temporary, "native.mjs")
  writeFileSync(nativeCopy, source + "\nexport {buildLocal};\n")
  const { buildLocal } = await import(pathToFileURL(nativeCopy))
  let compared = 0,
    negativeFailures = 0,
    negativeCompletions = 0,
    missingRoots = 0
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
              ["Conflict", conflict]
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
          const visited = new Set(seen ? ["bundle"] : []),
            budget = {
              limits: GRAPH_LIMIT_CEILINGS,
              targetsByPath: new Map(),
              maxTargetsInFile: 0,
              work: 0,
              graphWork: work,
              maxDepth: 0
            }
          let native, error
          try {
            native = buildLocal(facts, "root.ts", "Root", visited, budget, depth)
          } catch (caught) {
            error = caught
          }
          const result = spec.build(10000n, wrapped, prepared.facts, "root.ts", "Root", BigInt(depth)),
            local = result.state.local
          if (error) {
            assert.ok(work < 0)
            assert.equal(label(result), "TechnicalFailure")
            assert.equal(label(result.failure), "NegativeGraphWork")
            assert.equal(Number(result.failure.magnitude), -work)
            negativeFailures++
          } else {
            assert.equal(label(result), "Built")
            if (work < 0) negativeCompletions++
            const artifacts = unlist(prepared.artifacts).map((item) => item.value.id)
            function tree(node) {
              return {
                artifact: artifacts[Number(node.artifact)],
                references: unlist(node.references).map((reference) => {
                  const outcome = reference.outcome,
                    kind = label(outcome)
                  return {
                    symbol: reference.symbol,
                    ...(kind === "Expanded"
                      ? { kind: "expanded", node: tree(outcome.tree) }
                      : kind === "Included"
                        ? { kind: "included", target: outcome.identity }
                        : { kind: "omitted", reason: omissions[label(outcome.reason)], target: outcome.target })
                  }
                })
              }
            }
            function nativeTree(node) {
              return {
                artifact: node.artifact.id,
                references: node.references.map((reference) => ({
                  symbol: reference.site.symbol,
                  ...(reference.kind === "expanded"
                    ? { kind: "expanded", node: nativeTree(reference.node) }
                    : reference.kind === "included"
                      ? { kind: "included", target: reference.target }
                      : { kind: "omitted", reason: reference.reason, target: reference.target.symbol })
                }))
              }
            }
            assert.deepEqual(tree(result.tree), nativeTree(native.node))
          }
          assert.deepEqual([local.budget.max_targets, local.budget.work, local.budget.max_depth].map(Number), [
            budget.maxTargetsInFile,
            budget.work,
            budget.maxDepth
          ])
          for (const identity of ["Root", "A", "B", "Conflict", "bundle", "invalid", "different"])
            assert.equal(spec.seen(local, identity), visited.has(identity), identity)
          for (const identity of [
            "A",
            "B",
            "Conflict",
            "Missing",
            "root.ts\0./imported\0Imported",
            "root.ts\0./types\0TypeOnly",
            "bundle"
          ])
            assert.equal(
              spec.contains_target(local, "root.ts", identity),
              budget.targetsByPath.get("root.ts")?.has(identity) ?? false,
              identity
            )
          assert.equal(Number(result.state.graph_work[work < 0 ? "magnitude" : "value"]), Math.abs(work))
          compared++
        }
  const facts = spec.source(sourceFacts({ declarations: new Map(), imports: new Map() })).facts
  for (const work of [-9, -1, 0, 2]) {
    const result = spec.build(
      10n,
      { $: "SignedLocalSpecification.State", local: spec.initial(limits, false), graph_work: signed(work) },
      facts,
      "root.ts",
      "Missing",
      0n
    )
    assert.equal(label(result), "Missing")
    assert.equal(
      buildLocal(
        { declarations: new Map(), imports: new Map() },
        "root.ts",
        "Missing",
        new Set(),
        {
          limits: GRAPH_LIMIT_CEILINGS,
          targetsByPath: new Map(),
          maxTargetsInFile: 0,
          work: 0,
          graphWork: work,
          maxDepth: 0
        },
        0
      ),
      undefined
    )
    missingRoots++
  }
  const zero = spec.build(
    10n,
    {
      $: "SignedLocalSpecification.State",
      local: spec.initial(limits, false),
      graph_work: { $: "WholeObservation.Negative", magnitude: 0n }
    },
    facts,
    "root.ts",
    "Missing",
    0n
  )
  assert.equal(label(zero), "Missing")
  assert.equal(label(zero.state.graph_work), "Nonnegative")
  assert.deepEqual(Object.fromEntries(inputs.map((path) => [path, hash(path)])), sources, "frozen sources")
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    sources,
    compared,
    negativeFailures,
    negativeCompletions,
    missingRoots,
    negativeZeroNormalizesToZero: true,
    scope:
      "Independent signed-domain local interpretation versus actual native buildLocal. Ordered recursive value, scalar budget, visited/target membership and exact negative permit placement; no full ordered-map/forest projection, outer post-traversal guards, exception materialization, whole expansion proof, consumer or performance qualification."
  }
  writeFileSync(
    join(folder, "signed-local-specification-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
