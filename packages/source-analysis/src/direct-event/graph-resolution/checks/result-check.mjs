import { artifactValueTag, list, fromProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { artifact, sourceFacts } from "../frontend-codec.ts"
import { inspectSourceFrontend } from "../frontends.ts"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
const temporary = mkdtempSync("/tmp/hapsland-resolver-result-"),
  folder = import.meta.dirname
try {
  const program = join(temporary, "core.mjs")
  execFileSync("bend", [join(folder, "../Core.bend"), "-o", program], { timeout: 10000 })
  const { default: core } = await import(pathToFileURL(program)),
    local = (name, fields = {}) => ({ $: "traversal/core." + name, ...fields }),
    typed = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
  const root = {
      path: "root.ts",
      id: "root",
      kind: "interface",
      name: "Root",
      source: "interface Root {child: Child}",
      sourceHash: "root-hash"
    },
    child = {
      id: "child",
      kind: "interface",
      name: "Child",
      source: "interface Child {}",
      sourceHash: "child-hash",
      path: "child.ts"
    }
  const entries = list([
      typed("ArtifactEntry", { handle: 0, value: artifact(root) }),
      typed("ArtifactEntry", { handle: 1, value: artifact(child) })
    ]),
    nodes = list([local("PlannedNode", { node: 0, artifact: 0 }), local("PlannedNode", { node: 1, artifact: 1 })]),
    slot = (owner, index, symbol, reference) => local("ReferenceSlot", { owner, index, symbol, reference })
  const refs = list([
    slot(0, 0, "Child", local("Expanded", { node: 1 })),
    slot(1, 0, "Unknown", local("Omitted", { reason: local("ReferenceLimit"), target_name: "Unknown" })),
    slot(0, 1, "again", local("Included", { identity: "child" })),
    slot(0, 2, "Missing", local("Omitted", { reason: local("Unresolved"), target_name: "Missing" }))
  ])
  const expected = {
    root: {
      artifact: root,
      references: [
        {
          kind: "expanded",
          site: { symbol: "Child" },
          node: {
            artifact: child,
            references: [
              {
                kind: "omitted",
                site: { symbol: "Unknown" },
                target: { kind: "unresolved", symbol: "Unknown" },
                reason: "reference-limit"
              }
            ]
          }
        },
        { kind: "included", site: { symbol: "again" }, target: "child" },
        {
          kind: "omitted",
          site: { symbol: "Missing" },
          target: { kind: "unresolved", symbol: "Missing" },
          reason: "unresolved"
        }
      ]
    },
    sourceDependencies: ["Cargo.toml"]
  }
  const result = core.review_unit(0, nodes, refs, entries, list(["Cargo.toml"]))
  assert.equal(result.$, "Some")
  const plain = fromProductValue(result.value)
  assert.deepEqual(plain, expected)
  assert.equal(JSON.stringify(plain), JSON.stringify(expected))
  const bare = core.review_unit(0, nodes, refs, entries, list([]))
  assert.equal(bare.$, "Some")
  assert.deepEqual(fromProductValue(bare.value), { ...expected, sourceDependencies: [] })
  const badOrder = {
    ...artifact(root),
    order: list([
      typed("ArtifactIdKey"),
      typed("ArtifactIdKey"),
      typed("ArtifactKindKey"),
      typed("ArtifactNameKey"),
      typed("ArtifactSourceKey"),
      typed("ArtifactHashKey")
    ])
  }
  assert.equal(core.artifact_product(badOrder).$, "None")
  assert.equal(
    core.review_unit(0, nodes, list([slot(0, 0, "cycle", local("Expanded", { node: 0 }))]), entries, list([])).$,
    "None"
  )
  assert.equal(
    core.review_unit(
      0,
      nodes,
      refs,
      list([
        typed("ArtifactEntry", { handle: 0, value: artifact(root) }),
        typed("ArtifactEntry", { handle: 0, value: artifact(child) })
      ]),
      list([])
    ).$,
    "None"
  )
  const origin = {
    kind: "bundled",
    library: "bend/Base",
    compilerVersion: "2.0.36",
    compilerSource: "pinned",
    moduleHash: "module",
    declarationHash: "decl"
  }
  const bundled = { origin, id: "base", kind: "datatype", name: "Nat", source: "type Nat", sourceHash: "h" }
  assert.deepEqual(fromProductValue(core.artifact_product(artifact(bundled)).value), bundled)
  const composedProgram = join(temporary, "composition.mjs")
  execFileSync("bend", [join(folder, "../Composition.bend"), "-o", composedProgram], { timeout: 10000 })
  const { default: composition } = await import(pathToFileURL(composedProgram))
  const emptyMap = { $: "MTip" },
    budget = local("Budget", {
      limits: local("LocalLimits", { work: 100, depth: 10, targets: 10 }),
      targets_by_path: emptyMap,
      max_targets: 1,
      work: 5,
      graph_work: 2,
      max_depth: 1
    })
  const childPending = local("Pending", {
    owner: 0,
    index: 0,
    from: "child.ts",
    symbol: "Unknown",
    name: "Unknown",
    depth: 1,
    expected: local("TypeKind"),
    target: local("Imported", { path: "./unknown", name: "Unknown" })
  })
  const localPlan = local("Plan", {
    root: 0,
    nodes: list([local("PlannedNode", { node: 0, artifact: 1 })]),
    references: list([
      slot(0, 0, "Unknown", local("Omitted", { reason: local("Unresolved"), target_name: "Unknown" }))
    ]),
    pending: list([childPending]),
    visited: emptyMap,
    budget
  })
  const remapped = composition.remap(localPlan, 1)
  assert.equal(remapped.root, 1)
  assert.equal(remapped.next_node, 2)
  const baseNodes = list([local("PlannedNode", { node: 0, artifact: 0 })]),
    baseRefs = list([slot(0, 0, "Child", local("Omitted", { reason: local("Unresolved"), target_name: "Child" }))])
  const attachment = composition.tentative_attachment(remapped, baseNodes, baseRefs, 0, 0, { $: "None" }, 7, emptyMap)
  assert.equal(attachment.$, "Some")
  const attached = attachment.value
  assert.equal(attached.next_edge, 8)
  assert.deepEqual(attached.pending_ids, list([7]))
  assert.equal(attached.pending.$, "MLeaf")
  assert.equal(attached.pending.val.value.owner, 1)
  const full = core.review_unit(0, attached.nodes, attached.references, entries, list([]))
  assert.equal(full.$, "Some")
  assert.equal(fromProductValue(full.value).root.references[0].node.artifact.id, "child")
  const rejected = composition.refuse_attachment(attached, 0, 0, "Child")
  assert.equal(rejected.$, "Some")
  assert.equal(rejected.value.next_node, 2)
  assert.equal(rejected.value.next_edge, 8)
  assert.deepEqual(rejected.value.pending, attached.pending)
  assert.deepEqual(rejected.value.attempted_budget, budget)
  const rollback = core.review_unit(0, rejected.value.nodes, rejected.value.references, entries, list([]))
  assert.equal(rollback.$, "Some")
  assert.deepEqual(fromProductValue(rollback.value).root.references[0], {
    kind: "omitted",
    site: { symbol: "Child" },
    target: { kind: "unresolved", symbol: "Child" },
    reason: "reference-limit"
  })
  assert.equal(
    composition.tentative_attachment(remapped, baseNodes, baseRefs, 0, 9, { $: "None" }, 7, emptyMap).$,
    "None"
  )
  assert.equal(
    composition.tentative_attachment(
      remapped,
      baseNodes,
      list([
        slot(0, 0, "a", local("Included", { identity: "child" })),
        slot(0, 0, "b", local("Included", { identity: "child" }))
      ]),
      0,
      0,
      { $: "None" },
      7,
      emptyMap
    ).$,
    "None"
  )
  const factsProgram = join(temporary, "facts.mjs")
  execFileSync("bend", [join(folder, "../Facts.bend"), "-o", factsProgram], { timeout: 10000 })
  const { default: factsCore } = await import(pathToFileURL(factsProgram))
  const rawFacts = {
    declarations: new Map([
      ["Root", { artifact: root, exported: true, references: [{ kind: "named", name: "Child" }] }],
      ["Child", { artifact: child, exported: false, references: [] }]
    ]),
    imports: new Map([["External", { path: "./external", name: "External", typeOnly: true }]])
  }
  const syntax = sourceFacts(rawFacts),
    preparedFacts = factsCore.prepare(syntax, 10)
  assert.equal(preparedFacts.$, "Some")
  assert.equal(preparedFacts.value.next_artifact, 12)
  assert.equal(preparedFacts.value.facts.kind_aware, false)
  assert.equal(preparedFacts.value.artifacts.head.handle, 10)
  const catalogNodes = list([
    local("PlannedNode", { node: 0, artifact: 10 }),
    local("PlannedNode", { node: 1, artifact: 11 })
  ])
  const fromSyntax = core.review_unit(
    0,
    catalogNodes,
    list([slot(0, 0, "Child", local("Expanded", { node: 1 }))]),
    preparedFacts.value.artifacts,
    list([])
  )
  assert.equal(fromSyntax.$, "Some")
  assert.deepEqual(fromProductValue(fromSyntax.value).root.artifact, root)
  assert.equal(
    factsCore.prepare({ ...syntax, declarations: list([syntax.declarations.head, syntax.declarations.head]) }, 0).$,
    "None"
  )
  assert.equal(factsCore.prepare({ ...syntax, imports: list([syntax.imports.head, syntax.imports.head]) }, 0).$, "None")
  const typedSource = sourceFacts({ ...rawFacts, kindAware: true })
  assert.equal(factsCore.prepare(typedSource, 0).value.facts.kind_aware, true)
  const rootProgram = join(temporary, "root.mjs")
  execFileSync("bend", [join(folder, "../Root.bend"), "-o", rootProgram], { timeout: 10000 })
  const { default: rootCore } = await import(pathToFileURL(rootProgram)),
    limits = {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      version: 1,
      source_bytes: 10000,
      tree_bytes: 10000,
      files: 10,
      read_bytes: 10000,
      outgoing_edges: 10,
      depth: 10,
      work: 100
    }
  const planningProgram = join(temporary, "root-planning.mjs")
  execFileSync("bend", [join(folder, "../RootPlanning.bend"), "-o", planningProgram], { timeout: 10000 })
  const { default: rootPlanning } = await import(pathToFileURL(planningProgram))
  const rootKind = (value) => value.$
  const initialRoot = rootPlanning.prepare(syntax, "root.ts", "Root", typed("TypeBranch"), limits, 33, list([]))
  assert.equal(rootKind(initialRoot), "Root.RootPrepared")
  const rootUnit = rootCore.unit(initialRoot.frame)
  assert.equal(rootUnit.$, "Some")
  assert.deepEqual(fromProductValue(rootUnit.value).root, {
    artifact: root,
    references: [{ kind: "expanded", site: { symbol: "Child" }, node: { artifact: child, references: [] } }]
  })
  const initialized = rootPlanning.initialize(
    initialRoot.frame,
    33,
    Number(Buffer.byteLength(JSON.stringify(fromProductValue(rootUnit.value))))
  )
  assert.equal(initialized.graph.files, 1)
  assert.equal(initialized.graph.read_bytes, 33)
  assert.equal(
    rootKind(rootPlanning.prepare(syntax, "root.ts", "Missing", typed("TypeBranch"), limits, 33, list([]))),
    "Root.RootUnavailable"
  )
  assert.equal(
    rootKind(rootPlanning.prepare(syntax, "root.ts", "Root", typed("FunctionBranch"), limits, 33, list([]))),
    "Root.RootPrepared"
  )
  assert.equal(
    rootKind(
      rootPlanning.prepare(syntax, "root.ts", "Root", typed("TypeBranch"), { ...limits, work: 0 }, 33, list([]))
    ),
    "Root.RootUnavailable"
  )
  const importedSyntax = sourceFacts({
    ...rawFacts,
    declarations: new Map([
      ["Root", { ...rawFacts.declarations.get("Root"), references: [{ kind: "named", name: "External" }] }]
    ])
  })
  const importedRoot = rootPlanning.prepare(
    importedSyntax,
    "root.ts",
    "Root",
    typed("TypeBranch"),
    limits,
    33,
    list([])
  )
  assert.equal(rootKind(importedRoot), "Root.RootPrepared")
  assert.equal(importedRoot.frame.next_edge, 2)
  assert.equal(importedRoot.frame.pending.key, "1")
  assert.equal(importedRoot.frame.pending.val.value.owner, 0)
  const pendingRoot = rootPlanning.initialize(importedRoot.frame, 33, 1)
  assert.equal(pendingRoot.graph.pending.head.id, 1)
  const supportSyntax = sourceFacts({
    ...rawFacts,
    supportingDeclarations: new Map([["support", { artifact: child, exported: true, references: [] }]])
  })
  const supportPrepared = factsCore.prepare(supportSyntax, 0)
  assert.equal(supportPrepared.$, "Some")
  assert.equal(supportPrepared.value.facts.supporting.val.value.bundled, false)
  const bundledSyntax = sourceFacts({
    ...rawFacts,
    supportingDeclarations: new Map([["base", { artifact: bundled, exported: true, references: [] }]])
  })
  assert.equal(factsCore.prepare(bundledSyntax, 0).value.facts.supporting.val.value.bundled, true)
  assert.equal(
    rootKind(
      rootPlanning.prepare(
        { ...syntax, declarations: list([syntax.declarations.head, syntax.declarations.head]) },
        "root.ts",
        "Root",
        typed("TypeBranch"),
        limits,
        33,
        list([])
      )
    ),
    "Root.RootMalformedSyntax"
  )
  const rootFixtures = [
    [
      "root.ts",
      "export interface Child { value: boolean }; export interface Root { child: Child }",
      "type",
      "TypeScriptContext",
      ["interface", "export interface Root { child: Child }", "export interface Child { value: boolean }"]
    ],
    [
      "callable.ts",
      "export function Root(value: string): string { return value }",
      "function",
      "TypeScriptContext",
      ["function", "export function Root(value: string): string { return value }"]
    ],
    [
      "root.rs",
      "pub struct Child { value: bool } pub struct Root { child: Child }",
      "type",
      "RustSourceContext",
      ["struct", "pub struct Root { child: Child }", "pub struct Child { value: bool }"]
    ],
    [
      "root.bend",
      "type Child is Data:\n  Child{}\ntype Root is Data:\n  Root{child: Child}",
      "type",
      "BendSourceContext",
      ["datatype", "type Root is Data:\n  Root{child: Child}", "type Child is Data:\n  Child{}"]
    ]
  ]
  const nativeLimits = GRAPH_LIMIT_CEILINGS,
    typedLimits = {
      ...limits,
      source_bytes: Number(nativeLimits.sourceBytes),
      tree_bytes: Number(nativeLimits.treeBytes),
      files: Number(nativeLimits.files),
      read_bytes: Number(nativeLimits.readBytes),
      outgoing_edges: Number(nativeLimits.outgoingEdges),
      depth: Number(nativeLimits.depth),
      work: Number(nativeLimits.work)
    }
  for (const [path, source, branch, contextName, [kind, rootSource, childSource]] of rootFixtures) {
    const capture = { text: source, byteLength: Buffer.byteLength(source) },
      context = typed(contextName, {
        branch: typed(branch === "function" ? "FunctionBranch" : "TypeBranch"),
        ...(contextName === "RustSourceContext"
          ? {
              context: typed("RustContext", {
                crate_root: { $: "None" },
                external_module: { $: "None" },
                modules: { $: "None" }
              })
            }
          : {})
      })
    const frontend = inspectSourceFrontend(path, source, context)
    assert.equal(frontend.$, "Types.SourceFacts")
    const candidateRoot = rootPlanning.prepare(
      frontend,
      path,
      "Root",
      context.branch,
      typedLimits,
      Number(capture.byteLength),
      list([])
    )
    assert.equal(rootKind(candidateRoot), "Root.RootPrepared")
    const candidateUnit = rootCore.unit(candidateRoot.frame)
    assert.equal(candidateUnit.$, "Some")
    const expectedArtifact = (name, source) => ({
      path,
      id: `${path}:${kind}:${name}`,
      kind,
      name,
      source,
      sourceHash: createHash("sha256").update(source).digest("hex")
    })
    const expected = {
      root: {
        artifact: expectedArtifact("Root", rootSource),
        references:
          childSource === undefined
            ? []
            : [
                {
                  kind: "expanded",
                  site: { symbol: "Child" },
                  node: { artifact: expectedArtifact("Child", childSource), references: [] }
                }
              ]
      },
      sourceDependencies: []
    }
    assert.deepEqual(fromProductValue(candidateUnit.value), expected, path + " authored whole tree")
  }
  const record = {
    passed: true,
    cases: rootFixtures.length,
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    entireNestedResult: true,
    actualRootConsumerFixtures: rootFixtures.length,
    bundledOriginRequired: true,
    malformedSyntaxDistinctFromMissingRoot: true,
    bendRootTraversalAndFrame: true,
    rootEventAccounting: true,
    rootPendingIdsMatch: true,
    explicitRootTreesAndDefaultPlanChecked: true,
    missingAndBudgetRootRejected: true,
    bendOwnsFrontendCatalogAllocation: true,
    duplicateSyntaxKeysRejected: true,
    compositionAddressRemapping: true,
    pendingRegisteredBeforeAdmission: true,
    rollbackRetainsChargesAndPending: true,
    unreachableRejectedNodesAllowed: true,
    missingOrDuplicateAttachmentRejected: true,
    propertyOrder: true,
    emptySourceDependenciesPreserved: true,
    artifactOriginOrder: true,
    duplicateArtifactFieldsRejected: true,
    duplicateHandlesRejected: true,
    malformedExpandedCycleRejected: true,
    scope:
      "compiled pure Bend entire result construction over flat graph addresses; full resolver orchestration/integration/proofs pending"
  }
  const evidenceDirectory = join(folder, "../../../../../../.test-runs/bend-migration")
  mkdirSync(evidenceDirectory, { recursive: true })
  writeFileSync(
    join(evidenceDirectory, "result-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
