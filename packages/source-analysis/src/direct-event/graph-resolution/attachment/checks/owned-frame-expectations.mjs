import assert from "node:assert/strict"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"

// Fixed authored frame obligations over the existing production ABI. This is
// wire decoding, not forest reconstruction, target discovery or Graph policy.
const local = (name, fields = {}) => ({ $: "traversal/core." + name, ...fields })
const some = (value) => ({ $: "Some", value })
const entries = (map) => {
  if (map.$ === "MTip") return []
  if (map.$ === "MLeaf") return [[map.key, map.val]]
  assert.ok(map.lo && map.hi, "encoded map branch")
  return [...entries(map.lo), ...entries(map.hi)]
}
const numericEntries = (map) => entries(map).sort(([a], [b]) => Number(a) - Number(b))
const pending = (owner, index, from, symbol, path, depth) =>
  local("Pending", {
    owner,
    index,
    from,
    symbol,
    name: symbol,
    depth,
    expected: local("AnyKind"),
    target: local("Imported", { path, name: symbol })
  })
const target = (path, name, edge) => ({ $: "Types.FileTarget", path, name, edge })
const node = (id, artifact) => local("PlannedNode", { node: id, artifact })

export function assertOwnedAttachmentFrame(name, terminal, transcript) {
  if (name !== "rollback-pending-owner" && name !== "large-import-diamond-cycle") return
  assert.equal(terminal.$, "Types.FinishedResolver")
  assert.equal(terminal.final_frame.$, "Some")
  const frame = terminal.final_frame.value
  assert.equal(frame.root, 0)
  const requests = transcript.filter((entry) => entry.request).map((entry) => entry.request)
  assert.equal(requests.length, name === "rollback-pending-owner" ? 27 : 228)
  assert.equal(transcript.length, requests.length * 2)
  for (let id = 0; id < requests.length; id++) {
    const request = transcript[id * 2].request,
      reply = transcript[id * 2 + 1].reply
    assert.equal(request.id, id, "ordinary request successor")
    assert.equal(reply.id, id, "accepted reply correlation")
    assert.equal(reply.invocation, request.invocation)
  }
  if (name === "rollback-pending-owner") {
    const a = pending(0, 0, "root.ts", "A", "./a", 0)
    const b = pending(1, 0, "a.ts", "B", "./b", 1)
    assert.deepEqual(unlist(frame.nodes), [node(0, 0), node(1, 1)], "detached pending owner survives rollback")
    assert.deepEqual(unlist(frame.references), [
      local("ReferenceSlot", {
        owner: 0,
        index: 0,
        symbol: "A",
        reference: local("Omitted", { reason: local("ReferenceLimit"), target_name: "A" })
      }),
      local("ReferenceSlot", {
        owner: 1,
        index: 0,
        symbol: "B",
        reference: local("Omitted", { reason: local("Unavailable"), target_name: "B" })
      })
    ])
    assert.deepEqual(
      numericEntries(frame.pending),
      [
        ["1", some(a)],
        ["2", some(b)]
      ],
      "ordered original owners/payloads"
    )
    assert.deepEqual(numericEntries(frame.target_paths), [["2", some(target("a.ts", "A", a))]])
    assert.deepEqual(entries(frame.target_ids), [
      ["a.ts\0type\0A", some(2)],
      ["root.ts\0type\0Root", some(1)]
    ])
    assert.deepEqual(
      numericEntries(frame.target_artifacts),
      [["1", some("root.ts:interface:Root")]],
      "refused artifact never published"
    )
    assert.deepEqual([frame.next_node, frame.next_edge, frame.next_target], [2, 3, 3])
    assert.deepEqual(entries(frame.visited), [["root.ts:interface:Root", true]], "refused A is not visited")
    assert.deepEqual(
      entries(frame.captured).map(([path]) => path),
      ["root.ts"],
      "tentative A capture is not published"
    )
    const rootCapture = entries(frame.captured)[0][1]
    assert.equal(rootCapture.$, "Some")
    assert.equal(rootCapture.value.source_bytes, 60)
    const budget = frame.budget
    assert.deepEqual([budget.max_targets, budget.work, budget.graph_work, budget.max_depth], [1, 0, 1, 2])
    assert.deepEqual(
      entries(budget.targets_by_path).map(([path, targets]) => [path, entries(targets)]),
      [
        ["a.ts", [["a.ts\0./b\0B", true]]],
        ["root.ts", [["root.ts\0./a\0A", true]]]
      ],
      "retained local work accounting includes detached owner"
    )
    assert.deepEqual(unlist(frame.graph.visited), [2, 1], "attempted target remains charged")
    assert.deepEqual(
      [frame.graph.files, frame.graph.read_bytes, frame.graph.tree_bytes, frame.graph.work],
      [2, 2130, 372, 1]
    )
    assert.equal(frame.graph.phase.$.split(".").at(-1), "Incomplete")
    assert.equal(frame.graph.phase.reason.$.split(".").at(-1), "TreeLimit")
    assert.deepEqual(
      [frame.graph.skipped_tree, frame.graph.skipped_excluded, frame.graph.skipped_other],
      [true, false, false]
    )
    return
  }
  const roots = Array.from({ length: 6 }, (_, i) => pending(0, i, "root.ts", `A${i}`, `./a${i}`, 0))
  const shared = Array.from({ length: 6 }, (_, i) => pending(2 * i + 1, 1, `a${i}.ts`, "Shared", "./shared", 1))
  const back = pending(13, 0, "shared.ts", "Root", "./root", 2)
  assert.deepEqual(unlist(frame.nodes), [
    node(0, 0),
    ...Array.from({ length: 6 }, (_, i) => [node(2 * i + 1, 2 * i + 2), node(2 * i + 2, 2 * i + 1)]).flat(),
    node(13, 13)
  ])
  assert.deepEqual(
    numericEntries(frame.pending),
    [...roots, ...shared, back].map((edge, i) => [String(i + 1), some(edge)])
  )
  assert.deepEqual(
    numericEntries(frame.target_paths),
    [
      ["1", some(target("root.ts", "Root", back))],
      ...roots.map((edge, i) => [String(i + 2), some(target(`a${i}.ts`, `A${i}`, edge))]),
      ["8", some(target("shared.ts", "Shared", shared[5]))]
    ],
    "target allocation order and final duplicate-target owner identity"
  )
  assert.deepEqual(entries(frame.target_ids), [
    ...roots.map((_, i) => [`a${i}.ts\0type\0A${i}`, some(i + 2)]),
    ["root.ts\0type\0Root", some(1)],
    ["shared.ts\0type\0Shared", some(8)]
  ])
  assert.deepEqual(numericEntries(frame.target_artifacts), [
    ["1", some("root.ts:interface:Root")],
    ...roots.map((_, i) => [String(i + 2), some(`a${i}.ts:interface:A${i}`)]),
    ["8", some("shared.ts:interface:Shared")]
  ])
  assert.deepEqual([frame.next_node, frame.next_edge, frame.next_target], [14, 14, 9])
}
