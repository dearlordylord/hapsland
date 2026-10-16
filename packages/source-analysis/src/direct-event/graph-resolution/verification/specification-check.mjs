import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { sourceFacts } from "../frontend-codec.ts"
import { list, unlist, binary64, fromProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"

const folder = import.meta.dirname,
  root = join(folder, "../../../../../..")
const temporary = mkdtempSync(join(tmpdir(), "hapsland-whole-specification-"))
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const inputs = [
  "../ForestSpecification.bend",
  "../SPEC.bend",
  "../Environment.bend",
  "../WholeObservation.bend",
  "../Types.bend",
  "./specification-check.mjs",
  "../frontend-codec.ts"
]
const sources = Object.fromEntries(inputs.map((path) => [path, hash(join(folder, path))]))
const tag = (module, name, fields = {}) => ({
  $: module === "Environment" || module === "WholeObservation" ? name : `${module}.${name}`,
  ...fields
})
const label = (value) => value.$.slice(value.$.lastIndexOf(".") + 1)
const maybe = (value) => (value === undefined ? { $: "None" } : { $: "Some", value })
try {
  async function compile(name) {
    const path = join(temporary, name + ".mjs")
    execFileSync("bend", [join(folder, "..", name + ".bend"), "-o", path], { timeout: 10000 })
    return (await import(pathToFileURL(path))).default
  }
  const spec = await compile("SPEC"),
    environment = await compile("Environment"),
    observation = await compile("WholeObservation"),
    forest = await compile("ForestSpecification")
  // One authored local edge supplies the forest guards. Native parsing provides
  // declaration metadata only; no native graph preparation or traversal runs.
  const path = "root.ts",
    text = "interface A {} export interface Root { a: A }"
  const facts = languageForPath(path).inspect(path, text)
  assert.ok(facts)
  const prepared = spec.source(sourceFacts(facts), 0)
  const limits = tag("../../../../agent-flow-bend/ImportGraph", "Limits", {
    version: 1,
    ...Object.fromEntries(
      Object.entries(GRAPH_LIMIT_CEILINGS).map(([key, value]) => [
        {
          sourceBytes: "source_bytes",
          treeBytes: "tree_bytes",
          readBytes: "read_bytes",
          outgoingEdges: "outgoing_edges"
        }[key] ?? key,
        value
      ])
    )
  })
  const result = spec.root(10000, prepared, path, "Root", tag("Types", "TypeBranch"), limits)
  assert.equal(label(result), "RootBuilt")
  const created = forest.construct(10000, result.tree, 1, list([]), result.source.artifacts)
  assert.equal(label(created), "Constructed")
  const semantic = { $: "Forest", root: maybe(created.created.root), nodes: created.created.nodes }
  const materialized = forest.unit(10000, semantic, list([]))
  assert.equal(label(materialized), "Materialized")
  assert.deepEqual(fromProductValue(materialized.product), {
    root: {
      artifact: facts.declarations.get("Root").artifact,
      references: [
        {
          kind: "expanded",
          site: { symbol: "A" },
          node: { artifact: facts.declarations.get("A").artifact, references: [] }
        }
      ]
    },
    sourceDependencies: []
  })
  assert.equal(unlist(result.state.pending_rev).length, 0)
  let forestGuardCases = 0
  const rootNode = unlist(semantic.nodes)[0],
    symbol = { $: "ReferenceSymbol", text: "\0\ud800" },
    identity = { $: "ArtifactIdentity", text: rootNode.artifact.id }
  const included = { $: "Included", symbol, identity }
  const typedReplacement = forest.replace(semantic, rootNode.address, 0, included)
  assert.equal(label(typedReplacement), "Replaced")
  forestGuardCases++
  const typedProduct = fromProductValue(forest.unit(10000, typedReplacement.forest, list([])).product)
  assert.equal(typedProduct.root.references[0].site.symbol, "\0\ud800")
  assert.equal(typedProduct.root.references[0].target, rootNode.artifact.id)
  forestGuardCases++
  const empty = forest.replace(semantic, rootNode.address, 0, {
    $: "Omitted",
    symbol: { $: "ReferenceSymbol", text: "" },
    target: { $: "ReferenceSymbol", text: "" },
    reason: { $: "traversal/core.Unavailable" }
  })
  assert.equal(label(empty), "Replaced")
  assert.equal(
    fromProductValue(forest.unit(10000, empty.forest, list([])).product).root.references[0].target.symbol,
    ""
  )
  forestGuardCases++
  const missing = { $: "WholeObservation.NodeAddress", episode: 999999, route: list([]) }
  assert.equal(
    label(forest.replace(semantic, rootNode.address, 0, { $: "Expanded", symbol, child: missing })),
    "ReplacementInvalid"
  )
  forestGuardCases++
  assert.equal(
    label(forest.replace(semantic, rootNode.address, 0, { $: "Expanded", symbol, child: rootNode.address })),
    "ReplacementInvalid"
  )
  forestGuardCases++
  const duplicate = {
    $: "Forest",
    root: semantic.root,
    nodes: list([...unlist(semantic.nodes), { ...rootNode, references: list([]) }])
  }
  assert.equal(label(forest.replace(duplicate, rootNode.address, 0, included)), "ReplacementInvalid")
  forestGuardCases++
  const later = forest.construct(10000, result.tree, 2, list([]), result.source.artifacts)
  assert.equal(label(later), "Constructed")
  const retained = forest.append(semantic, later.created)
  const attached = forest.replace(retained, rootNode.address, 0, { $: "Expanded", symbol, child: later.created.root })
  assert.equal(label(attached), "Replaced")
  forestGuardCases++
  assert.equal(
    label(forest.replace(retained, later.created.root, 0, { $: "Expanded", symbol, child: rootNode.address })),
    "ReplacementInvalid"
  )
  forestGuardCases++
  const rolledBack = forest.replace(attached.forest, rootNode.address, 0, included)
  assert.equal(label(rolledBack), "Replaced")
  assert.deepEqual(
    rolledBack.forest.nodes.tail,
    retained.nodes.tail,
    "rollback retains all child nodes and their birth addresses"
  )
  forestGuardCases++
  const duplicateChild = {
    $: "Forest",
    root: retained.root,
    nodes: list([...unlist(retained.nodes), unlist(later.created.nodes)[0]])
  }
  assert.equal(
    label(forest.replace(duplicateChild, rootNode.address, 0, { $: "Expanded", symbol, child: later.created.root })),
    "ReplacementInvalid"
  )
  forestGuardCases++
  assert.equal(label(forest.construct(0, result.tree, 1, list([]), result.source.artifacts)), "ConstructionExhausted")
  assert.equal(label(forest.unit(0, semantic, list([]))), "MaterializationExhausted")
  forestGuardCases++
  // Arbitrary independent operation order changes the world through a responder;
  // no expected request script is supplied to Environment.step.
  const initial = () => tag("Environment", "WorldState", { world: 0, effects: list([]) })
  const respond = (operation) => (world) =>
    tag("Environment", "Returned", {
      world: world + 1,
      outcome: tag("Types", "ClockRead", {
        bits: binary64(Number(world) + (label(operation) === "ReadClock" ? 100 : 200))
      }),
      effects: list([])
    })
  const request = (id, operation) => tag("Types", "Request", { invocation: 7, id, operation })
  const first = environment.step(
    respond,
    request(1, tag("Types", "ReadClock", { clock: tag("Types", "ClockToken", { invocation: 7, id: 9 }) })),
    initial()
  )
  const reordered = environment.step(respond, request(1, tag("Types", "StartClock")), initial())
  assert.equal(first.state.world, 1)
  assert.notDeepEqual(first.reply.outcome, reordered.reply.outcome)
  const second = environment.step(respond, request(2, tag("Types", "StartClock")), first.state)
  assert.equal(second.state.world, 2)
  assert.equal(unlist(second.state.effects).length, 4)
  const lease = (id, invocation = 7) => ({ $: "WholeObservation.ProviderLease", invocation, id })
  const nested = { $: "WholeObservation.ProviderEffect", value: { $: "WholeObservation.Null" } }
  const suspended = environment.step(
    (_operation) => (world) =>
      tag("Environment", "Suspended", { world: world + 1, lease: lease(42), effects: list([nested]) }),
    request(3, tag("Types", "StartClock")),
    initial()
  )
  assert.equal(label(suspended), "Waiting")
  assert.equal(unlist(suspended.state.effects).length, 2)
  const providerOutcome = tag("Types", "ClockStarted", {
    clock: tag("Types", "ClockToken", { invocation: 999, id: 1 })
  })
  for (const foreignLease of [lease(999), lease(42, 999)])
    assert.deepEqual(
      environment.complete(
        suspended,
        tag("Environment", "Completion", {
          lease: foreignLease,
          world: 8,
          outcome: providerOutcome,
          effects: list([nested])
        })
      ),
      suspended,
      "foreign lease cannot complete this wait"
    )
  const completed = environment.complete(
    suspended,
    tag("Environment", "Completion", { lease: lease(42), world: 8, outcome: providerOutcome, effects: list([nested]) })
  )
  assert.equal(completed.state.world, 8)
  assert.deepEqual(unlist(completed.state.effects).map(label), [
    "Invoked",
    "ProviderEffect",
    "ProviderEffect",
    "Responded"
  ])
  assert.equal(completed.reply.outcome.clock.invocation, 999, "ownership is not assumed by environment stamping")
  assert.deepEqual(
    environment.complete(
      completed,
      tag("Environment", "Completion", {
        lease: lease(42),
        world: 99,
        outcome: tag("Types", "ProductEncoded", { bytes: 0 }),
        effects: list([])
      })
    ),
    completed,
    "completed provider is not reinvoked"
  )
  assert.equal(
    observation.valid_text(tag("WholeObservation", "Text", { units: list([0, 0xd800, 0xdc00, 0xffff]) })),
    true
  )
  assert.equal(observation.valid_text(tag("WholeObservation", "Text", { units: list([0x10000]) })), false)
  const inspection = tag("WholeObservation", "ExceptionalUnpublishedState")
  for (const origin of [
    "InternalEvaluationBound",
    "InternalSettleBound",
    "InternalInvariant",
    "InternalRuntimeShape",
    "OriginalProvider",
    "OriginalBoundary",
    "ExternalProtocol"
  ]) {
    const error = tag("WholeObservation", "Error", {
      identity: maybe(1),
      name: tag("WholeObservation", "Text", { units: list([]) }),
      message: tag("WholeObservation", "Text", { units: list([]) }),
      cause: maybe(),
      detail: maybe()
    })
    const progress = tag("WholeObservation", "Finished", {
      terminal: tag("WholeObservation", "TechnicalError", { origin: tag("WholeObservation", origin), error }),
      inspection
    })
    assert.equal(observation.completes(progress), !origin.startsWith("Internal"), origin)
  }
  assert.equal(observation.completes(tag("WholeObservation", "EvaluationExhausted", { inspection })), false)
  assert.equal(
    observation.completes(
      tag("WholeObservation", "Waiting", {
        request: request(1, tag("Types", "StartClock")),
        lease: tag("WholeObservation", "ProviderLease", { invocation: 7, id: 1 }),
        inspection
      })
    ),
    false
  )
  assert.deepEqual(
    Object.fromEntries(inputs.map((path) => [path, hash(join(folder, path))])),
    sources,
    "sources frozen during checks"
  )
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    sources,
    passed: true,
    cases: forestGuardCases + 9,
    independentCaseGroups: [
      "local-tree",
      "operation-order",
      "provider-suspension",
      "foreign-lease",
      "provider-completion",
      "completed-idempotence",
      "text-domain",
      "terminal-origin",
      "bounded-progress"
    ],
    authoredLocalTreeCases: 1,
    forestGuardCases,
    nominalReferenceDomainsPreserveEmptyNulAndLoneSurrogates: true,

    statefulOperationSelectedEnvironment: true,
    waitingSeparateAndCompletionDoesNotReinvoke: true,
    wrongTokenOwnershipNotAssumed: true,
    nestedProviderEffectsOrdered: true,
    foreignInvocationLeaseIgnored: true,
    textCodeUnitDomainChecked: true,
    implementationBoundFailuresCannotCountAsCompletion: true,
    scope:
      "One authored local tree plus independent forest slot/retention guards, stateful Environment operation order, suspended-provider effects/ownership and WholeObservation text/completion classification. Native parser metadata is shared; no native graph oracle or whole production correspondence, termination, cancellation or performance claim."
  }
  mkdirSync(join(root, ".test-runs"), { recursive: true })
  writeFileSync(
    join(root, ".test-runs", "specification-" + record.runtime + "-evidence.json"),
    JSON.stringify(record, null, 2) + "\n"
  )
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
