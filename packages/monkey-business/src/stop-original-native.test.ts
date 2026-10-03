import { expect, it } from "vitest";
import { readBendList, readRecord } from "../../../src/canonical/boundary-schema.ts";
import { runWorkloadNative, runWorkloadEmitted } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";
import { decodeNativePrefix } from "./callback-native-prefix.ts";
import { compareOriginalWaitingStopTrace } from "./stop-native-boundary.ts";
import { originalWaitingStopPublic } from "./stop-original-public.fixture.ts";

const bendList = (values: readonly unknown[]): unknown => values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const none = { $: "None" };
// Independent original input declaration. No issued events or recorded public
// trace are supplied to the native fixture or used as its configuration.
function originalNativeInput() {
  return { $: "stop_original_inputs.Scenario", configuration: { $: "stop_original_inputs.Configuration",
    seed: 7, identity: 1, agent_seed: 7, retention: 1000,
    limits: { $: "Ledger.Limits", global_items: 32, global_bytes: 100000, partition_items: 16, partition_bytes: 50000 },
    tree: { $: "TreeFacts.Profile", min_files: 1, max_files: 1, max_imports: 0, max_depth: 3,
      denied_percent: 15, missing_percent: 0, unreadable_percent: 0, repeated_percent: 0, cyclic_percent: 0,
      unsupported_percent: 0, deadline_step: 0, local_work: 0, min_source: 100, max_source: 100, min_tree: 20, max_tree: 20 },
    graph: { $: "ImportGraph.Limits", version: 1, source_bytes: 262144, tree_bytes: 20480, files: 8,
      read_bytes: 1572864, outgoing_edges: 16, depth: 4, work: 128 },
    preparation_delay: 2, jev_delay: 8, outcome: { $: "Canonical.RequestClear" }, finish_wait: 8,
    output: { $: "OutputScenario.Certain" }, output_delay: 0, output_lease: 30000, candidate_bytes: none, collectors: none },
    inputs: bendList([{ $: "stop_original_inputs.Edit", at: 0, bytes: 10, units: bendList([5]) },
      { $: "stop_original_inputs.Finish", at: 3, recurring: false }]),
    boundaries: bendList([3, 10, 20].map(endpoint => ({ $: "stop_original_inputs.Advance", endpoint, budget: 100 }))) };
}
function originalInput(value: unknown) {
  const envelopes = readBendList(value, readRecord, 1);
  if (envelopes.length !== 1) throw new Error("original Stop envelope count changed");
  const traces = readBendList(envelopes[0]?.traces, readRecord, 1);
  if (traces.length !== 1) throw new Error("original Stop scenario count changed");
  return traces[0]?.input;
}

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
