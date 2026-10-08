import { expect, it } from "vitest"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-adapter"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type Run, type RunInput } from "./index.ts"

// These source spellings are the public generated fixture contract: revision
// one/two share fixture zero, independent of the internal identity allocator.
const seed = 7
const profile = DEFAULT_FILE_TREE_PROFILE
const limits = GRAPH_LIMIT_CEILINGS
const preparedIdentity = JSON.stringify({
  fixture: 0,
  unit: 0,
  prepared: { bytes: 5, rules: "synthetic-noul", tree: { fixture: 0, seed, profile, limits } }
})
const revisionInput = JSON.stringify({ fixture: 0, bytes: 10, unitBytes: [5], seed, profile, limits })
const explicit = (agent = "a", input = preparedIdentity): RunInput => ({
  kind: "edit",
  at: 13,
  agent,
  bytes: 10,
  unitBytes: [5],
  evaluationInputs: [input],
  evaluationTreeIdentity: 1,
  evaluationTreeProfile: profile,
  evaluationGraphLimits: limits,
  revisionSubject: "generated-root",
  revisionInput
})
const config = (agents = ["a"], inputs: RunInput[] = []) => ({
  seed,
  inputs,
  fileTrees: profile,
  graphLimits: limits,
  preparationDelay: 2,
  jevDelay: 30,
  outcome: "clear" as const,
  sessions: agents.map((agent) => ({
    agent,
    seed: 11,
    editIntervalMs: 10,
    variationMs: 0,
    editsPerTask: 1000,
    bytes: 10,
    unitBytes: [5]
  })),
  lifecycles: { reuse: { entryLimit: 8, byteLimit: 128000 } }
})
const routes = (run: Run) =>
  run.observations.flatMap(({ event, partition }) => (event.kind === "reuseRoute" ? [{ partition, id: event.id }] : []))
const requests = (run: Run) => run.observations.filter(({ event }) => event.kind === "jevRequestStarted")
const replay = (run: Run) =>
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())

it("an exact explicit generated label registered before execution joins its generated fixture", () => {
  const run = createRun(config(["a"], [explicit()]))
  run.advance({ untilTime: 15, maxEvents: 500 })
  const selected = routes(run)
  expect(selected).toHaveLength(2)
  expect(selected[0]!.id).toBe(selected[1]!.id)
  expect(requests(run)).toHaveLength(1)
  expect(run.observations.some(({ outputs }) => outputs.some(({ kind }) => kind === "reusePendingJoined"))).toBe(true)
  replay(run)
})

it("an exact explicit label supplied after generated execution retains the generated identity", () => {
  const run = createRun(config())
  run.advance({ untilTime: 12, maxEvents: 500 })
  expect(requests(run)).toHaveLength(1)
  run.schedule(explicit())
  run.advance({ untilTime: 15, maxEvents: 500 })
  const selected = routes(run)
  expect(selected).toHaveLength(2)
  expect(selected[0]!.id).toBe(selected[1]!.id)
  expect(requests(run)).toHaveLength(1)
  replay(run)
})

it("equal generated source spellings have distinct unit identities in distinct partitions", () => {
  const run = createRun(config(["a", "b"], [explicit("a"), explicit("b")]))
  run.advance({ untilTime: 15, maxEvents: 1000 })
  const selected = routes(run)
  expect(selected).toHaveLength(4)
  const firstIdentities = selected.slice(0, 2).map(({ id }) => id)
  expect(new Set(firstIdentities).size).toBe(2)
  for (const id of firstIdentities) expect(selected.filter((route) => route.id === id)).toHaveLength(2)
  expect(
    requests(run)
      .map(({ event }) => (event.kind === "jevRequestStarted" ? event.partition : undefined))
      .sort()
  ).toEqual([1, 2])
  expect(requests(run)).toHaveLength(2)
  replay(run)
})

it("a differently spelled opaque label remains distinct despite equivalent parsed JSON", () => {
  const spaced = JSON.stringify(JSON.parse(preparedIdentity), null, 2)
  expect(JSON.parse(spaced)).toEqual(JSON.parse(preparedIdentity))
  const run = createRun(config(["a"], [explicit("a", spaced)]))
  run.advance({ untilTime: 15, maxEvents: 500 })
  const selected = routes(run)
  expect(selected).toHaveLength(2)
  expect(selected[0]!.id).not.toBe(selected[1]!.id)
  expect(requests(run)).toHaveLength(2)
  replay(run)
})
