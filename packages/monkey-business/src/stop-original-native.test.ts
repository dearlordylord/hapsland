import { expect, it } from "vitest";
import { readBendList, readRecord } from "../../../src/canonical/boundary-schema.ts";
import { runWorkloadNative, runWorkloadEmitted } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";
import { decodeNativePrefix } from "./callback-native-prefix.ts";
import { compareOriginalWaitingStopTrace, compareOriginalStopFamilyTrace } from "./stop-native-boundary.ts";
import { originalWaitingStopPublic, originalStopPublicCases } from "./stop-original-public.fixture.ts";

const bendList = (values: readonly unknown[]): unknown => values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const none = { $: "None" };
// Independent original input declaration. No issued events or recorded public
// trace are supplied to the native fixture or used as its configuration.
function originalNativeInput() {
  return { $: "stop_original_inputs.Scenario", configuration: { $: "stop_original_inputs.Configuration",
    seed: 7, advicees: bendList([{ $: "stop_original_inputs.Advicee", agent: "agent-1", identity: 1, agent_seed: 7, workload: none }]), retention: 1000,
    limits: { $: "Ledger.Limits", global_items: 32, global_bytes: 100000, partition_items: 16, partition_bytes: 50000 },
    tree: { $: "TreeFacts.Profile", min_files: 1, max_files: 1, max_imports: 0, max_depth: 3,
      denied_percent: 15, missing_percent: 0, unreadable_percent: 0, repeated_percent: 0, cyclic_percent: 0,
      unsupported_percent: 0, deadline_step: 0, local_work: 0, min_source: 100, max_source: 100, min_tree: 20, max_tree: 20 },
    graph: { $: "ImportGraph.Limits", version: 1, source_bytes: 262144, tree_bytes: 20480, files: 8,
      read_bytes: 1572864, outgoing_edges: 16, depth: 4, work: 128 },
    preparation_delay: 2, jev_delay: 8, outcomes: { $: "Driver.OutcomeEnvironment",
      outcome: { $: "Some", value: { $: "Canonical.RequestClear" } },
      weights: bendList([0,1078525952,1078525952,0,0,0].map(high => ({ $: "Numeric.Words", high, low: 0 }))) }, finish_wait: 8,
    output: { $: "OutputScenario.Certain" }, output_delay: 0, output_lease: 30000, candidate_bytes: none, collectors: none },
    inputs: bendList([{ $: "stop_original_inputs.Edit", at: 0, agent: none, bytes: 10, units: bendList([5]), outcome: none },
      { $: "stop_original_inputs.Finish", at: 3, agent: none, recurring: false }]),
    boundaries: bendList([3, 10, 20].map(endpoint => ({ $: "stop_original_inputs.Advance", endpoint, budget: 100 }))) };
}
function originalInput(value: unknown) {
  const envelopes = readBendList(value, readRecord, 1);
  if (envelopes.length !== 1) throw new Error("original Stop envelope count changed");
  const traces = readBendList(envelopes[0]?.traces, readRecord, 1);
  if (traces.length !== 1) throw new Error("original Stop scenario count changed");
  return traces[0]?.input;
}

// Finite aggregate allowance: C30s + clang30s + native5s + two independent
// (JS emission15s + execution5s) runs =105s, plus15s process cleanup.
// Each maintained runner phase retains its own limit; runtime remains5s.
it("compares original waiting Stop full native/emitted/public/replay boundaries", () => {
  const fixture = new URL("../../monkey-business-bend/conformance/stop-original-waiting.bend", import.meta.url);
  const expected = originalWaitingStopPublic();
  const native = runWorkloadNative(fixture);
  const emitted = runWorkloadEmitted(fixture), independentlyEmitted = runWorkloadEmitted(fixture);
  // Entire lossless vectors and recursively generated DTOs, including inactive
  // fallback payloads, receipts, all owner state fields and pending queue items.
  expect(native).toEqual(emitted);
  expect(independentlyEmitted).toEqual(emitted);
  for (const result of [native, emitted, independentlyEmitted]) {
    const envelope = decodeNativePrefix(result, "stop_scenarios");
    expect(originalInput(envelope)).toEqual(originalNativeInput());
    compareOriginalWaitingStopTrace(envelope, expected);
  }
}, 120000);

