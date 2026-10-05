import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"
import { agent, target, terminal } from "./collection-response.fixture.ts"
import { callbackPublicBoundary } from "./callback-native-codec.ts"
import { decodeNativePrefix } from "./callback-native-prefix.ts"
import { decodeWriterNativeBoundary } from "./writer-native-boundary.ts"
import { validateCollectionResponseControl, type CollectionResponseControl } from "./collection-scenario.ts"
import {
  runWorkloadNative,
  runWorkloadEmitted
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
import { readBendList, readRecord } from "../../../src/canonical/boundary-schema.ts"

const fixture = new URL(
  "../../monkey-business-bend/conformance/collection-response-original-scenarios.bend",
  import.meta.url
)
const failures = [undefined, "close", "expiry", "wrongScope", "revokedOptIn"] as const
const list = (values: readonly unknown[]): unknown =>
  values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
function frozenInput(mode: number) {
  const advance = (endpoint: number) => ({ $: "writer_original_inputs.Advance", endpoint, budget: 1000 })
  const intersection = (input: unknown) => ({ $: "writer_original_inputs.IntersectionControl", input })
  return {
    $: "writer_original_inputs.Scenario",
    configuration: {
      $: "sharing_original_inputs.Configuration",
      seed: 1,
      limits: {
        $: "Ledger.Limits",
        global_items: 32,
        global_bytes: 100000,
        partition_items: 16,
        partition_bytes: 50000
      },
      retention: 1000,
      sessions: list([]),
      tree: {
        $: "TreeFacts.Profile",
        min_files: 3,
        max_files: 8,
        max_imports: 3,
        max_depth: 3,
        denied_percent: 15,
        missing_percent: 0,
        unreadable_percent: 0,
        repeated_percent: 0,
        cyclic_percent: 0,
        unsupported_percent: 0,
        deadline_step: 0,
        local_work: 0,
        min_source: 512,
        max_source: 4096,
        min_tree: 256,
        max_tree: 2048
      },
      graph: {
        $: "ImportGraph.Limits",
        version: 1,
        source_bytes: 262144,
        tree_bytes: 20480,
        files: 8,
        read_bytes: 1572864,
        outgoing_edges: 16,
        depth: 4,
        work: 128
      },
      preparation_delay: 2,
      output_delay: 0,
      output_lease: 30000,
      reuse_entries: 0,
      reuse_bytes: 0,
      outcomes: {
        $: "Driver.OutcomeEnvironment",
        outcome: { $: "None" },
        weights: list([0, 1078525952, 1078525952, 0, 0, 0].map((high) => ({ $: "Numeric.Words", high, low: 0 })))
      }
    },
    edits: list([
      {
        $: "writer_original_inputs.Edit",
        agent,
        at: 0,
        bytes: 10,
        units: list([5]),
        outcome: { $: "Some", value: { $: "Canonical.RequestFinding" } }
      }
    ]),
    jev_delay: 5,
    boundaries: list([
      advance(0),
      intersection({
        $: "writer_intersection_controls.OpenResponse",
        agent,
        response: {
          $: "CollectionScenario.Response",
          partition: 1,
          lifetime: 1,
          round: 1,
          started: 0,
          deadline: mode === 2 ? 7 : 20,
          admitted_block: mode === 4
        }
      }),
      advance(6),
      advance(7),
      ...(mode === 1
        ? [intersection({ $: "writer_intersection_controls.CloseIssuedResponse", agent, open_index: 0 })]
        : []),
      intersection(
        mode === 3
          ? {
              $: "writer_intersection_controls.AttemptIssuedResponseScope",
              agent,
              open_index: 0,
              lifetime: 2,
              blocked: false
            }
          : { $: "writer_intersection_controls.AttemptIssuedResponse", agent, open_index: 0, blocked: false }
      ),
      advance(8)
    ])
  }
}
function publicCase(mode: number) {
  const failure = failures[mode]
  const run = createRun({
    retention: 1000,
    preparationDelay: 2,
    jevDelay: 5,
    inputs: [{ at: 0, kind: "edit", agent, bytes: 10, unitBytes: [5], outcome: "finding" }]
  })
  const controls: unknown[] = [],
    boundaries: unknown[] = []
  const queued = () => run.queuedFacts.map(({ at, order }) => ({ at, order }))
  const advance = (endpoint: number) => {
    const result = run.advance({ untilTime: endpoint, maxEvents: 1000 })
    expect(result.reason).not.toBe("eventLimit")
    boundaries.push({
      endpoint,
      budget: 1000,
      consumed: result.events,
      state: callbackPublicBoundary(run.observe(), [], []).endpoint,
      queued: queued()
    })
  }
  const apply = (value: CollectionResponseControl) => {
    const control = validateCollectionResponseControl(value),
      before = run.projection
    run.applyControl(control)
    controls.push({ time: run.now, control, before, after: run.projection })
  }
  advance(0)
  apply({
    kind: "collectionResponse",
    action: "open",
    agent,
    response: {
      partition: 1,
      lifetime: 1,
      round: 1,
      started: 0,
      deadline: failure === "expiry" ? 7 : 20,
      admittedBlock: failure === "revokedOptIn"
    }
  })
  advance(6)
  expect(run.projection.pendingFindings).toEqual([])
  expect(terminal(run)).toEqual([])
  advance(7)
  expect(run.projection.pendingFindings).toHaveLength(1)
  expect(terminal(run)).toEqual([])
  if (failure === "close") apply({ kind: "collectionResponse", action: "close", agent, target })
  apply({
    kind: "collectionResponse",
    action: "attempt",
    agent,
    target: failure === "wrongScope" ? { ...target, lifetime: 2 } : target,
    currentBlock: false
  })
  advance(8)
  expect(terminal(run)).toHaveLength(failure === undefined ? 1 : 0)
  if (failure === undefined) {
    expect(terminal(run)[0]).toMatchObject({ partition: 1, event: { certain: true } })
    expect(run.observations.filter((frame) => frame.event.kind === "collectionReserveLease")).toHaveLength(1)
  } else expect(run.projection.pendingFindings).toHaveLength(1)
  expect(run.projection.collection.leases).toEqual([])
  const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
  expect(restored.observe()).toEqual(run.observe())
  expect(restored.queuedFacts).toEqual(run.queuedFacts)
  return {
    ...callbackPublicBoundary(run.observe(), controls, []),
    reports: [],
    responseReports: run.observe().collectionResponseReports,
    boundaries,
    queued: queued(),
    eventCount: run.eventCount
  }
}
function compare(result: unknown) {
  const values = readBendList(decodeNativePrefix(result, "writer_scenarios"), readRecord, 5)
  expect(values).toHaveLength(5)
  values.forEach((value, mode) => {
    expect(value.input).toEqual(frozenInput(mode))
    expect(decodeWriterNativeBoundary(value)).toEqual(publicCase(mode))
  })
}
it.each([0, 1, 2, 3, 4])(
  "preserves original collection response %i public intermediate and replay assertions",
  (mode) => {
    publicCase(mode)
  }
)
it("compares all five original collection response emitted/public/replay boundaries", () => {
  compare(runWorkloadEmitted(fixture))
}, 30000)
// C90 + clang120 + execution5 + emitted15/5 + cleanup15 =250 seconds.
it("compares all five original collection response full native/emitted/public/replay boundaries", () => {
  const native = runWorkloadNative(fixture, { emissionTimeoutMs: 90000, clangTimeoutMs: 120000 })
  const emitted = runWorkloadEmitted(fixture)
  expect(native).toEqual(emitted)
  compare(native)
  compare(emitted)
}, 250000)
