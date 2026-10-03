import { expect, it } from "vitest";
import { runWorkloadNative, WORKLOAD_CONFORMANCE_TIMEOUT_MS } from "../../monkey-business-bend/conformance/workload-native-runner.mjs";

it("keeps exact committed native batch membership and uses one atomic settlement", () => {
  expect(runWorkloadNative(new URL("../../monkey-business-bend/conformance/output-batch-facts.bend", import.meta.url))).toEqual([
    [1, 5, 3, 4, 5, 6, 7, 9], [2, 5, 7, 6], [3, 5, 7, 6], [2, 5, 9, 6], [3, 5, 9, 6],
  ]);
}, WORKLOAD_CONFORMANCE_TIMEOUT_MS);


it("retains a dropped Finish receipt only for its exact authorized ordered slot", () => {
  expect(runWorkloadNative(new URL("../../monkey-business-bend/conformance/output-custody.bend", import.meta.url))).toEqual([[0, 1, 0, 0, 0]]);
}, WORKLOAD_CONFORMANCE_TIMEOUT_MS);
