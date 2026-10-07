import { expect, it } from "vitest"
import { readBendList, readRecord } from "@hapsland/canonical-policy/canonical/boundary-schema"
import {
  runWorkloadNative,
  runWorkloadEmitted
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
import { decodeNativePrefix } from "./callback-native-prefix.ts"
import {
  compareOriginalWaitingStopTrace,
  compareOriginalStopFamilyTrace,
  compareOriginalStopOutputFamilyTrace,
  compareStopBusiness
} from "./stop-native-boundary.ts"
import {
  originalWaitingStopPublic,
  originalStopPublicCases,
  originalStopOutputPublicCases
} from "./stop-original-public.fixture.ts"

import { createRun } from "./index.ts"

const bendList = (values: readonly unknown[]): unknown =>
  values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const none = { $: "None" }
// Independent original input declaration. No issued events or recorded public
// trace are supplied to the native fixture or used as its configuration.
function originalNativeInput() {
  return {
    $: "stop_original_inputs.Scenario",
    configuration: {
      $: "stop_original_inputs.Configuration",
      seed: 7,
      advicees: bendList([
        { $: "stop_original_inputs.Advicee", agent: "agent-1", identity: 1, agent_seed: 7, workload: none }
      ]),
      retention: 1000,
      limits: {
        $: "Ledger.Limits",
        global_items: 32,
        global_bytes: 100000,
        partition_items: 16,
        partition_bytes: 50000
      },
      tree: {
        $: "TreeFacts.Profile",
        min_files: 1,
        max_files: 1,
        max_imports: 0,
        max_depth: 3,
        denied_percent: 15,
        missing_percent: 0,
        unreadable_percent: 0,
        repeated_percent: 0,
        cyclic_percent: 0,
        unsupported_percent: 0,
        deadline_step: 0,
        local_work: 0,
        min_source: 100,
        max_source: 100,
        min_tree: 20,
        max_tree: 20
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
      jev_delay: 8,
      outcomes: {
        $: "Driver.OutcomeEnvironment",
        outcome: { $: "Some", value: { $: "Canonical.RequestClear" } },
        weights: bendList([0, 1078525952, 1078525952, 0, 0, 0].map((high) => ({ $: "Numeric.Words", high, low: 0 })))
      },
      finish_wait: 8,
      output: { $: "OutputScenario.Certain" },
      output_delay: 0,
      output_lease: 30000,
      candidate_bytes: none,
      collectors: none
    },
    inputs: bendList([
      { $: "stop_original_inputs.Edit", at: 0, agent: none, bytes: 10, units: bendList([5]), outcome: none },
      { $: "stop_original_inputs.Finish", at: 3, agent: none, recurring: false }
    ]),
    boundaries: bendList([3, 10, 20].map((endpoint) => ({ $: "stop_original_inputs.Advance", endpoint, budget: 100 })))
  }
}
function originalInput(value: unknown) {
  const envelopes = readBendList(value, readRecord, 1)
  if (envelopes.length !== 1) throw new Error("original Stop envelope count changed")
  const traces = readBendList(envelopes[0]?.traces, readRecord, 1)
  if (traces.length !== 1) throw new Error("original Stop scenario count changed")
  return traces[0]?.input
}

function compareWaiting(
  result: ReturnType<typeof runWorkloadEmitted>,
  expected: ReturnType<typeof originalWaitingStopPublic>
): void {
  const envelope = decodeNativePrefix(result, "stop_scenarios")
  expect(originalInput(envelope)).toEqual(originalNativeInput())
  compareOriginalWaitingStopTrace(envelope, expected)
}
const waitingFixture = new URL("../../monkey-business-bend/conformance/stop-original-waiting.bend", import.meta.url)
it("compares original waiting Stop emitted/public/replay boundaries", () => {
  const expected = originalWaitingStopPublic()
  compareWaiting(runWorkloadEmitted(waitingFixture), expected)
}, 30000)
// C45 + clang90 + native5 + JS15/5 + cleanup15 =175 seconds.
it("compares original waiting Stop full native/emitted/public/replay boundaries", () => {
  const expected = originalWaitingStopPublic()
  const native = runWorkloadNative(waitingFixture, { emissionTimeoutMs: 45000, clangTimeoutMs: 90000 }),
    emitted = runWorkloadEmitted(waitingFixture)
  expect(native).toEqual(emitted)
  for (const result of [native, emitted]) compareWaiting(result, expected)
}, 175000)

// Independently frozen native declarations for the original eleven cases.
// None describes an omitted edit override, independently of configured result.
function originalNativeFamilyInputs() {
  const some = (value: unknown) => ({ $: "Some", value })
  const edit = (at: number, agent: unknown = none, outcome: unknown = none) => ({
    $: "stop_original_inputs.Edit",
    at,
    agent,
    bytes: 10,
    units: bendList([5]),
    outcome
  })
  const finish = (at: number, agent: unknown = none, recurring = false) => ({
    $: "stop_original_inputs.Finish",
    at,
    agent,
    recurring
  })
  const advance = (endpoint: number, budget = 100) => ({ $: "stop_original_inputs.Advance", endpoint, budget })
  const profile = (seed: number, codes: readonly number[]) => ({
    $: "Workload.Profile",
    settings: {
      $: "Session.Settings",
      interval: 1000000,
      variation: 0,
      edits: 1000,
      pause: 500,
      response: 0,
      repairDelay: 300
    },
    seed,
    codes: bendList(codes),
    bytes: 100,
    units: bendList([100]),
    duration: none
  })
  const backgroundProfile = profile(7, [97, 103, 101, 110, 116, 45, 49])
  const base = originalNativeInput()
  const finding = some({ $: "Canonical.RequestFinding" }),
    clear = some({ $: "Canonical.RequestClear" })
  const configured = (changes: object) => ({ ...base.configuration, ...changes })
  const scenario = (
    configuration: typeof base.configuration,
    inputs: readonly unknown[],
    boundaries: readonly unknown[]
  ) => ({
    $: "stop_original_inputs.Scenario",
    configuration,
    inputs: bendList(inputs),
    boundaries: bendList(boundaries)
  })
  const backgroundConfiguration = (output: string, global: unknown = finding, finishWait = 10) =>
    configured({
      advicees: bendList([
        {
          $: "stop_original_inputs.Advicee",
          agent: "agent-1",
          identity: 1,
          agent_seed: 7,
          workload: some(backgroundProfile)
        }
      ]),
      jev_delay: 5,
      finish_wait: finishWait,
      output: { $: output },
      output_delay: 9,
      output_lease: 20,
      outcomes: { ...base.configuration.outcomes, outcome: global }
    })
  const poll = (at: number, deadline: boolean) => ({
    $: "stop_original_inputs.Schedule",
    input: {
      $: "stop_original_inputs.CanonicalInput",
      at,
      event: {
        $: "Canonical.StopGroupPolled",
        group: 1,
        lifetime: 1,
        round: 1,
        scopes: bendList([{ $: "Canonical.StopScope", partition: 1, round: 1 }]),
        deadline,
        extra_pending: false,
        continuations: 0
      }
    }
  })
  return [
    base,
    scenario(configured({ jev_delay: 9 }), [edit(0), finish(3)], [advance(3), advance(11), advance(20)]),
    scenario(configured({ jev_delay: 10 }), [edit(0), finish(3)], [advance(3), advance(11), advance(20)]),
    scenario(
      configured({ jev_delay: 1, preparation_delay: 12, finish_wait: 2 }),
      [edit(0), finish(1)],
      [advance(1), advance(3), advance(20)]
    ),
    scenario(base.configuration, [finish(0), finish(1)], [advance(0, 1), advance(1, 1)]),
    scenario(base.configuration, [edit(0), finish(3), finish(3)], [advance(3), advance(10), advance(20)]),
    scenario(
      backgroundConfiguration("OutputScenario.Certain"),
      [edit(0), finish(8)],
      [advance(7), advance(8), advance(16), advance(40)]
    ),
    scenario(
      backgroundConfiguration("OutputScenario.Uncertain"),
      [edit(0), finish(8)],
      [advance(7), advance(8), advance(16), advance(40)]
    ),
    scenario(
      configured({
        advicees: bendList([
          {
            $: "stop_original_inputs.Advicee",
            agent: "agent-1",
            identity: 1,
            agent_seed: 7,
            workload: some(backgroundProfile)
          }
        ])
      }),
      [finish(0, none, true)],
      [advance(0, 1), advance(1, 1)]
    ),
    scenario(
      backgroundConfiguration("OutputScenario.Certain", none, 200),
      [edit(0, none, finding)],
      [advance(7), poll(8, false), advance(8), poll(9, true), advance(9), advance(20)]
    ),
    scenario(
      configured({
        advicees: bendList([
          {
            $: "stop_original_inputs.Advicee",
            agent: "a",
            identity: 1,
            agent_seed: 7,
            workload: some(profile(7, [97]))
          },
          {
            $: "stop_original_inputs.Advicee",
            agent: "b",
            identity: 2,
            agent_seed: 2654435768,
            workload: some(profile(2654435768, [98]))
          }
        ]),
        jev_delay: 5,
        finish_wait: 10,
        output: { $: "OutputScenario.Certain" },
        output_delay: 9,
        output_lease: 20,
        outcomes: { ...base.configuration.outcomes, outcome: none }
      }),
      [edit(0, some("a"), clear), edit(0, some("b"), finding), finish(8, some("a"))],
      [advance(7, 200), advance(8, 200), advance(20, 200)]
    )
  ]
}

const originalFixture = new URL("../../monkey-business-bend/conformance/stop-original-scenarios.bend", import.meta.url)
it("compares all eleven original Stop emitted/public/replay scenarios", () => {
  const expected = originalStopPublicCases(),
    frozen = originalNativeFamilyInputs()
  compareOriginalStopFamilyTrace(
    decodeNativePrefix(runWorkloadEmitted(originalFixture), "stop_scenarios"),
    expected,
    frozen
  )
}, 30000)
// C45 + clang90 + native5 + JS15/5 + cleanup15 =175 seconds.
it("compares all eleven original Stop full native/emitted/public/replay scenarios", () => {
  const expected = originalStopPublicCases(),
    frozen = originalNativeFamilyInputs()
  const native = runWorkloadNative(originalFixture, { emissionTimeoutMs: 45000, clangTimeoutMs: 90000 }),
    emitted = runWorkloadEmitted(originalFixture)
  expect(native).toEqual(emitted)
  for (const result of [native, emitted])
    compareOriginalStopFamilyTrace(decodeNativePrefix(result, "stop_scenarios"), expected, frozen)
}, 175000)

// Frozen independent caller declarations for the twelve existing output cases.
export function originalNativeStopOutputFamilyInputs() {
  const some = (value: unknown) => ({ $: "Some", value }),
    none = { $: "None" }
  const initial = [
    { $: "stop_original_inputs.Edit", at: 0, agent: none, bytes: 10, units: bendList([5]), outcome: none },
    { $: "stop_original_inputs.Finish", at: 1, agent: none, recurring: false }
  ]
  const advance = (endpoint: number, budget = 500) => ({ $: "stop_original_inputs.Advance", endpoint, budget })
  const outcome = (name: "Certain" | "Uncertain" | "Failed") => ({ $: "OutputScenario." + name })
  const config = (
    seed: number,
    retention: number,
    prep: number,
    backend: number,
    name: "Certain" | "Uncertain" | "Failed",
    delay: number,
    lease: number,
    bytes: number
  ) => ({
    ...originalNativeInput().configuration,
    seed,
    retention,
    advicees: bendList([
      { $: "stop_original_inputs.Advicee", agent: "agent-1", identity: 1, agent_seed: seed, workload: none }
    ]),
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
    preparation_delay: prep,
    jev_delay: backend,
    outcomes: { ...originalNativeInput().configuration.outcomes, outcome: some({ $: "Canonical.RequestFinding" }) },
    finish_wait: 50,
    output: outcome(name),
    output_delay: delay,
    output_lease: lease,
    candidate_bytes: some(bytes)
  })
  const scenario = (configuration: ReturnType<typeof config>, boundaries: unknown[], inputs: unknown[] = initial) => ({
    $: "stop_original_inputs.Scenario",
    configuration,
    inputs: bendList(inputs),
    boundaries: bendList(boundaries)
  })
  return [
    ...[10239, 10240, 10241].map((bytes) =>
      scenario(config(7, 1000, 2, 5, "Uncertain", 5, 20, bytes), [advance(7, 300), advance(20, 300)])
    ),
    scenario(config(7, 1000, 2, 5, "Failed", 5, 20, 10240), [advance(7, 300), advance(12, 300)]),
    scenario(config(7, 1000, 2, 5, "Uncertain", 5, 20, 10240), [
      advance(7, 300),
      { $: "stop_original_inputs.MismatchedTerminal", at: 8, agent: none },
      advance(8, 300),
      advance(12, 300)
    ]),
    ...(
      [
        [7, 2, 5, "Uncertain", 5, 30],
        [91001, 3, 7, "Failed", 6, 30],
        [4294967313, 1, 9, "Uncertain", 4, 30],
        [11, 2, 5, "Certain", 4, 5],
        [12, 2, 5, "Certain", 5, 5],
        [13, 2, 5, "Certain", 6, 5]
      ] as const
    ).map(([seed, prep, backend, name, delay, lease]) => {
      const ready = prep + backend,
        terminal = ready + (name === "Failed" ? delay : Math.min(delay, lease))
      return scenario(config(seed, 10000, prep, backend, name, delay, lease, 10240), [
        advance(ready),
        { $: "stop_original_inputs.OutputProfile", outcome: outcome("Certain"), delay: 1, lease: 1 },
        advance(terminal - 1),
        advance(terminal)
      ])
    }),
    scenario(
      config(91001, 10000, 2, 5, "Uncertain", 5, 30, 10240),
      [7, 12, 47, 52, 87, 92, 127, 132, 161, 167, 172].map((at) => advance(at)),
      Array.from({ length: 5 }, (_, i) => [
        { $: "stop_original_inputs.Edit", at: i * 40, agent: none, bytes: 10, units: bendList([5]), outcome: none },
        { $: "stop_original_inputs.Finish", at: i * 40 + 1, agent: none, recurring: false }
      ]).flat()
    )
  ]
}

const outputFixture = new URL(
  "../../monkey-business-bend/conformance/stop-output-original-scenarios.bend",
  import.meta.url
)
it("compares all twelve original output Stop emitted/public/replay scenarios", () => {
  const expected = originalStopOutputPublicCases(),
    frozen = originalNativeStopOutputFamilyInputs()
  compareOriginalStopOutputFamilyTrace(
    decodeNativePrefix(runWorkloadEmitted(outputFixture), "stop_scenarios"),
    expected,
    frozen
  )
}, 30000)
// C45 + clang90 + native5 + JS15/5 + cleanup15 =175 seconds.
it("compares all twelve original output Stop full native/emitted/public/replay scenarios", () => {
  const expected = originalStopOutputPublicCases(),
    frozen = originalNativeStopOutputFamilyInputs()
  const native = runWorkloadNative(outputFixture, { emissionTimeoutMs: 45000, clangTimeoutMs: 90000 }),
    emitted = runWorkloadEmitted(outputFixture)
  expect(native).toEqual(emitted)
  for (const result of [native, emitted])
    compareOriginalStopOutputFamilyTrace(decodeNativePrefix(result, "stop_scenarios"), expected, frozen)
}, 175000)

it("Stop business comparison ignores private Engine layout but rejects changed actual accounting", () => {
  const run = createRun({
    seed: 7,
    inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }],
    preparationDelay: 2,
    jevDelay: 8,
    outcome: "clear"
  })
  const before = run.runtimeSnapshot(),
    engine = readRecord(before.engine)
  const business = bendList([
    {
      $: "stop_observed_wire.BusinessState",
      canonical: engine.canonical,
      finishes: readRecord(readRecord(engine.scenarios).stop).finishes
    }
  ])
  compareStopBusiness(
    business,
    { ...before, engine: { ...engine, privateDiagnostic: "different representation" } },
    "test original boundary"
  )
  run.advance({ untilTime: 0, maxEvents: 100 })
  expect(() => compareStopBusiness(business, run.runtimeSnapshot(), "test actual changed boundary")).toThrow(
    "Stop public business layer differs at test actual changed boundary Canonical accounting"
  )
})
