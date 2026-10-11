import assert from "node:assert/strict"
import { writeFileSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import p from "/tmp/hapsland-retained-forest-projection.mjs"
import c from "/tmp/hapsland-construction-address-relation.mjs"
import m from "/tmp/hapsland-retained-materialization-probe.mjs"
import a from "/tmp/hapsland-attachment-projection-probe.mjs"
const fp = "../whole-resolver/ForestSpecification.",
  tp = "../whole-resolver/Types.",
  sp = "../local-graph-draft/SPEC.",
  cp = "./traversal/core."
const list = (xs) => xs.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const arr = (xs) => (xs.$ === "Nil" ? [] : [xs.head, ...arr(xs.tail)])
const artifact = {
  $: tp + "Artifact",
  origin: { $: "None" },
  path: { $: "None" },
  id: "",
  kind: { $: tp + "FunctionArtifact" },
  name: "",
  source: "",
  source_hash: "",
  order: list(
    ["ArtifactIdKey", "ArtifactKindKey", "ArtifactNameKey", "ArtifactSourceKey", "ArtifactHashKey"].map((k) => ({
      $: tp + k
    }))
  )
}
const artifacts = list([{ $: tp + "ArtifactEntry", handle: 0n, value: artifact }])
let cases = 0,
  negative = 0,
  detached = 0,
  products = 0,
  attachments = 0,
  refusals = 0
for (let seed = 0; seed < 128; seed++)
  for (const episode of [1n, 3n]) {
    let next = 0n
    const tree = (s, d) => ({
      $: sp + "Tree",
      address: next++,
      artifact: 0n,
      references: list(
        Array.from({ length: d < 3 ? s % 4 : 0 }, (_, i) => ({
          $: sp + "TreeReference",
          symbol: ["", "\0", "\ud800"][i % 3],
          outcome:
            (s + i) % 3 === 0
              ? { $: sp + "Included", identity: "" }
              : (s + i) % 3 === 1
                ? { $: sp + "Omitted", reason: { $: cp + "Unresolved" }, target: "" }
                : { $: sp + "Expanded", tree: tree((s * 3 + i + 1) % 29, d + 1) }
        }))
      )
    })
    const t = tree(seed, 0),
      made = c[fp + "construct"](200n, t, episode, list([]), artifacts),
      flat = c[sp + "flatten"](200n, { $: sp + "FlattenTree", tree: t })
    assert.equal(made.$, fp + "Constructed")
    assert.equal(flat.$, sp + "Flat")
    const run = (nodes = flat.nodes, slots = flat.slots, catalog = artifacts, addresses = made.created.addresses) =>
      p.project(0n, nodes, slots, catalog, addresses)
    assert.deepEqual(run(), {
      $: "Some",
      value: { $: fp + "Forest", root: { $: "Some", value: made.created.root }, nodes: made.created.nodes }
    })
    cases++
    const checkProduct = (projected, slots) => {
      for (const deps of [[], ["", "\0", "\ud800"]]) {
        const actual = m.actual(0n, flat.nodes, slots, artifacts, list(deps)),
          expected = m.expected(200n, projected.value, list(deps))
        assert.equal(actual.$, "Some")
        assert.equal(expected.$, fp + "Materialized")
        assert.deepEqual(actual.value, expected.product)
        products++
      }
    }
    checkProduct(run(), flat.slots)

    const op = "../whole-resolver/WholeObservation."
    const parentBirth = { $: op + "NodeAddress", episode: 0n, route: list([]) }
    const parentNodes = list([{ $: cp + "PlannedNode", node: 0n, artifact: 0n }])
    const parentSlots = list([
      {
        $: cp + "ReferenceSlot",
        owner: 0n,
        index: 0n,
        symbol: "slot",
        reference: { $: cp + "Omitted", reason: { $: cp + "Unresolved" }, target_name: "target" }
      }
    ])
    const parentAddresses = list([{ $: fp + "AddressEntry", local: 0n, address: parentBirth }])
    const parentForest = p.project(0n, parentNodes, parentSlots, artifacts, parentAddresses).value
    const addresses = a["AttachmentMapping.extended"](parentAddresses, 1n, made.created)
    const pending = [...Array(3)].map((_, i) => ({
      $: cp + "Pending",
      owner: 0n,
      index: BigInt(i),
      from: "source",
      symbol: "slot" + i,
      name: "target" + i,
      depth: 1n,
      expected: { $: cp + "TypeKind" },
      target: { $: cp + "Imported", path: "child", name: "target" + i }
    }))
    for (const included of [false, true]) {
      const result = a.attach(
        0n,
        flat.nodes,
        flat.slots,
        1n,
        parentNodes,
        parentSlots,
        0n,
        0n,
        included ? { $: "Some", value: "identity" } : { $: "None" },
        list(pending),
        7n
      )
      assert.equal(result.$, "Some")
      const attached = result.value
      assert.equal(attached.next_edge, 10n)
      assert.deepEqual(arr(attached.pending_ids), [7n, 8n, 9n])
      for (let i = 0; i < 3; i++)
        assert.deepEqual(a.pending_at(attached, BigInt(7 + i)), { $: "Some", value: { ...pending[i], owner: 1n } })
      const ref = included
        ? {
            $: fp + "Included",
            symbol: { $: fp + "ReferenceSymbol", text: "slot" },
            identity: { $: fp + "ArtifactIdentity", text: "identity" }
          }
        : { $: fp + "Expanded", symbol: { $: fp + "ReferenceSymbol", text: "slot" }, child: made.created.root }
      const expected = a[fp + "replace"](a[fp + "append"](parentForest, made.created), parentBirth, 0n, ref)
      assert.equal(expected.$, fp + "Replaced")
      const observed = p.project(0n, attached.nodes, attached.references, artifacts, addresses)
      assert.equal(observed.$, "Some")
      assert.deepEqual(observed.value, expected.forest)
      attachments++
      const actualProduct = m.actual(0n, attached.nodes, attached.references, artifacts, list([]))
      const referenceProduct = m.expected(200n, expected.forest, list([]))
      assert.equal(actualProduct.$, "Some")
      assert.deepEqual(actualProduct.value, referenceProduct.product)
      const refused = a["../whole-resolver/Composition.refuse_attachment"](attached, 0n, 0n, "target")
      assert.equal(refused.$, "Some")
      assert.equal(refused.value.next_node, attached.next_node)
      assert.deepEqual(refused.value.pending, attached.pending)
      const rollback = a[fp + "replace"](expected.forest, parentBirth, 0n, {
        $: fp + "Omitted",
        symbol: { $: fp + "ReferenceSymbol", text: "slot" },
        target: { $: fp + "ReferenceSymbol", text: "target" },
        reason: { $: cp + "ReferenceLimit" }
      })
      assert.equal(rollback.$, fp + "Replaced")
      const retained = p.project(0n, refused.value.nodes, refused.value.references, artifacts, addresses)
      assert.equal(retained.$, "Some")
      assert.deepEqual(retained.value, rollback.forest)
      refusals++
    }
    for (const result of [
      run(flat.nodes, flat.slots, list([...arr(artifacts), ...arr(artifacts)])),
      run(flat.nodes, flat.slots, artifacts, made.created.addresses.tail),
      run(list([...arr(flat.nodes), arr(flat.nodes)[0]])),
      run(
        flat.nodes,
        list([
          ...arr(flat.slots),
          {
            $: cp + "ReferenceSlot",
            owner: 999n,
            index: 0n,
            symbol: "",
            reference: { $: cp + "Included", identity: "" }
          }
        ])
      )
    ]) {
      assert.equal(result.$, "None")
      negative++
    }
    if (flat.slots.$ === "Con") {
      const bad = { ...flat.slots, head: { ...flat.slots.head, index: 99n } }
      assert.equal(run(flat.nodes, bad).$, "None")
      negative++
    }
    if (arr(flat.nodes).length > 1) {
      const refs = arr(flat.slots).map((s) =>
        s.reference.$ === cp + "Expanded"
          ? { ...s, reference: { $: cp + "Omitted", reason: { $: cp + "Unresolved" }, target_name: s.symbol } }
          : s
      )
      const projected = run(flat.nodes, list(refs))
      assert.equal(projected.$, "Some")
      assert.equal(arr(projected.value.nodes).length, arr(flat.nodes).length)
      detached++
      checkProduct(projected, list(refs))
      assert.equal(run(list(arr(flat.nodes).reverse())).$, "None")
      negative++
    }
  }
const record = {
  cases,
  negative,
  detached,
  products,
  attachments,
  refusals,
  actualCompiledConstructAndFlatten: true,
  universalProof: false,
  sourceSha256: createHash("sha256")
    .update(
      readFileSync(
        "/workspace/typescript/hapsland-bend-selection-ui/packages/source-analysis/src/direct-event/graph-resolution/attachment/RetainedForestProjection.bend"
      )
    )
    .digest("hex"),
  scope:
    "Finite actual tentative attachment, Include/Expanded and retained rollback forest/products; three staged pending records and exact IDs per attachment; no reply/admission transaction proof or production adoption"
}
writeFileSync(
  "/workspace/typescript/hapsland-bend-selection-ui/evidence/bend-strangler/whole-entry-draft/attachment-projection-falsification.json",
  JSON.stringify(record, null, 2) + "\n"
)
console.log(JSON.stringify(record))