// Independently frozen native declarations for the original eleven cases.
// None describes an omitted edit override, independently of configured result.
function originalNativeFamilyInputs() {
  const some = (value: unknown) => ({ $: "Some", value });
  const edit = (at: number, agent: unknown = none, outcome: unknown = none) => ({ $: "stop_original_inputs.Edit", at, agent, bytes: 10, units: bendList([5]), outcome });
  const finish = (at: number, agent: unknown = none, recurring = false) => ({ $: "stop_original_inputs.Finish", at, agent, recurring });
  const advance = (endpoint: number, budget = 100) => ({ $: "stop_original_inputs.Advance", endpoint, budget });
  const profile = (seed: number, codes: readonly number[]) => ({ $: "Workload.Profile", settings: {
    $: "Session.Settings", interval: 1000000, variation: 0, edits: 1000, pause: 500, response: 0, repairDelay: 300 },
    seed, codes: bendList(codes), bytes: 100, units: bendList([100]), duration: none });
  const backgroundProfile = profile(7,[97,103,101,110,116,45,49]);
  const base = originalNativeInput();
  const finding = some({ $: "Canonical.RequestFinding" }), clear = some({ $: "Canonical.RequestClear" });
  const configured = (changes: object) => ({ ...base.configuration, ...changes });
  const scenario = (configuration: typeof base.configuration, inputs: readonly unknown[], boundaries: readonly unknown[]) => ({ $: "stop_original_inputs.Scenario", configuration, inputs: bendList(inputs), boundaries: bendList(boundaries) });
  const backgroundConfiguration = (output: string, global: unknown = finding, finishWait = 10) => configured({
    advicees: bendList([{ $: "stop_original_inputs.Advicee", agent: "agent-1", identity: 1, agent_seed: 7, workload: some(backgroundProfile) }]),
    jev_delay: 5, finish_wait: finishWait, output: { $: output }, output_delay: 9, output_lease: 20,
    outcomes: { ...base.configuration.outcomes, outcome: global },
  });
  const poll = (at: number, deadline: boolean) => ({ $: "stop_original_inputs.Schedule", input: {
    $: "stop_original_inputs.CanonicalInput", at, event: { $: "Canonical.StopGroupPolled", group: 1, lifetime: 1, round: 1,
      scopes: bendList([{ $: "Canonical.StopScope", partition: 1, round: 1 }]), deadline, extra_pending: false, continuations: 0 } } });
  return [base,
    scenario(configured({ jev_delay: 9 }),[edit(0),finish(3)],[advance(3),advance(11),advance(20)]),
    scenario(configured({ jev_delay: 10 }),[edit(0),finish(3)],[advance(3),advance(11),advance(20)]),
    scenario(configured({ jev_delay: 1, preparation_delay: 12, finish_wait: 2 }),[edit(0),finish(1)],[advance(1),advance(3),advance(20)]),
    scenario(base.configuration,[finish(0),finish(1)],[advance(0,1),advance(1,1)]),
    scenario(base.configuration,[edit(0),finish(3),finish(3)],[advance(3),advance(10),advance(20)]),
    scenario(backgroundConfiguration("OutputScenario.Certain"),[edit(0),finish(8)],[advance(7),advance(8),advance(16),advance(40)]),
    scenario(backgroundConfiguration("OutputScenario.Uncertain"),[edit(0),finish(8)],[advance(7),advance(8),advance(16),advance(40)]),
    scenario(configured({ advicees: bendList([{ $: "stop_original_inputs.Advicee", agent: "agent-1", identity: 1, agent_seed: 7, workload: some(backgroundProfile) }]) }),[finish(0,none,true)],[advance(0,1),advance(1,1)]),
    scenario(backgroundConfiguration("OutputScenario.Certain",none,200),[edit(0,none,finding)],[advance(7),poll(8,false),advance(8),poll(9,true),advance(9),advance(20)]),
    scenario(configured({ advicees: bendList([
      { $: "stop_original_inputs.Advicee", agent: "a", identity: 1, agent_seed: 7, workload: some(profile(7,[97])) },
      { $: "stop_original_inputs.Advicee", agent: "b", identity: 2, agent_seed: 2654435768, workload: some(profile(2654435768,[98])) },
    ]), jev_delay: 5, finish_wait: 10, output: { $: "OutputScenario.Certain" }, output_delay: 9, output_lease: 20,
      outcomes: { ...base.configuration.outcomes, outcome: none } }),
    [edit(0,some("a"),clear),edit(0,some("b"),finding),finish(8,some("a"))],[advance(7,200),advance(8,200),advance(20,200)]),
  ];
}

// Same finite105s compiler/runtime phase sum plus15s cleanup as first waiting;
// the scenario family increases assertions, not individual execution limits.
it("compares all eleven original Stop full native/emitted/public/replay scenarios", () => {
  const fixture = new URL("../../monkey-business-bend/conformance/stop-original-scenarios.bend",import.meta.url);
  const expected = originalStopPublicCases(), frozen = originalNativeFamilyInputs();
  const native = runWorkloadNative(fixture), emitted = runWorkloadEmitted(fixture), independentlyEmitted = runWorkloadEmitted(fixture);
  expect(native).toEqual(emitted);
  expect(independentlyEmitted).toEqual(emitted);
  for (const result of [native,emitted,independentlyEmitted]) compareOriginalStopFamilyTrace(decodeNativePrefix(result,"stop_scenarios"),expected,frozen);
},120000);
