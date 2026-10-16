import assert from "node:assert/strict"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join, dirname } from "node:path"
import { pathToFileURL } from "node:url"
const _root = resolve(import.meta.dirname, "../../../../../.."),
  temporary = mkdtempSync(join(tmpdir(), "hapsland-local-graph-diff-"))
const empty = () => ({ $: "MTip" }),
  list = (xs) => xs.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const unlist = (xs) => {
  const result = []
  while (xs.$ === "Con") {
    result.push(xs.head)
    xs = xs.tail
  }
  return result
}
const entries = (m) => (m.$ === "MTip" ? [] : m.$ === "MLeaf" ? [[m.key, m.val]] : [...entries(m.lo), ...entries(m.hi)])
const expectation = (value) => ({ $: value === undefined ? "AnyKind" : value === "type" ? "TypeKind" : "FunctionKind" })
const stateSummary = (visited, budget) => ({
  visited: [...visited].sort(),
  targets: [...budget.targetsByPath].map(([p, s]) => [p, [...s].sort()]).sort(),
  work: budget.work,
  maxDepth: budget.maxDepth,
  maxTargets: budget.maxTargetsInFile,
  graphWork: budget.graphWork
})
const normalize = (built, visited, budget) => {
  if (built === undefined) return { missing: true, state: stateSummary(visited, budget) }
  const addresses = new Map()
  let next = 0
  const visit = (node) => {
    addresses.set(node, next++)
    for (const r of node.references) if (r.kind === "expanded") visit(r.node)
  }
  visit(built.node)
  return {
    node: built.node,
    pending: built.pending.map((p) => ({
      owner: addresses.get(p.owner),
      index: p.index,
      from: p.from,
      symbol: p.symbol,
      name: p.name,
      depth: p.depth,
      ...(p.expectedKind === undefined ? {} : { expectedKind: p.expectedKind }),
      ...(p.bundled ? { bundled: p.bundled.declaration.artifact.id } : { importPath: p.importPath })
    })),
    state: stateSummary(visited, budget)
  }
}
try {
  const natural = (value, outgoing = false) => {
    if (typeof value === "number") return value
    if (typeof value === "bigint") return outgoing ? Number(value) : value
    if (Array.isArray(value)) return value.map((item) => natural(item, outgoing))
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, natural(item, outgoing)]))
    return value
  }
  const callable = (module, qualify = false) =>
    Object.fromEntries(
      Object.entries(module).map(([name, value]) => [
        name,
        typeof value === "function"
          ? (...args) => {
              const encoded = args.map((arg) => natural(qualify ? moduleTags(arg, true) : arg))
              const result = natural(value(...encoded), true)
              return qualify ? moduleTags(result, false) : result
            }
          : value
      ])
    )
  const emitted = join(temporary, "core.mjs")
  execFileSync("bend", [resolve(import.meta.dirname, "../traversal/Traversal.bend"), "-o", emitted], { timeout: 10000 })
  const runtime = (await import(pathToFileURL(emitted))).default
  const coreTags = new Set([
    "PlannedNode",
    "ReferenceSlot",
    "Facts",
    "Declaration",
    "ImportBinding",
    "Reference",
    "AnyKind",
    "TypeKind",
    "FunctionKind",
    "Named",
    "BoundNamed",
    "Unsupported",
    "Budget",
    "LocalLimits",
    "Pending",
    "Imported",
    "BundledTarget",
    "Unresolved",
    "UnsupportedTarget",
    "ReferenceLimit",
    "Unavailable"
  ])
  const moduleTags = (value, prefix) => {
    if (value === null || typeof value !== "object") return value
    if (Array.isArray(value)) return value.map((v) => moduleTags(v, prefix))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k === "$"
          ? prefix && coreTags.has(v)
            ? "core." + v
            : !prefix && typeof v === "string" && v.startsWith("core.")
              ? v.slice(5)
              : v
          : moduleTags(v, prefix)
      ])
    )
  }
  const core = callable(runtime, true)
  const specEmitted = join(temporary, "spec.mjs")
  execFileSync("bend", [resolve(import.meta.dirname, "../traversal/SPEC.bend"), "-o", specEmitted], { timeout: 10000 })
  const spec = callable((await import(pathToFileURL(specEmitted))).default)
  const relationEmitted = join(temporary, "relation.mjs")
  execFileSync("bend", [resolve(import.meta.dirname, "../traversal/RELATION.bend"), "-o", relationEmitted], {
    timeout: 10000
  })
  const relation = callable((await import(pathToFileURL(relationEmitted))).default)
  function candidate(file, name, expected, visited, budget, depth) {
    const artifacts = new Map()
    let next = 1
    const encodeDeclaration = (d) => {
      const handle = next++
      artifacts.set(handle, d.artifact)
      return {
        $: "Declaration",
        handle,
        identity: d.artifact.id,
        function: d.artifact.kind === "function",
        bundled: d.artifact.origin?.kind === "bundled",
        references: list(
          d.references.map((r) => ({
            $: "Reference",
            kind: {
              $: r.kind === "unsupported" ? "Unsupported" : r.bindingName === undefined ? "Named" : "BoundNamed",
              ...(r.kind !== "unsupported" && r.bindingName !== undefined ? { binding: r.bindingName } : {})
            },
            name: r.name,
            expected: expectation(r.expectedKind),
            target: r.targetId === undefined ? { $: "None" } : { $: "Some", value: r.targetId }
          }))
        ),
        source_path: d.artifact.path === undefined ? { $: "None" } : { $: "Some", value: d.artifact.path }
      }
    }
    let declarations = empty(),
      imports = empty(),
      supporting = empty(),
      seen = empty(),
      targets = empty()
    const declarationRecords = [],
      supportingRecords = []
    for (const [k, d] of file.declarations) {
      const encoded = encodeDeclaration(d)
      declarations = core.declaration_entry(declarations, k, encoded)
      declarationRecords.push({ $: "BOUNDARY.DeclarationEntry", key: k, declaration: encoded })
    }
    for (const [k, d] of file.supportingDeclarations ?? []) {
      const encoded = encodeDeclaration(d)
      supporting = core.declaration_entry(supporting, k, encoded)
      supportingRecords.push({ $: "BOUNDARY.DeclarationEntry", key: k, declaration: encoded })
    }
    for (const [k, b] of file.imports)
      imports = core.import_entry(imports, k, {
        $: "ImportBinding",
        path: b.path,
        name: b.name,
        type_only: b.typeOnly === true
      })
    for (const id of visited) seen = core.identity_entry(seen, id)
    for (const [path, set] of budget.targetsByPath) {
      let t = empty()
      for (const id of set) t = core.identity_entry(t, id)
      targets = core.path_targets_entry(targets, path, t)
    }
    const rawBudget = {
      $: "Budget",
      limits: {
        $: "LocalLimits",
        work: budget.limits.work,
        depth: budget.limits.depth,
        targets: budget.limits.outgoingEdges
      },
      targets_by_path: targets,
      max_targets: budget.maxTargetsInFile,
      work: budget.work,
      graph_work: budget.graphWork,
      max_depth: budget.maxDepth
    }
    const boundaryFacts = moduleTags(
      {
        $: "BOUNDARY.BoundaryFacts",
        kind_aware: !!file.kindAware,
        declarations: list(declarationRecords),
        imports: list(
          [...file.imports].map(([key, b]) => ({
            $: "BOUNDARY.ImportEntry",
            key,
            binding: { $: "ImportBinding", path: b.path, name: b.name, type_only: b.typeOnly === true }
          }))
        ),
        supporting: list(supportingRecords)
      },
      true
    )
    const boundaryState = moduleTags(
      {
        $: "BOUNDARY.BoundaryState",
        visited: list([...visited]),
        targets: list(
          [...budget.targetsByPath].map(([path, t]) => ({
            $: "BOUNDARY.PathTargetsEntry",
            path,
            targets: list([...t])
          }))
        ),
        limits: rawBudget.limits,
        max_targets: budget.maxTargetsInFile,
        work: budget.work,
        graph_work: budget.graphWork,
        max_depth: budget.maxDepth
      },
      true
    )
    const exactCore = relation.core_observation(
      boundaryFacts,
      boundaryState,
      "a.ts",
      name,
      moduleTags(expectation(expected), true),
      depth
    )
    const exactSpec = relation.recursive_observation(
      boundaryFacts,
      boundaryState,
      "a.ts",
      name,
      moduleTags(expectation(expected), true),
      depth
    )
    assert.notEqual(exactCore.$, "Failed", "proposed production completion law falsified")
    assert.notEqual(exactSpec.$, "Failed", "proposed recursive completion law falsified")
    assert.deepEqual(exactCore, exactSpec, "proposed whole-algorithm equality law falsified")
    const facts = { $: "Facts", kind_aware: !!file.kindAware, declarations, imports, supporting }
    // Independent recursive tree specification has its own generous test bound.
    // This finite test bound is not the production termination theorem.
    const specification = moduleTags(
      spec.interpret(
        10000,
        moduleTags(
          {
            $: "Request",
            facts,
            path: "a.ts",
            name,
            expected: expectation(expected),
            depth,
            state: { $: "State", visited: seen, budget: rawBudget, next_address: 0, pending_rev: list([]) }
          },
          true
        )
      ),
      false
    )
    assert.equal(specification.$, "BuildResult")
    assert.notEqual(specification.build.$, "InsufficientBound")
    const specificationBuild = specification.build,
      specificationState = specificationBuild.state
    const specVisited = new Set(entries(specificationState.visited).map(([key]) => key))
    const specBudget = {
      ...budget,
      targetsByPath: new Map(
        entries(specificationState.budget.targets_by_path).map(([path, t]) => [
          path,
          new Set(entries(t).map(([key]) => key))
        ])
      ),
      work: Number(specificationState.budget.work),
      maxDepth: Number(specificationState.budget.max_depth),
      maxTargetsInFile: Number(specificationState.budget.max_targets),
      graphWork: Number(specificationState.budget.graph_work)
    }
    const specNodes = new Map(),
      reasons = {
        Unresolved: "unresolved",
        UnsupportedTarget: "unsupported",
        ReferenceLimit: "reference-limit",
        Unavailable: "unavailable"
      }
    const decodeTree = (tree) => {
      const node = { artifact: artifacts.get(Number(tree.artifact)), references: [] }
      specNodes.set(Number(tree.address), node)
      node.references = unlist(tree.references).map((r) => {
        const o = r.outcome,
          site = { symbol: r.symbol }
        return o.$ === "Included"
          ? { kind: "included", site, target: o.identity }
          : o.$ === "Expanded"
            ? { kind: "expanded", site, node: decodeTree(o.tree) }
            : { kind: "omitted", site, target: { kind: "unresolved", symbol: o.target }, reason: reasons[o.reason.$] }
      })
      return node
    }
    const specTree = specificationBuild.$ === "Built" ? decodeTree(specificationBuild.tree) : undefined
    const specPending = unlist(specificationState.pending_rev)
      .reverse()
      .map((p) => ({
        owner: specNodes.get(Number(p.owner)),
        index: Number(p.index),
        from: p.from,
        symbol: p.symbol,
        name: p.name,
        depth: Number(p.depth),
        ...(p.expected.$ === "AnyKind" ? {} : { expectedKind: p.expected.$ === "TypeKind" ? "type" : "function" }),
        ...(p.target.$ === "Imported"
          ? { importPath: p.target.path }
          : { bundled: { declaration: { artifact: artifacts.get(Number(p.target.declaration)) } } })
      }))
    const specNormalized = normalize(
      specTree === undefined ? undefined : { node: specTree, pending: specPending },
      specVisited,
      specBudget
    )
    const verifySpecification = (actual) => {
      assert.deepEqual(actual, specNormalized, "independent recursive specification differs")
      return actual
    }
    const result = core.plan(facts, "a.ts", name, expectation(expected), seen, rawBudget, depth)
    assert.notEqual(result.$, "InvariantFailure", "derived traversal bound exhausted")
    const raw = result.$ === "MissingRoot" ? result : result.plan
    const updatedVisited = new Set(entries(raw.visited).map(([key]) => key)),
      updatedBudget = {
        ...budget,
        targetsByPath: new Map(
          entries(raw.budget.targets_by_path).map(([path, t]) => [path, new Set(entries(t).map(([key]) => key))])
        ),
        work: Number(raw.budget.work),
        maxDepth: Number(raw.budget.max_depth),
        maxTargetsInFile: Number(raw.budget.max_targets),
        graphWork: Number(raw.budget.graph_work)
      }
    if (result.$ === "MissingRoot") return verifySpecification(normalize(undefined, updatedVisited, updatedBudget))
    const flat = moduleTags(
      spec.flatten(10000, { $: "FlattenTree", tree: moduleTags(specificationBuild.tree, true) }),
      false
    )
    assert.equal(flat.$, "Flat", "independent tree projection exhausted")
    assert.deepEqual(flat.nodes, raw.nodes, "artifact handles/node addresses differ")
    assert.deepEqual(flat.slots, raw.references, "ordered reference slots differ")
    assert.deepEqual(
      unlist(specificationState.pending_rev).reverse(),
      unlist(raw.pending),
      "exact ordered pending handles differ"
    )
    assert.deepEqual(specificationState.visited, raw.visited, "exact visited representation differs")
    assert.deepEqual(specificationState.budget, raw.budget, "exact budget representation differs")
    const nodes = new Map(
      unlist(raw.nodes).map((n) => [Number(n.node), { artifact: artifacts.get(Number(n.artifact)), references: [] }])
    )
    for (const slot of unlist(raw.references)) {
      const r = slot.reference,
        site = { symbol: slot.symbol }
      nodes.get(Number(slot.owner)).references[Number(slot.index)] =
        r.$ === "Included"
          ? { kind: "included", site, target: r.identity }
          : r.$ === "Expanded"
            ? { kind: "expanded", site, node: nodes.get(Number(r.node)) }
            : {
                kind: "omitted",
                site,
                target: { kind: "unresolved", symbol: r.target_name },
                reason: reasons[r.reason.$]
              }
    }
    const pending = unlist(raw.pending).map((p) => ({
      owner: nodes.get(Number(p.owner)),
      index: Number(p.index),
      from: p.from,
      symbol: p.symbol,
      name: p.name,
      depth: Number(p.depth),
      ...(p.expected.$ === "AnyKind" ? {} : { expectedKind: p.expected.$ === "TypeKind" ? "type" : "function" }),
      ...(p.target.$ === "Imported"
        ? { importPath: p.target.path }
        : { bundled: { declaration: { artifact: artifacts.get(Number(p.target.declaration)) } } })
    }))
    return verifySpecification(normalize({ node: nodes.get(Number(raw.root)), pending }, updatedVisited, updatedBudget))
  }
  let cases = 0
  for (let seed = 0; seed < 240; seed++) {
    const aware = seed % 2 === 0,
      artifact = (name, kind = "function", origin) => ({
        id: name,
        name,
        kind,
        source: name,
        sourceHash: name,
        ...(origin ? { origin: { kind: "bundled" } } : {})
      })
    const ref = (name, extra = {}) => ({ kind: "named", name, ...extra })
    const declarations = new Map(),
      key = (name) => (aware ? "function:" + name : name)
    declarations.set(key("A"), {
      artifact: artifact("A"),
      references: [
        ref("B", { expectedKind: seed % 2 === 0 ? "function" : undefined }),
        ref("C"),
        ref("B"),
        { kind: "unsupported", name: "U" },
        ref("I", { expectedKind: seed % 3 === 0 ? "function" : undefined }),
        ref("T", { targetId: "T" }),
        ref("missing")
      ]
    })
    declarations.set(key("B"), {
      artifact: artifact("B", seed % 7 === 0 ? "interface" : "function"),
      references: [ref("A"), ref("I")]
    })
    declarations.set(key("C"), { artifact: artifact("C"), references: [ref("B"), ref("T", { targetId: "T" })] })
    const imports = new Map([["I", { path: "./i", name: "Imported", typeOnly: seed % 3 === 0 }]])
    if (seed % 5 === 0) imports.set("B", { path: "./b", name: "B" })
    const supportingDeclarations = new Map(
      seed % 4 === 0
        ? []
        : [["T", { artifact: artifact(seed % 11 === 0 ? "wrong" : "T", "datatype", seed % 9 !== 0), references: [] }]]
    )
    const file = { kindAware: aware, declarations, imports, supportingDeclarations }
    const makeBudget = () => ({
      limits: { ...GRAPH_LIMIT_CEILINGS, work: 1 + (seed % 12), depth: 1 + (seed % 4), outgoingEdges: 1 + (seed % 8) },
      targetsByPath: new Map(seed % 6 === 0 ? [["a.ts", new Set(["prior"])]] : []),
      maxTargetsInFile: seed % 6 === 0 ? 1 : 0,
      work: seed % 3,
      graphWork: seed % 2,
      maxDepth: seed % 2
    })
    const name = seed % 17 === 0 ? "absent" : "A",
      depth = seed % 3,
      visited = new Set(seed % 8 === 0 ? ["B", "T"] : []),
      candidateBudget = makeBudget()
    candidate(file, name, undefined, visited, candidateBudget, depth)
    cases++
  }
  // Exact native NUL strings can collide across local identities and import keys.
  // Preserve these collisions instead of imposing disjoint key namespaces.
  for (let variant = 0; variant < 12; variant++) {
    const id = variant % 3 === 0 ? "a.ts\0./i\0Remote" : variant % 3 === 1 ? "missing" : "shared"
    const declaration = (name, identity, refs, kind = "function") => ({
      artifact: { id: identity, name, kind, source: name, sourceHash: name },
      references: refs
    })
    const ref = (name) => ({ kind: "named", name })
    const aware = variant % 2 === 0
    const file = {
      kindAware: aware,
      declarations: new Map([
        [aware ? "function:A" : "A", declaration("A", "root", [ref("B"), ref("I"), ref("missing"), ref("C")])],
        [aware ? "function:B" : "B", declaration("B", id, [])],
        [aware ? "function:C" : "C", declaration("C", id, [ref("A")])]
      ]),
      imports: new Map([["I", { path: "./i", name: "Remote" }]])
    }
    if (variant >= 8) file.declarations.set("type:A", declaration("A", "type-root", [], "interface"))
    const limits = {
      ...GRAPH_LIMIT_CEILINGS,
      work: 128,
      depth: GRAPH_LIMIT_CEILINGS.depth,
      outgoingEdges: variant % 4 === 0 ? 2 : 16
    }
    const budget = {
      limits,
      targetsByPath: new Map([["other.ts", new Set(["prior\0id"])]]),
      maxTargetsInFile: 1,
      work: 0,
      graphWork: 0,
      maxDepth: 0
    }
    const prior = new Set(variant % 4 === 1 ? [id] : [])
    const expected = variant >= 8 ? "type" : undefined
    candidate(file, "A", expected, prior, budget, 0)
    cases++
  }
  let random = 918273
  const draw = (n) => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0
    return random % n
  }
  for (let trial = 0; trial < 200; trial++) {
    const aware = draw(2) === 0,
      decls = new Map(),
      names = Array.from({ length: 3 + draw(6) }, (_, i) => "N" + i)
    for (const name of names) {
      const kind = draw(3) === 0 ? "interface" : "function",
        refs = []
      for (let i = 0, n = draw(7); i < n; i++)
        refs.push({
          kind: draw(6) === 0 ? "unsupported" : "named",
          name: draw(4) === 0 ? "I" : names[draw(names.length)],
          ...(draw(3) === 0 ? { expectedKind: draw(2) === 0 ? "type" : "function" } : {})
        })
      const id = draw(5) === 0 ? "shared" : name
      decls.set(aware ? (kind === "function" ? "function:" : "type:") + name : name, {
        artifact: { id, name, kind, source: name, sourceHash: name },
        references: refs
      })
    }
    const file = {
      kindAware: aware,
      declarations: decls,
      imports: new Map([["I", { path: "./i", name: "I", typeOnly: draw(2) === 0 }]])
    }
    if (draw(3) === 0) file.imports.set(names[1], { path: "./ambiguous", name: names[1] })
    const limits = { ...GRAPH_LIMIT_CEILINGS, work: 1 + draw(128), depth: 1 + draw(4), outgoingEdges: 1 + draw(16) }
    let candidateVisited = new Set(),
      candidateBudget = {
        limits,
        targetsByPath: new Map(),
        maxTargetsInFile: 0,
        work: 0,
        graphWork: draw(5),
        maxDepth: 0
      }
    for (let invocation = 0; invocation < 2; invocation++) {
      const beforeCandidate = new Set(candidateVisited),
        name = names[draw(names.length)],
        expected = draw(2) === 0 ? undefined : "type",
        depth = draw(3)
      const actual = candidate(file, name, expected, candidateVisited, candidateBudget, depth)
      cases++
      candidateVisited = new Set(actual.state.visited)
      candidateBudget = {
        limits,
        targetsByPath: new Map(actual.state.targets.map(([p, t]) => [p, new Set(t)])),
        maxTargetsInFile: actual.state.maxTargets,
        work: actual.state.work,
        graphWork: actual.state.graphWork,
        maxDepth: actual.state.maxDepth
      }
      if (draw(3) === 0) {
        candidateVisited = beforeCandidate
      }
    }
  }

  const declaration = (name, references = [], path) => ({
    artifact: {
      id: name,
      name,
      kind: "function",
      source: name,
      sourceHash: name,
      ...(path === undefined ? {} : { path })
    },
    references: references.map((name) => ({ kind: "named", name }))
  })
  const pathCases = [
    {
      name: "cross-file-leaf",
      declarations: [declaration("Root", ["A"], "root-metadata.go"), declaration("A", [], "child.go")]
    },
    {
      name: "per-file-edge-budget",
      declarations: [
        declaration("Root", ["A", "B"]),
        declaration("A", ["C", "D"], "a.go"),
        declaration("B", ["C", "D"], "b.go"),
        declaration("C"),
        declaration("D")
      ]
    },
    {
      name: "parent-sibling-import",
      declarations: [declaration("Root", ["A", "I"]), declaration("A", ["J"], "child.go")]
    },
    {
      name: "missing-vs-empty-path",
      declarations: [declaration("Root", ["A", "B"], "unused-root.go"), declaration("A"), declaration("B", [], "")]
    },
    {
      name: "included-cycle-path",
      declarations: [declaration("Root", ["A"]), declaration("A", [], "not-entered.go")],
      visited: ["A"]
    }
  ]
  for (const item of pathCases) {
    const file = {
      kindAware: false,
      declarations: new Map(item.declarations.map((d) => [d.artifact.name, d])),
      imports: new Map([
        ["I", { path: "./i", name: "I" }],
        ["J", { path: "./j", name: "J" }]
      ])
    }
    const budget = () => ({
      limits: { ...GRAPH_LIMIT_CEILINGS, work: 128, depth: 4, outgoingEdges: 2 },
      targetsByPath: new Map(),
      maxTargetsInFile: 0,
      work: 0,
      graphWork: 0,
      maxDepth: 0
    })
    const actual = candidate(file, "Root", undefined, new Set(item.visited ?? []), budget(), 0)
    const paths = new Map(actual.state.targets)
    assert.ok(paths.has("a.ts"), item.name + " supplied root path")
    assert.ok(!paths.has("unused-root.go") && !paths.has("root-metadata.go"))
    if (item.name === "included-cycle-path") {
      assert.ok(!paths.has("not-entered.go"))
      assert.deepEqual(
        paths.get("a.ts"),
        ["A"],
        "only the reference target is charged; the visited callee path is not entered"
      )
      assert.deepEqual(actual.node.references, [{ kind: "included", site: { symbol: "A" }, target: "A" }])
    }
    if (item.name === "missing-vs-empty-path") assert.ok(paths.has(""))
    cases++
  }
  const record = {
    passed: true,
    cases,
    sourcePathCases: pathCases.length,
    independentSpecification: "recursive Bend traversal/SPEC and RELATION",
    finiteFalsificationCoveredLaws: [
      "whole_local_graph_exact",
      "production_traversal_completes",
      "recursive_specification_completes"
    ],
    proofStatus: "finite emitted specification check; proof owners qualify universal laws separately",
    scope:
      "complete emitted Bend driver versus independent recursive Bend specification: full tree, ordered pending addresses, visited and targets/work/depth;240 structured cases+12 NUL-collision/type-root cases+200 deterministic random graphs with two stateful invocations each, optional tentative visited discard; finite emitted correspondence on stable catalogs; this runner does not qualify universal proofs or whole acceptance"
  }
  const evidence = resolve(_root, ".test-runs/bend-migration/local-specification.json")
  mkdirSync(dirname(evidence), { recursive: true })
  writeFileSync(evidence, JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
