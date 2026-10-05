import { expect, it } from "vitest"
import Engine, { type EngineState } from "../../monkey-business-bend/engine.mjs"

const nil = { $: "Nil" }
const scope = { partition: 1, lifetime: 1, round: 1 }
const preparingGraph = (): EngineState => {
  let state = Engine.initial({
    $: "Ledger.Limits",
    global_items: 32,
    global_bytes: 10000,
    partition_items: 16,
    partition_bytes: 5000
  })
  for (const event of [
    { $: "Canonical.OpenRound", partition: 1, lifetime: 1 },
    { $: "Canonical.BeginPreparation", ...scope, bytes: 10 }
  ]) {
    const transition = Engine.step(state, event)
    expect(transition.result).toMatchObject({ $: "Canonical.Advanced" })
    state = transition.state
  }
  const transition = Engine.graph_step(
    state,
    { $: "Types.GraphKey", ...scope, operation: 1, unit: 0 },
    0n,
    {
      $: "ImportGraph.Limits",
      version: 1,
      source_bytes: 20,
      tree_bytes: 32,
      files: 2,
      read_bytes: 40,
      outgoing_edges: 1,
      depth: 2,
      work: 32
    },
    { $: "ImportGraph.Root", target: 1, source_bytes: 10, tree_bytes: 4, local_work: 0, edges: nil }
  )
  expect(transition.$).toBe("Types.GraphTransition")
  expect(transition.state.graphs).toMatchObject({ $: "Con" })
  return transition.state
}

it("preserves a preparation graph under wrong-tuple rejected callbacks and another scope's accepted transition", () => {
  const state = preparingGraph()
  for (const field of ["partition", "lifetime", "round", "operation"] as const) {
    const event = { $: "Canonical.PreparationCompleted", ...scope, operation: 1, unit_bytes: nil, [field]: 2 }
    const transition = Engine.step(state, event)
    expect(transition.result).toMatchObject({ $: "Canonical.Rejected" })
    expect(transition.state.graphs).toEqual(state.graphs)
    expect(Engine.preparation_active(transition.state, 1n, 1n, 1n, 1n)).toBe(true)
  }
  expect(Engine.preparation_active(state, 2n, 1n, 1n, 1n)).toBe(false)
  const other = Engine.step(state, { $: "Canonical.OpenRound", partition: 2, lifetime: 1 })
  expect(other.result).toMatchObject({ $: "Canonical.Advanced" })
  expect(other.state.graphs).toEqual(state.graphs)
})

it("releases graph facts only when accepted production transitions end their exact preparing ownership", () => {
  for (const event of [
    { $: "Canonical.PreparationCompleted", ...scope, operation: 1, unit_bytes: { $: "Con", head: 5, tail: nil } },
    { $: "Canonical.RetirePartition", ...scope }
  ]) {
    const transition = Engine.step(preparingGraph(), event)
    expect(transition.result).toMatchObject({ $: "Canonical.Advanced" })
    expect(transition.state.graphs).toEqual(nil)
    expect(Engine.preparation_active(transition.state, 1n, 1n, 1n, 1n)).toBe(false)
  }
})
